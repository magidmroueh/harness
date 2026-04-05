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

export interface HarnessAPI {
  terminal: {
    create: (opts: {
      id: string;
      cwd?: string;
      cmd?: string;
      args?: string[];
    }) => Promise<{ pid?: number; error?: string }>;
    write: (id: string, data: string) => Promise<void>;
    resize: (id: string, cols: number, rows: number) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onData: (id: string, cb: (data: string) => void) => () => void;
    onExit: (id: string, cb: (code: number) => void) => () => void;
  };
  sessions: {
    discover: () => Promise<Session[]>;
    listAll: () => Promise<Session[]>;
    delete: (opts: { cwd: string; sessionId: string }) => Promise<boolean>;
    detectPM: (cwd: string) => Promise<"npm" | "yarn" | "pnpm" | "bun">;
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
  dialog: {
    openFolder: () => Promise<string | null>;
  };
  platform: string;
  homeDir: string;
}

declare global {
  interface Window {
    api: HarnessAPI;
  }
}
