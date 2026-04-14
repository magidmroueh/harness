export type ProviderId = "claude" | "codex" | "cursor";

export interface AttentionEvent {
  id: string;
  terminalId: string;
  type: "prompt" | "permission" | "complete";
  summary: string;
  timestamp: number;
}

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

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  binary: string;
  installed: boolean;
  historySupported: boolean;
  configSupported: boolean;
  installCommand?: string;
  resumeSupported: boolean;
}

export interface LaunchSpec {
  cmd: string;
  args: string[];
}

export type ConfigKind = "skill" | "agent" | "command" | "claudemd";
export type ConfigScope = "global" | "project";

export interface ConfigEntry {
  kind: ConfigKind;
  scope: ConfigScope;
  name: string;
  path: string;
  frontmatter: Record<string, unknown>;
  description?: string;
  hasResources?: boolean;
  folderPath?: string;
}

export interface ConfigFileDetail extends ConfigEntry {
  body: string;
  resources?: string[];
}

export interface HarnessAPI {
  terminal: {
    create: (opts: {
      id: string;
      cwd?: string;
      cmd?: string;
      args?: string[];
      cols?: number;
      rows?: number;
    }) => Promise<{ pid?: number; error?: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (id: string, cb: (data: string) => void) => () => void;
    onExit: (id: string, cb: (code: number) => void) => () => void;
  };
  sessions: {
    discover: () => Promise<Session[]>;
    listAll: (provider?: ProviderId) => Promise<Session[]>;
    delete: (opts: { cwd: string; sessionId: string }) => Promise<boolean>;
    detectPM: (cwd: string) => Promise<"npm" | "yarn" | "pnpm" | "bun">;
  };
  providers: {
    list: () => Promise<ProviderStatus[]>;
    install: (id: ProviderId) => Promise<{ ok: boolean; error?: string }>;
    launchSpec: (id: ProviderId, resumeSessionId?: string) => Promise<LaunchSpec>;
  };
  worktrees: {
    list: (cwd: string) => Promise<Worktree[]>;
    create: (opts: {
      cwd: string;
      path: string;
      branch: string;
      newBranch?: boolean;
    }) => Promise<Worktree | null>;
    remove: (opts: { cwd: string; path: string; force?: boolean }) => Promise<boolean>;
  };
  notifications: {
    onAttention: (cb: (event: AttentionEvent) => void) => () => void;
    onFocusTerminal: (cb: (terminalId: string) => void) => () => void;
    suppress: (id: string) => Promise<void>;
    unsuppress: (id: string) => Promise<void>;
  };
  updater: {
    check: () => Promise<{
      currentVersion: string;
      latestVersion: string;
      hasUpdate: boolean;
      releaseUrl: string;
      releaseNotes: string;
      publishedAt: string;
      dmgUrl: string;
    }>;
    install: (dmgUrl: string) => Promise<void>;
    onUpdateAvailable: (cb: (info: {
      currentVersion: string;
      latestVersion: string;
      hasUpdate: boolean;
      releaseUrl: string;
      releaseNotes: string;
      publishedAt: string;
      dmgUrl: string;
    }) => void) => () => void;
    onProgress: (cb: (status: string) => void) => () => void;
  };
  git: {
    branch: (cwd: string) => Promise<string>;
  };
  config: {
    list: (provider: ProviderId, cwd: string | null) => Promise<ConfigEntry[]>;
    read: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
    ) => Promise<ConfigFileDetail>;
    write: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
      frontmatter: Record<string, unknown>,
      body: string,
    ) => Promise<void>;
    create: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
    ) => Promise<ConfigFileDetail>;
    remove: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
    ) => Promise<void>;
    reveal: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
    ) => Promise<void>;
    openExternal: (
      provider: ProviderId,
      kind: ConfigKind,
      scope: ConfigScope,
      name: string,
      cwd: string | null,
    ) => Promise<void>;
    onChanged: (cb: () => void) => () => void;
  };
  dialog: {
    openFolder: () => Promise<string | null>;
  };
  getVersion: () => Promise<string>;
  platform: string;
  homeDir: string;
}

declare global {
  interface Window {
    api: HarnessAPI;
  }
}
