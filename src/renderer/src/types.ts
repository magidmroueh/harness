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

export interface IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface ToolkitAction {
  id: string;
  label: string;
  IconComponent?: React.ForwardRefExoticComponent<
    { size?: number } & React.RefAttributes<IconHandle>
  >;
  mode: "claude" | "shell" | "ui";
  command: string;
}

/** A terminal instance — decoupled from session IDs */
export interface TerminalInstance {
  terminalId: string;
  cwd: string;
  projectName: string;
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  resumeSessionId?: string; // set only when resuming an existing session
}

export type PanelTab = "sessions" | "activity";

export interface AttentionEvent {
  id: string;
  terminalId: string;
  type: "prompt" | "permission" | "complete";
  summary: string;
  timestamp: number;
  dismissed: boolean;
}

export interface ActivityEvent {
  id: string;
  type:
    | "session_created"
    | "session_ended"
    | "command_run"
    | "worktree_created"
    | "worktree_removed";
  message: string;
  timestamp: number;
  sessionId?: string;
}
