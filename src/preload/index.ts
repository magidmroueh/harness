import { contextBridge, ipcRenderer } from "electron";

const api = {
  terminal: {
    create: (opts: { id: string; cwd?: string; cmd?: string; args?: string[] }) =>
      ipcRenderer.invoke("terminal:create", opts),
    write: (id: string, data: string) => ipcRenderer.invoke("terminal:write", { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke("terminal:resize", { id, cols, rows }),
    kill: (id: string) => ipcRenderer.invoke("terminal:kill", { id }),
    onData: (id: string, cb: (data: string) => void) => {
      const handler = (_: unknown, data: string) => cb(data);
      ipcRenderer.on(`terminal:data:${id}`, handler);
      return () => {
        ipcRenderer.removeListener(`terminal:data:${id}`, handler);
      };
    },
    onExit: (id: string, cb: (code: number) => void) => {
      const handler = (_: unknown, code: number) => cb(code);
      ipcRenderer.on(`terminal:exit:${id}`, handler);
      return () => {
        ipcRenderer.removeListener(`terminal:exit:${id}`, handler);
      };
    },
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
  dialog: {
    openFolder: () => ipcRenderer.invoke("dialog:open-folder") as Promise<string | null>,
  },
  platform: process.platform,
  homeDir: process.env.HOME || (process.env.USER ? `/Users/${process.env.USER}` : "/"),
};

contextBridge.exposeInMainWorld("api", api);
