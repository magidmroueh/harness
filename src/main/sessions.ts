import { execSync, execFile } from "child_process";
import { createHash } from "crypto";
import { promisify } from "util";
import type { ProviderId } from "./providers";
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
  provider: ProviderId;
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
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const CURSOR_CHATS_DIR = join(homedir(), ".cursor", "chats");
const CURSOR_PROJECTS_DIR = join(homedir(), ".cursor", "projects");

const execFileAsync = promisify(execFile);

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
        provider: "claude",
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

  /** List all recent sessions for a provider (defaults to claude). */
  async listAll(provider: ProviderId = "claude"): Promise<Session[]> {
    if (provider === "codex") return listAllCodex();
    if (provider === "cursor") return listAllCursor();
    return this.listAllClaude();
  }

  /** List all recent Claude sessions from project dirs (both running and past) */
  private async listAllClaude(): Promise<Session[]> {
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
                provider: "claude",
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

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Walk ~/.codex/sessions/YYYY/MM/DD/ to find rollout-*.jsonl files. */
function findCodexRolloutFiles(): string[] {
  const files: string[] = [];
  for (const year of safeReaddir(CODEX_SESSIONS_DIR)) {
    const yearDir = join(CODEX_SESSIONS_DIR, year);
    for (const month of safeReaddir(yearDir)) {
      const monthDir = join(yearDir, month);
      for (const day of safeReaddir(monthDir)) {
        const dayDir = join(monthDir, day);
        for (const file of safeReaddir(dayDir)) {
          if (file.endsWith(".jsonl")) files.push(join(dayDir, file));
        }
      }
    }
  }
  return files;
}

function cleanLabel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) return "";
  return trimmed.slice(0, 80);
}

interface CodexMeta {
  id: string;
  cwd: string;
  branch: string;
  startedAt: number;
  model: string;
  label: string;
  lastActivity: number;
}

async function readCodexMeta(file: string): Promise<CodexMeta | null> {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(file);
  } catch {
    return null;
  }

  const meta: CodexMeta = {
    id: "",
    cwd: "",
    branch: "",
    startedAt: 0,
    model: "Codex",
    label: "",
    lastActivity: stat.mtimeMs,
  };

  const stream = createReadStream(file, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let lineCount = 0;

  try {
    for await (const line of rl) {
      if (lineCount > 40) break;
      lineCount++;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "session_meta" && obj.payload) {
          meta.id = obj.payload.id || meta.id;
          meta.cwd = obj.payload.cwd || meta.cwd;
          meta.branch = obj.payload.git?.branch || meta.branch;
          if (obj.payload.timestamp) {
            meta.startedAt = Date.parse(obj.payload.timestamp) || meta.startedAt;
          }
        } else if (obj.type === "turn_context" && obj.payload?.model) {
          meta.model = obj.payload.model;
        } else if (
          !meta.label &&
          obj.type === "response_item" &&
          obj.payload?.type === "message" &&
          obj.payload?.role === "user"
        ) {
          const content = obj.payload.content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c?.type === "input_text" && typeof c.text === "string") {
                const label = cleanLabel(c.text);
                if (label) {
                  meta.label = label;
                  break;
                }
              }
            }
          }
        }
      } catch {}
    }
  } finally {
    stream.destroy();
  }

  if (!meta.id) return null;
  return meta;
}

async function listAllCodex(): Promise<Session[]> {
  const files = findCodexRolloutFiles();
  const metas = await Promise.all(files.map(readCodexMeta));
  const sessions: Session[] = [];

  for (const meta of metas) {
    if (!meta || !meta.cwd) continue;
    sessions.push({
      id: meta.id,
      pid: 0,
      provider: "codex",
      label: meta.label || meta.id.slice(0, 8),
      name: basename(meta.cwd),
      cwd: meta.cwd,
      branch: meta.branch || getBranch(meta.cwd),
      status: "idle",
      model: meta.model,
      cost: 0,
      startedAt: meta.startedAt || meta.lastActivity,
      lastActivity: meta.lastActivity,
      sessionId: meta.id,
      entrypoint: "cli",
      packageManager: detectPackageManager(meta.cwd),
    });
  }

  sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  return sessions;
}

