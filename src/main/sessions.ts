import { execSync } from "child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  createReadStream,
  rmdirSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { createInterface } from "readline";

export interface Session {
  id: string;
  pid: number;
  label: string;
  name: string;
  cwd: string;
  branch: string;
  status: "idle" | "active" | "working" | "error";
  model: string;
  cost: number;
  startedAt: number;
  lastActivity: number;
  sessionId: string;
  entrypoint: string;
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
}

const CLAUDE_DIR = join(homedir(), ".claude");
const SESSIONS_DIR = join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function projectSlugToCwd(slug: string): string {
  return slug.replace(/^-/, "/").replace(/-/g, "/");
}

function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

function getBranch(cwd: string): string {
  try {
    return (
      execSync("git branch --show-current", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim() || "main"
    );
  } catch {
    return "—";
  }
}

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

/** Read session JSONL to extract first user prompt, model, branch */
async function readSessionMeta(
  projectSlug: string,
  sessionId: string,
): Promise<{
  label: string;
  model: string;
  branch: string;
  cwd: string;
  lastActivity: number;
}> {
  const jsonlPath = join(PROJECTS_DIR, projectSlug, `${sessionId}.jsonl`);
  const result = {
    label: "",
    model: "Opus 4.6 (1M context)",
    branch: "",
    cwd: "",
    lastActivity: 0,
  };

  try {
    const stat = statSync(jsonlPath);
    result.lastActivity = stat.mtimeMs;

    const stream = createReadStream(jsonlPath, { encoding: "utf-8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let lineCount = 0;

    for await (const line of rl) {
      if (lineCount > 20) break;
      lineCount++;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "summary" && obj.snapshot?.model) {
          result.model = obj.snapshot.model;
        }
        if (obj.message?.model) result.model = obj.message.model;
        if (obj.gitBranch) result.branch = obj.gitBranch;
        if (!result.cwd && obj.cwd) result.cwd = obj.cwd;
        // Extract first user prompt as label
        if (!result.label && obj.type === "user" && obj.message?.content) {
          const content = obj.message.content;
          if (typeof content === "string") {
            result.label = content.slice(0, 80);
          } else if (Array.isArray(content)) {
            for (const c of content) {
              if (c?.type === "text" && c.text) {
                result.label = c.text.slice(0, 80);
                break;
              }
            }
          }
        }
      } catch {}
    }
    stream.destroy();
  } catch {}

  return result;
}

export class SessionManager {
  /** Discover all live Claude Code sessions from ~/.claude/sessions/ */
  async discover(): Promise<Session[]> {
    // Deduplicate by sessionId — multiple PIDs can share one sessionId
    // (e.g. when `claude --resume` is used). Keep the earliest (original) PID.
    const bySessionId = new Map<
      string,
      {
        pid: number;
        sessionId: string;
        cwd: string;
        startedAt: number;
        kind: string;
        entrypoint: string;
      }
    >();

    try {
      const files = readdirSync(SESSIONS_DIR);

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = join(SESSIONS_DIR, file);
        const raw = readFileSync(filePath, "utf-8");
        const data = JSON.parse(raw) as {
          pid: number;
          sessionId: string;
          cwd: string;
          startedAt: number;
          kind: string;
          entrypoint: string;
        };

        if (!isProcessRunning(data.pid)) continue;

        const existing = bySessionId.get(data.sessionId);
        if (!existing || data.startedAt < existing.startedAt) {
          bySessionId.set(data.sessionId, data);
        }
      }
    } catch (e) {
      console.error("Failed to discover sessions:", e);
    }

    const sessions: Session[] = [];
    for (const data of bySessionId.values()) {
      const projectSlug = cwdToProjectSlug(data.cwd);
      const name = basename(data.cwd);
      const meta = await readSessionMeta(projectSlug, data.sessionId);

      sessions.push({
        id: data.sessionId,
        pid: data.pid,
        label: meta.label || data.sessionId.slice(0, 8),
        name,
        cwd: data.cwd,
        branch: meta.branch || getBranch(data.cwd),
        status: "idle",
        model: meta.model,
        cost: 0,
        startedAt: data.startedAt,
        lastActivity: meta.lastActivity || data.startedAt,
        sessionId: data.sessionId,
        entrypoint: data.entrypoint || "cli",
        packageManager: detectPackageManager(data.cwd),
      });
    }

    return sessions;
  }

  /** List all recent sessions from project dirs (both running and past) */
  async listAll(): Promise<Session[]> {
    const sessions: Session[] = [];
    const runningPids = new Set<string>();

    // First get running sessions
    try {
      const files = readdirSync(SESSIONS_DIR);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = readFileSync(join(SESSIONS_DIR, file), "utf-8");
          const data = JSON.parse(raw);
          if (isProcessRunning(data.pid)) {
            runningPids.add(data.sessionId);
          }
        } catch {}
      }
    } catch {}

    // Then scan project directories for recent sessions
    try {
      const projects = readdirSync(PROJECTS_DIR);

      for (const projectSlug of projects) {
        const projectDir = join(PROJECTS_DIR, projectSlug);
        try {
          const stat = statSync(projectDir);
          if (!stat.isDirectory()) continue;
        } catch {
          continue;
        }

        const slugCwd = projectSlugToCwd(projectSlug);

        try {
          const projectFiles = readdirSync(projectDir);
          const jsonlFiles = projectFiles.filter((f) => f.endsWith(".jsonl"));

          for (const jsonl of jsonlFiles) {
            const sessionId = basename(jsonl, ".jsonl");
            const jsonlPath = join(projectDir, jsonl);

            try {
              const fileStat = statSync(jsonlPath);
              const isRunning = runningPids.has(sessionId);
              const meta = await readSessionMeta(projectSlug, sessionId);

              // Use the real cwd from the JSONL, fall back to slug-decoded path
              const cwd = meta.cwd || slugCwd;
              const name = basename(cwd);

              sessions.push({
                id: sessionId,
                pid: 0,
                label: meta.label || sessionId.slice(0, 8),
                name,
                cwd,
                branch: meta.branch || getBranch(cwd),
                status: isRunning ? "active" : "idle",
                model: meta.model,
                cost: 0,
                startedAt: fileStat.birthtimeMs,
                lastActivity: meta.lastActivity || fileStat.mtimeMs,
                sessionId,
                entrypoint: "cli",
                packageManager: detectPackageManager(cwd),
              });
            } catch {}
          }
        } catch {}
      }
    } catch {}

    // Sort by last activity, most recent first
    sessions.sort((a, b) => b.lastActivity - a.lastActivity);

    return sessions;
  }

  /** Fully delete a session — removes JSONL, session-env, and any running PID file */
  delete(opts: { cwd: string; sessionId: string }): boolean {
    const projectSlug = cwdToProjectSlug(opts.cwd);
    let deleted = false;

    // 1. Delete the conversation JSONL
    try {
      unlinkSync(join(PROJECTS_DIR, projectSlug, `${opts.sessionId}.jsonl`));
      deleted = true;
    } catch {}

    // 2. Delete session-env directory
    const sessionEnvDir = join(CLAUDE_DIR, "session-env", opts.sessionId);
    try {
      const files = readdirSync(sessionEnvDir);
      for (const f of files) unlinkSync(join(sessionEnvDir, f));
      rmdirSync(sessionEnvDir);
    } catch {}

    // 3. Remove any PID session file that references this sessionId
    try {
      const pidFiles = readdirSync(SESSIONS_DIR);
      for (const f of pidFiles) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = readFileSync(join(SESSIONS_DIR, f), "utf-8");
          const data = JSON.parse(raw);
          if (data.sessionId === opts.sessionId) {
            // Kill the process if still running
            try {
              process.kill(data.pid);
            } catch {}
            unlinkSync(join(SESSIONS_DIR, f));
          }
        } catch {}
      }
    } catch {}

    return deleted;
  }
}
