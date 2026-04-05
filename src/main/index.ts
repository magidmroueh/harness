import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { SessionManager } from "./sessions";
import { WorktreeManager } from "./worktrees";

let pty: typeof import("node-pty") | null = null;
try {
  pty = require("node-pty");
} catch {
  console.error("node-pty unavailable — run: npm run rebuild");
}

let mainWindow: BrowserWindow | null = null;
const ptys = new Map<string, import("node-pty").IPty>();
const sessions = new SessionManager();
const worktrees = new WorktreeManager();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0c0a09",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", () => {
    for (const [id, p] of ptys) {
      p.kill();
      ptys.delete(id);
    }
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// --- Terminal IPC ---

ipcMain.handle(
  "terminal:create",
  (_, { id, cwd, cmd, args }: { id: string; cwd?: string; cmd?: string; args?: string[] }) => {
    if (!pty) return { error: "node-pty not available. Run: npm run rebuild" };

    const shell = cmd || process.env.SHELL || "/bin/zsh";
    const shellArgs = args || [];

    const p = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cwd: cwd || process.env.HOME || "/",
      env: { ...process.env } as Record<string, string>,
      cols: 80,
      rows: 24,
    });

    ptys.set(id, p);

    p.onData((data) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send(`terminal:data:${id}`, data);
      }
    });

    p.onExit(({ exitCode }) => {
      ptys.delete(id);
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send(`terminal:exit:${id}`, exitCode);
      }
    });

    return { pid: p.pid };
  },
);

ipcMain.handle("terminal:write", (_, { id, data }: { id: string; data: string }) => {
  ptys.get(id)?.write(data);
});

ipcMain.handle(
  "terminal:resize",
  (_, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    try {
      ptys.get(id)?.resize(cols, rows);
    } catch {}
  },
);

ipcMain.handle("terminal:kill", (_, { id }: { id: string }) => {
  ptys.get(id)?.kill();
  ptys.delete(id);
});

// --- Dialog IPC ---

ipcMain.handle("dialog:open-folder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select project directory",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- Session IPC ---

ipcMain.handle("sessions:discover", () => sessions.discover());
ipcMain.handle("sessions:list-all", () => sessions.listAll());
ipcMain.handle("sessions:delete", (_, opts) => sessions.delete(opts));

// --- Worktree IPC ---

ipcMain.handle("worktrees:list", (_, { cwd }) => worktrees.list(cwd));
ipcMain.handle("worktrees:create", (_, opts) => worktrees.create(opts));
ipcMain.handle("worktrees:remove", (_, opts) => worktrees.remove(opts));

// --- App Lifecycle ---

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.harness");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const [, p] of ptys) p.kill();
  ptys.clear();
  if (process.platform !== "darwin") app.quit();
});
