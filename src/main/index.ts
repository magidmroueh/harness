import { app, BrowserWindow, Notification, Menu, ipcMain, dialog, nativeImage } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { SessionManager, detectPackageManager } from "./sessions";
import { WorktreeManager } from "./worktrees";
import { AttentionDetector } from "./notifications";
import {
  ConfigManager,
  type ConfigKind,
  type ConfigScope,
  type ConfigProvider,
} from "./claudeConfig";
import { checkForUpdates, downloadAndInstall } from "./updater";
import { ProviderManager, EXTRA_PATH, type ProviderId } from "./providers";

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
const providers = new ProviderManager();
let autoCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let autoCheckInterval: ReturnType<typeof setInterval> | null = null;
const detector = new AttentionDetector();
const configManager = new ConfigManager();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0c0a09",
    icon: join(__dirname, "../../resources/icon.icns"),
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

  // Config: forward change events to renderer for re-fetching
  configManager.on("changed", () => {
    if (mainWindow?.isDestroyed()) return;
    mainWindow?.webContents.send("config:changed");
  });

  // Notification: forward attention events to renderer + desktop notification
  detector.onAttention((event) => {
    if (mainWindow?.isDestroyed()) return;
    mainWindow?.webContents.send("notification:attention", event);

    if (!mainWindow?.isFocused() && Notification.isSupported()) {
      const n = new Notification({ title: "Harness", body: event.summary });
      n.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("notification:focus-terminal", event.terminalId);
      });
      n.show();
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
  (_, { id, cwd, cmd, args, cols, rows }: { id: string; cwd?: string; cmd?: string; args?: string[]; cols?: number; rows?: number }) => {
    if (!pty) return { error: "node-pty not available. Run: npm run rebuild" };

    const shell = cmd || process.env.SHELL || "/bin/zsh";
    const shellArgs = args || [];

    const currentPath = process.env.PATH || "";
    const p = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cwd: cwd || process.env.HOME || "/",
      env: {
        ...process.env,
        PATH: currentPath ? `${EXTRA_PATH}:${currentPath}` : EXTRA_PATH,
        COLORTERM: "truecolor",
        TERM_PROGRAM: "Harness",
        TERM_PROGRAM_VERSION: app.getVersion(),
      } as Record<string, string>,
      cols: cols || 80,
      rows: rows || 24,
    });

    ptys.set(id, p);

    p.onData((data) => {
      detector.feed(id, data);
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send(`terminal:data:${id}`, data);
      }
    });

    p.onExit(({ exitCode }) => {
      ptys.delete(id);
      detector.clear(id);
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
  detector.clear(id);
});

// --- Notification IPC ---

ipcMain.handle("notification:suppress", (_, { id }: { id: string }) => {
  detector.suppress(id);
});

ipcMain.handle("notification:unsuppress", (_, { id }: { id: string }) => {
  detector.unsuppress(id);
});

// --- Updater IPC ---

ipcMain.handle("updater:check", () => checkForUpdates());
ipcMain.handle("updater:install", (_, { dmgUrl }: { dmgUrl: string }) => downloadAndInstall(dmgUrl, mainWindow));

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

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("sessions:discover", () => sessions.discover());
ipcMain.handle(
  "sessions:list-all",
  (_, opts?: { provider?: "claude" | "codex" | "cursor" }) =>
    sessions.listAll(opts?.provider ?? "claude"),
);
ipcMain.handle("sessions:delete", (_, opts) => sessions.delete(opts));
ipcMain.handle("sessions:detect-pm", (_, { cwd }) => detectPackageManager(cwd));

// --- Provider IPC ---

ipcMain.handle("providers:list", () => providers.list());
ipcMain.handle("providers:install", (_, { id }: { id: ProviderId }) => providers.install(id));
ipcMain.handle(
  "providers:launch-command",
  (_, { id, resumeSessionId }: { id: ProviderId; resumeSessionId?: string }) =>
    providers.getLaunchCommand(id, resumeSessionId),
);

