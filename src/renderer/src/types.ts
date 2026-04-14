export type ProviderId = "claude" | "codex" | "cursor";

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

export interface ConfigSelection {
  kind: ConfigKind;
  scope: ConfigScope;
  name: string;
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
  mode: "agent" | "shell" | "ui";
  command: string;
}

/** A terminal instance — decoupled from session IDs */
export interface TerminalInstance {
  terminalId: string;
  provider: ProviderId;
  cwd: string;
  projectName: string;
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  launchSpec?: LaunchSpec;
  resumeSessionId?: string; // set only when resuming an existing session
}

export type PanelTab = "sessions" | "skills";

export interface AttentionEvent {
  id: string;
  terminalId: string;
  type: "prompt" | "permission" | "complete";
  summary: string;
  timestamp: number;
  dismissed: boolean;
}
