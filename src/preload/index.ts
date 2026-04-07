import { contextBridge, ipcRenderer } from "electron";

function onIpc<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
}

const api = {
  terminal: {
    create: (opts: { id: string; cwd?: string; cmd?: string; args?: string[] }) =>
      ipcRenderer.invoke("terminal:create", opts),
    write: (id: string, data: string) => ipcRenderer.invoke("terminal:write", { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke("terminal:resize", { id, cols, rows }),
    kill: (id: string) => ipcRenderer.invoke("terminal:kill", { id }),
    onData: (id: string, cb: (data: string) => void) => onIpc(`terminal:data:${id}`, cb),
    onExit: (id: string, cb: (code: number) => void) => onIpc(`terminal:exit:${id}`, cb),
  },
  sessions: {
    discover: () => ipcRenderer.invoke("sessions:discover"),
    listAll: () => ipcRenderer.invoke("sessions:list-all"),
    delete: (opts: { cwd: string; sessionId: string }) =>
      ipcRenderer.invoke("sessions:delete", opts),
    detectPM: (cwd: string) =>
      ipcRenderer.invoke("sessions:detect-pm", { cwd }) as Promise<"npm" | "yarn" | "pnpm" | "bun">,
  },
  worktrees: {
    list: (cwd: string) => ipcRenderer.invoke("worktrees:list", { cwd }),
    create: (opts: { cwd: string; path: string; branch: string; newBranch?: boolean }) =>
      ipcRenderer.invoke("worktrees:create", opts),
    remove: (opts: { cwd: string; path: string; force?: boolean }) =>
      ipcRenderer.invoke("worktrees:remove", opts),
  },
  notifications: {
    onAttention: (cb: (event: { id: string; terminalId: string; type: string; summary: string; timestamp: number }) => void) =>
      onIpc("notification:attention", cb),
    onFocusTerminal: (cb: (terminalId: string) => void) =>
      onIpc("notification:focus-terminal", cb),
    suppress: (id: string) => ipcRenderer.invoke("notification:suppress", { id }),
    unsuppress: (id: string) => ipcRenderer.invoke("notification:unsuppress", { id }),
  },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    install: (dmgUrl: string) => ipcRenderer.invoke("updater:install", { dmgUrl }),
    onUpdateAvailable: (cb: (info: { currentVersion: string; latestVersion: string; hasUpdate: boolean; releaseUrl: string; releaseNotes: string; publishedAt: string; dmgUrl: string }) => void) =>
      onIpc("updater:update-available", cb),
    onProgress: (cb: (status: string) => void) => onIpc("updater:progress", cb),
  },
  git: {
    branch: (cwd: string) => ipcRenderer.invoke("git:branch", { cwd }) as Promise<string>,
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:open-folder") as Promise<string | null>,
  },
  platform: process.platform,
  homeDir: process.env.HOME || (process.env.USER ? `/Users/${process.env.USER}` : "/"),
};

contextBridge.exposeInMainWorld("api", api);