ipcMain.handle("git:branch", async (_, { cwd }: { cwd: string }) => {
  try {
    const { execFile } = require("child_process");
    return new Promise<string>((resolve) => {
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }, (err: Error | null, stdout: string) => {
        resolve(err ? "—" : stdout.trim());
      });
    });
  } catch {
    return "—";
  }
});

// --- Worktree IPC ---

ipcMain.handle("worktrees:list", (_, { cwd }) => worktrees.list(cwd));
ipcMain.handle("worktrees:create", (_, opts) => worktrees.create(opts));
ipcMain.handle("worktrees:remove", (_, opts) => worktrees.remove(opts));

// --- Config IPC ---

interface ConfigCall {
  provider?: ConfigProvider;
  kind: ConfigKind;
  scope: ConfigScope;
  name: string;
  cwd: string | null;
}

const configProvider = (p?: ConfigProvider): ConfigProvider => p ?? "claude";

ipcMain.handle(
  "config:list",
  (_, { provider, cwd }: { provider?: ConfigProvider; cwd: string | null }) =>
    configManager.list(configProvider(provider), cwd),
);
ipcMain.handle("config:read", (_, opts: ConfigCall) =>
  configManager.read(configProvider(opts.provider), opts.kind, opts.scope, opts.name, opts.cwd),
);
ipcMain.handle(
  "config:write",
  (
    _,
    opts: ConfigCall & { frontmatter: Record<string, unknown>; body: string },
  ) =>
    configManager.write(
      configProvider(opts.provider),
      opts.kind,
      opts.scope,
      opts.name,
      opts.cwd,
      opts.frontmatter,
      opts.body,
    ),
);
ipcMain.handle("config:create", (_, opts: ConfigCall) =>
  configManager.create(configProvider(opts.provider), opts.kind, opts.scope, opts.name, opts.cwd),
);
ipcMain.handle("config:remove", (_, opts: ConfigCall) =>
  configManager.remove(configProvider(opts.provider), opts.kind, opts.scope, opts.name, opts.cwd),
);
ipcMain.handle("config:reveal", (_, opts: ConfigCall) =>
  configManager.reveal(configProvider(opts.provider), opts.kind, opts.scope, opts.name, opts.cwd),
);
ipcMain.handle("config:open-external", (_, opts: ConfigCall) =>
  configManager.openExternal(
    configProvider(opts.provider),
    opts.kind,
    opts.scope,
    opts.name,
    opts.cwd,
  ),
);

// --- App Lifecycle ---

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.harness");

  // Set Dock icon (macOS) — required in dev mode since there's no app bundle
  if (process.platform === "darwin") {
    const iconPath = join(__dirname, "../../resources/icon.icns");
    const dockIcon = nativeImage.createFromPath(iconPath);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();

  // macOS application menu
  const appName = "Harness";

  function handleMenuUpdateCheck(): void {
    checkForUpdates().then((info) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (info.hasUpdate) {
        mainWindow.webContents.send("updater:update-available", info);
      } else {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "No Updates",
          message: `You're on the latest version (v${info.currentVersion}).`,
        });
      }
    }).catch(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Update Check Failed",
          message: "Could not check for updates. Please try again later.",
        });
      }
    });
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: "about", label: `About ${appName}` },
        { label: "Check for Updates...", click: handleMenuUpdateCheck },
        { type: "separator" },
        { role: "hide", label: `Hide ${appName}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${appName}` },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Auto-check for updates: 30s after launch, then every 4 hours
  const autoCheck = () => {
    checkForUpdates().then((info) => {
      if (info.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("updater:update-available", info);
      }
    }).catch(() => {});
  };
  autoCheckTimeout = setTimeout(autoCheck, 30_000);
  autoCheckInterval = setInterval(autoCheck, 4 * 60 * 60 * 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (autoCheckTimeout) { clearTimeout(autoCheckTimeout); autoCheckTimeout = null; }
  if (autoCheckInterval) { clearInterval(autoCheckInterval); autoCheckInterval = null; }
  for (const [, p] of ptys) p.kill();
  ptys.clear();
  if (process.platform !== "darwin") app.quit();
});
