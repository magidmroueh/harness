import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";

export type ProviderId = "claude" | "codex" | "cursor";

/**
 * Extra PATH entries added to every shell invocation so provider binaries
 * are discoverable regardless of how Electron was launched (Finder vs
 * terminal) or whether `.zshrc` is read in the current shell mode.
 */
export const EXTRA_PATH = [
  join(homedir(), ".local/bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
].join(":");

function augmentedEnv(): NodeJS.ProcessEnv {
  const current = process.env.PATH || "";
  return {
    ...process.env,
    PATH: current ? `${EXTRA_PATH}:${current}` : EXTRA_PATH,
  };
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  binary: string;
  installed: boolean;
  historySupported: boolean;
  configSupported: boolean;
  installCommand?: string;
  startCommand: string;
  resumeSupported: boolean;
}

interface ProviderDefinition {
  id: ProviderId;
  label: string;
  binary: string;
  installCommand?: string;
  historySupported: boolean;
  configSupported: boolean;
  resumeSupported: boolean;
  buildStartCommand: () => string;
  buildResumeCommand?: (sessionId: string) => string;
}

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude",
    label: "Claude Code",
    binary: "claude",
    historySupported: true,
    configSupported: true,
    resumeSupported: true,
    buildStartCommand: () => "claude",
    buildResumeCommand: (sessionId) => `claude --resume ${shellQuote(sessionId)}`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    binary: "codex",
    installCommand: "npm install -g @openai/codex",
    historySupported: true,
    configSupported: false,
    resumeSupported: true,
    buildStartCommand: () => "codex",
    buildResumeCommand: (sessionId) => `codex resume ${shellQuote(sessionId)}`,
  },
  {
    id: "cursor",
    label: "Cursor CLI",
    // `agent` is the shorter alias cursor-agent prints a tip about; using
    // it directly keeps the launch output clean.
    binary: "agent",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    historySupported: true,
    configSupported: true,
    resumeSupported: true,
    buildStartCommand: () => "agent",
    buildResumeCommand: (sessionId) => `agent --resume ${shellQuote(sessionId)}`,
  },
];

function shellPath(): string {
  return process.env.SHELL || "/bin/zsh";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runShell(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(shellPath(), ["-lc", command], { env: augmentedEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function isInstalled(binary: string): Promise<boolean> {
  try {
    await runShell(`command -v ${shellQuote(binary)}`);
    return true;
  } catch {
    return false;
  }
}

function toStatus(definition: ProviderDefinition, installed: boolean): ProviderStatus {
  return {
    id: definition.id,
    label: definition.label,
    binary: definition.binary,
    installed,
    historySupported: definition.historySupported,
    configSupported: definition.configSupported,
    installCommand: definition.installCommand,
    startCommand: definition.buildStartCommand(),
    resumeSupported: definition.resumeSupported,
  };
}

export class ProviderManager {
  async list(): Promise<ProviderStatus[]> {
    const installed = await Promise.all(
      PROVIDERS.map((provider) => isInstalled(provider.binary)),
    );
    return PROVIDERS.map((provider, index) => toStatus(provider, installed[index] || false));
  }

  async install(id: ProviderId): Promise<{ ok: boolean; error?: string }> {
    const provider = PROVIDERS.find((item) => item.id === id);
    if (!provider?.installCommand) {
      return { ok: false, error: "This provider does not support in-app installation." };
    }

    try {
      await runShell(provider.installCommand);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getLaunchCommand(id: ProviderId, resumeSessionId?: string): string {
    const provider = PROVIDERS.find((item) => item.id === id) || PROVIDERS[0];
    if (resumeSessionId && provider.resumeSupported && provider.buildResumeCommand) {
      return provider.buildResumeCommand(resumeSessionId);
    }
    return provider.buildStartCommand();
  }
}
