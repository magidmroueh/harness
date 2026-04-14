import { EventEmitter } from "events";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  watch,
  FSWatcher,
} from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { shell } from "electron";

import type { ProviderId } from "./providers";

export type ConfigKind = "skill" | "agent" | "command" | "claudemd";
export type ConfigScope = "global" | "project";
export type ConfigProvider = ProviderId;

export type ConfigEntry = {
  kind: ConfigKind;
  scope: ConfigScope;
  name: string;
  path: string;
  frontmatter: Record<string, unknown>;
  description?: string;
  hasResources?: boolean;
  folderPath?: string;
};

export type ConfigFileDetail = ConfigEntry & {
  body: string;
  resources?: string[];
};

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateName(name: string): void {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(`Invalid name: ${name}`);
  }
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid name: ${name} — must match [a-zA-Z0-9._-]+`);
  }
}

const PROVIDER_DIR: Record<ConfigProvider, string> = {
  claude: ".claude",
  codex: ".codex",
  cursor: ".cursor",
};

function providerGlobalDir(provider: ConfigProvider): string {
  return join(homedir(), PROVIDER_DIR[provider]);
}

function providerProjectDir(provider: ConfigProvider, cwd: string): string {
  return join(cwd, PROVIDER_DIR[provider]);
}

function instructionsFilename(provider: ConfigProvider): string {
  return provider === "claude" ? "CLAUDE.md" : "AGENTS.md";
}

// Cursor is the odd one out: `skills-cursor/` globally but `skills/` per project.
function skillsSubdir(provider: ConfigProvider, scope: ConfigScope): string {
  if (provider === "cursor" && scope === "global") return "skills-cursor";
  return "skills";
}

function scopeRoot(provider: ConfigProvider, scope: ConfigScope, cwd: string | null): string {
  if (scope === "global") return providerGlobalDir(provider);
  if (!cwd) throw new Error("cwd required for project scope");
  return providerProjectDir(provider, cwd);
}

/**
 * Minimal YAML-ish frontmatter parser.
 *
 * Supports:
 * - `key: value` (string, quoted or unquoted)
 * - `key: [a, b, c]` (flow arrays of strings)
 * - `key: true` / `false` / numeric literals (kept as string if ambiguous)
 *
 * Anything more complex (nested, block arrays) is not supported — values are
 * kept as strings. The `raw` frontmatter block is captured so the renderer can
 * display the original text if needed.
 */
function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
} {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text, raw: "" };
  }
  const afterFirst = text.indexOf("\n") + 1;
  const endMarker = text.indexOf("\n---", afterFirst);
  if (endMarker === -1) {
    return { frontmatter: {}, body: text, raw: "" };
  }
  const raw = text.slice(afterFirst, endMarker);
  // Advance past `\n---`, the closing line's newline, AND a single
  // separator blank line (the one the writer always inserts between
  // frontmatter and body). Skipping both keeps round-trips stable.
  let bodyStart = endMarker + 4;
  if (text[bodyStart] === "\r") bodyStart++;
  if (text[bodyStart] === "\n") bodyStart++;
  if (text[bodyStart] === "\r") bodyStart++;
  if (text[bodyStart] === "\n") bodyStart++;
  const body = text.slice(bodyStart);

  const frontmatter: Record<string, unknown> = {};
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    const rest = line.slice(colon + 1).trim();
    frontmatter[key] = parseScalar(rest);
  }
  return { frontmatter, body, raw };
}

function parseScalar(v: string): unknown {
  if (v === "") return "";
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => unquote(x.trim()));
  }
  return unquote(v);
}

function unquote(v: string): string {
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function needsQuote(v: string): boolean {
  if (v === "") return true;
  return /[:#\n"'\\]/.test(v) || v !== v.trim();
}

function serializeScalar(v: unknown): string {
  if (Array.isArray(v)) {
    return "[" + v.map((x) => serializeScalar(x)).join(", ") + "]";
  }
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (needsQuote(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const keys = Object.keys(fm);
  if (keys.length === 0) return "";
  const lines: string[] = ["---"];
  for (const k of keys) {
    lines.push(`${k}: ${serializeScalar(fm[k])}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function listMarkdown(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
}

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => {
      try {
        return statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function resolvePath(
  provider: ConfigProvider,
  kind: ConfigKind,
  scope: ConfigScope,
  name: string,
  cwd: string | null,
): { file: string; folder?: string } {
  if (kind === "claudemd") {
    const file = instructionsFilename(provider);
    if (scope === "global") return { file: join(providerGlobalDir(provider), file) };
    if (!cwd) throw new Error(`cwd required for project ${file}`);
    return { file: join(cwd, file) };
  }
  if (provider !== "claude" && (kind === "agent" || kind === "command")) {
    throw new Error(`${provider} does not support ${kind}s`);
  }
  validateName(name);
  const root = scopeRoot(provider, scope, cwd);
  if (kind === "skill") {
    const folder = join(root, skillsSubdir(provider, scope), name);
    return { file: join(folder, "SKILL.md"), folder };
  }
  if (kind === "agent") {
    return { file: join(root, "agents", `${name}.md`) };
  }
  return { file: join(root, "commands", `${name}.md`) };
}

function readEntry(
  kind: ConfigKind,
  scope: ConfigScope,
  name: string,
  file: string,
  folder?: string,
): ConfigEntry | null {
  try {
    const text = readFileSync(file, "utf-8");
    const { frontmatter } = parseFrontmatter(text);
    const description =
      typeof frontmatter.description === "string" ? frontmatter.description : undefined;
    const entry: ConfigEntry = {
      kind,
      scope,
      name,
      path: file,
      frontmatter,
      description,
    };
    if (kind === "skill" && folder) {
      entry.folderPath = folder;
      try {
        const contents = readdirSync(folder);
        entry.hasResources = contents.some((f) => f !== "SKILL.md");
      } catch {
        entry.hasResources = false;
      }
    }
    return entry;
  } catch {
    return null;
  }
}

function listScope(
  provider: ConfigProvider,
  scope: ConfigScope,
  cwd: string | null,
): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  if (scope === "project" && !cwd) return entries;

  const root = scopeRoot(provider, scope, cwd);

  const skillsDir = join(root, skillsSubdir(provider, scope));
  for (const name of listDirs(skillsDir)) {
    // Codex ships built-in skills under `skills/.system/*` — hide them.
    if (provider === "codex" && name === ".system") continue;
    if (!NAME_RE.test(name)) continue;
    const folder = join(skillsDir, name);
    const file = join(folder, "SKILL.md");
    if (!existsSync(file)) continue;
    const e = readEntry("skill", scope, name, file, folder);
    if (e) entries.push(e);
  }

  if (provider === "claude") {
    const agentsDir = join(root, "agents");
    for (const f of listMarkdown(agentsDir)) {
      const name = f.replace(/\.md$/, "");
      if (!NAME_RE.test(name)) continue;
      const e = readEntry("agent", scope, name, join(agentsDir, f));
      if (e) entries.push(e);
    }

    const commandsDir = join(root, "commands");
    for (const f of listMarkdown(commandsDir)) {
      const name = f.replace(/\.md$/, "");
      if (!NAME_RE.test(name)) continue;
      const e = readEntry("command", scope, name, join(commandsDir, f));
      if (e) entries.push(e);
    }
  }

  const instructionsFile = instructionsFilename(provider);
  const instructionsPath =
    scope === "global"
      ? join(providerGlobalDir(provider), instructionsFile)
      : cwd
        ? join(cwd, instructionsFile)
        : null;
  if (instructionsPath && existsSync(instructionsPath)) {
    entries.push({
      kind: "claudemd",
      scope,
      name: instructionsFile,
      path: instructionsPath,
      frontmatter: {},
    });
  }

  return entries;
}

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function templateFor(
  kind: ConfigKind,
  name: string,
): { frontmatter: Record<string, unknown>; body: string } {
  if (kind === "skill") {
    return {
      frontmatter: { name, description: "", type: "skill" },
      body: `# ${name}\n\nDescribe what this skill does.\n`,
    };
  }
  if (kind === "agent") {
    return {
      frontmatter: { name, description: "" },
      body: `# ${name}\n\nDescribe what this agent does.\n`,
    };
  }
  if (kind === "command") {
    return {
      frontmatter: { name, description: "", "allowed-tools": [] },
      body: `# /${name}\n\nCommand instructions.\n`,
    };
  }
  return { frontmatter: {}, body: "# Project notes\n" };
}

export class ConfigManager extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.ensureRecursiveWatch(providerGlobalDir("claude"));
    this.ensureRecursiveWatch(providerGlobalDir("codex"));
    this.ensureRecursiveWatch(providerGlobalDir("cursor"));
  }

  private ensureRecursiveWatch(root: string): void {
    if (this.watchers.has(root)) return;
    try {
      mkdirSync(root, { recursive: true });
      const w = watch(root, { recursive: true }, () => this.scheduleEmit());
      w.on("error", () => {});
      this.watchers.set(root, w);
    } catch {}
  }

  private scheduleEmit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.emit("changed");
    }, 150);
  }

  /**
   * Watch only the project's provider config tree plus a non-recursive
   * watcher on the project root filtered to the instructions file —
   * avoids scanning node_modules and other large subtrees.
   */
  watchProject(cwd: string): void {
    if (!cwd) return;
    this.ensureRecursiveWatch(providerProjectDir("claude", cwd));
    this.ensureRecursiveWatch(providerProjectDir("codex", cwd));
    this.ensureRecursiveWatch(providerProjectDir("cursor", cwd));
    if (this.watchers.has(cwd)) return;
    try {
      const w = watch(cwd, { recursive: false }, (_event, filename) => {
        if (filename === "CLAUDE.md" || filename === "AGENTS.md") this.scheduleEmit();
      });
      w.on("error", () => {});
      this.watchers.set(cwd, w);
    } catch {}
  }

  async list(provider: ConfigProvider, cwd: string | null): Promise<ConfigEntry[]> {
    if (cwd) this.watchProject(cwd);
    const results: ConfigEntry[] = [];
    results.push(...listScope(provider, "global", null));
    if (cwd) results.push(...listScope(provider, "project", cwd));
    return results;
  }

  async read(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
  ): Promise<ConfigFileDetail> {
    const { file, folder } = resolvePath(provider, kind, scope, name, cwd);
    const text = readFileSync(file, "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    const description =
      typeof frontmatter.description === "string" ? frontmatter.description : undefined;
    const detail: ConfigFileDetail = {
      kind,
      scope,
      name,
      path: file,
      frontmatter: kind === "claudemd" ? {} : frontmatter,
      description,
      body: kind === "claudemd" ? text : body,
    };
    if (kind === "skill" && folder) {
      detail.folderPath = folder;
      try {
        const contents = readdirSync(folder);
        const resources = contents.filter((f) => f !== "SKILL.md");
        detail.resources = resources;
        detail.hasResources = resources.length > 0;
      } catch {
        detail.resources = [];
        detail.hasResources = false;
      }
    }
    return detail;
  }

  async write(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<void> {
    const { file } = resolvePath(provider, kind, scope, name, cwd);
    ensureDir(file);
    let content: string;
    if (kind === "claudemd") {
      content = body;
    } else {
      const fm = serializeFrontmatter(frontmatter);
      // Strip leading newlines from body so the separator stays exactly
      // one blank line — prevents accumulation across save cycles.
      const normalized = body.replace(/^[\r\n]+/, "");
      content = fm ? `${fm}\n${normalized}` : normalized;
    }
    writeFileSync(file, content, "utf-8");
  }

  async create(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
  ): Promise<ConfigFileDetail> {
    const { file } = resolvePath(provider, kind, scope, name, cwd);
    if (existsSync(file)) {
      throw new Error(`Already exists: ${file}`);
    }
    const tpl = templateFor(kind, name);
    await this.write(provider, kind, scope, name, cwd, tpl.frontmatter, tpl.body);
    return this.read(provider, kind, scope, name, cwd);
  }

  async remove(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
  ): Promise<void> {
    const { file, folder } = resolvePath(provider, kind, scope, name, cwd);
    if (kind === "skill" && folder) {
      rmSync(folder, { recursive: true, force: true });
      return;
    }
    rmSync(file, { force: true });
  }

  async reveal(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
  ): Promise<void> {
    const { file, folder } = resolvePath(provider, kind, scope, name, cwd);
    const target = kind === "skill" && folder ? folder : file;
    shell.showItemInFolder(target);
  }

  async openExternal(
    provider: ConfigProvider,
    kind: ConfigKind,
    scope: ConfigScope,
    name: string,
    cwd: string | null,
  ): Promise<void> {
    const { file } = resolvePath(provider, kind, scope, name, cwd);
    await shell.openPath(file);
  }

  dispose(): void {
    for (const w of this.watchers.values()) {
      try {
        w.close();
      } catch {}
    }
    this.watchers.clear();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