/**
 * Cursor stores chats under `~/.cursor/chats/<md5(cwd)>/<chatId>/store.db`.
 * To enumerate sessions we walk `~/.cursor/projects/<slug>/` to learn about
 * workspaces Cursor has seen, reconstruct the absolute cwd from the slug,
 * md5 it, and read each chat folder under that hash.
 */
function resolveCursorProjectSlug(slug: string): string | null {
  // Hyphens in a slug may represent either path separators or literal `-` in
  // a path segment. DFS: at each `-` try `/` (if the accumulated prefix
  // exists) before falling back to a literal hyphen.
  function dfs(parent: string, seg: string, rest: string): string | null {
    if (!rest) {
      const full = `${parent}/${seg}`;
      return existsSync(full) ? full : null;
    }
    if (rest[0] === "-") {
      const candidate = `${parent}/${seg}`;
      if (existsSync(candidate)) {
        const r = dfs(candidate, "", rest.slice(1));
        if (r) return r;
      }
      return dfs(parent, seg + "-", rest.slice(1));
    }
    return dfs(parent, seg + rest[0], rest.slice(1));
  }
  return dfs("", "", slug);
}

interface CursorChatMeta {
  agentId: string;
  name?: string;
  mode?: string;
  createdAt?: number;
  lastUsedModel?: string;
}

async function readCursorChatMeta(dbPath: string): Promise<CursorChatMeta | null> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/sqlite3",
      [dbPath, "SELECT value FROM meta LIMIT 1;"],
      { maxBuffer: 1_000_000 },
    );
    const hex = stdout.trim();
    if (!hex) return null;
    const json = Buffer.from(hex, "hex").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed?.agentId) return null;
    return parsed as CursorChatMeta;
  } catch {
    return null;
  }
}

async function readChatMtime(dbPath: string): Promise<number> {
  try {
    return statSync(dbPath).mtimeMs;
  } catch {
    return 0;
  }
}

async function listAllCursor(): Promise<Session[]> {
  const workspaces = safeReaddir(CURSOR_PROJECTS_DIR)
    .map(resolveCursorProjectSlug)
    .filter((cwd): cwd is string => cwd !== null)
    .map((cwd) => {
      const hash = createHash("md5").update(cwd).digest("hex");
      return { cwd, chatDir: join(CURSOR_CHATS_DIR, hash) };
    });

  const sessions: Session[] = [];
  await Promise.all(
    workspaces.map(async ({ cwd, chatDir }) => {
      const chatIds = safeReaddir(chatDir);
      if (chatIds.length === 0) return;

      const name = basename(cwd);
      const branch = getBranch(cwd);
      const packageManager = detectPackageManager(cwd);

      const dbPaths = chatIds.map((id) => join(chatDir, id, "store.db"));
      const [metas, mtimes] = await Promise.all([
        Promise.all(dbPaths.map(readCursorChatMeta)),
        Promise.all(dbPaths.map(readChatMtime)),
      ]);

      for (let i = 0; i < metas.length; i++) {
        const meta = metas[i];
        if (!meta) continue;
        const mtime = mtimes[i];
        sessions.push({
          id: meta.agentId,
          pid: 0,
          provider: "cursor",
          label: meta.name || meta.agentId.slice(0, 8),
          name,
          cwd,
          branch,
          status: "idle",
          model: meta.lastUsedModel || "Cursor",
          cost: 0,
          startedAt: meta.createdAt || mtime,
          lastActivity: mtime,
          sessionId: meta.agentId,
          entrypoint: "cli",
          packageManager,
        });
      }
    }),
  );

  sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  return sessions;
}
