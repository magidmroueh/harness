import { app, net, BrowserWindow, dialog } from "electron";
import { execFile } from "child_process";
import { createWriteStream, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const REPO = "magidmroueh/harness";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  dmgUrl: string;
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.replace(/^v/, "").split(".").map(Number);
  const l = latest.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

function findDmgUrl(assets: { name: string; browser_download_url: string }[]): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  // Prefer arch-specific DMG, fallback to any DMG
  const match = assets.find((a) => a.name.endsWith(".dmg") && a.name.includes(arch));
  const fallback = assets.find((a) => a.name.endsWith(".dmg"));
  return (match || fallback)?.browser_download_url || "";
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();

  const noUpdate = (): UpdateInfo => ({
    currentVersion,
    latestVersion: currentVersion,
    hasUpdate: false,
    releaseUrl: `https://github.com/${REPO}/releases`,
    releaseNotes: "",
    publishedAt: "",
    dmgUrl: "",
  });

  return new Promise((resolve) => {
    const request = net.request(RELEASES_URL);
    request.setHeader("Accept", "application/vnd.github.v3+json");
    request.setHeader("User-Agent", "Harness-App");

    let body = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => {
        try {
          if (response.statusCode !== 200) {
            resolve(noUpdate());
            return;
          }

          const data = JSON.parse(body);
          const latestVersion = (data.tag_name || "").replace(/^v/, "");
          resolve({
            currentVersion,
            latestVersion,
            hasUpdate: compareVersions(currentVersion, latestVersion),
            releaseUrl: data.html_url || `https://github.com/${REPO}/releases`,
            releaseNotes: data.body || "",
            publishedAt: data.published_at || "",
            dmgUrl: findDmgUrl(data.assets || []),
          });
        } catch {
          resolve(noUpdate());
        }
      });
    });

    request.on("error", () => resolve(noUpdate()));
    request.end();
  });
}

/** Download DMG, mount, replace app, and relaunch. */
export async function downloadAndInstall(
  dmgUrl: string,
  mainWindow: BrowserWindow | null,
): Promise<void> {
  const sendProgress = (status: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:progress", status);
    }
  };

  const tmpDir = mkdtempSync(join(tmpdir(), "harness-update-"));
  const dmgPath = join(tmpDir, "Harness.dmg");

  try {
    // Download DMG
    sendProgress("Downloading update...");
    await new Promise<void>((resolve, reject) => {
      const request = net.request(dmgUrl);
      request.on("response", (response) => {
        // Follow redirects (GitHub serves assets via redirect)
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers["location"];
          const url = Array.isArray(redirectUrl) ? redirectUrl[0] : redirectUrl;
          if (url) {
            const redirectReq = net.request(url);
            redirectReq.on("response", (rRes) => {
              const file = createWriteStream(dmgPath);
              rRes.on("data", (chunk) => file.write(chunk));
              rRes.on("end", () => { file.end(); resolve(); });
              rRes.on("error", reject);
            });
            redirectReq.on("error", reject);
            redirectReq.end();
            return;
          }
        }
        const file = createWriteStream(dmgPath);
        response.on("data", (chunk) => file.write(chunk));
        response.on("end", () => { file.end(); resolve(); });
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });

    // Mount DMG
    sendProgress("Installing update...");
    const mountPoint = await new Promise<string>((resolve, reject) => {
      execFile("hdiutil", ["attach", "-nobrowse", "-noautoopen", dmgPath], (err, stdout) => {
        if (err) return reject(err);
        const match = stdout.match(/\/Volumes\/.+/);
        resolve(match ? match[0].trim() : "");
      });
    });

    if (!mountPoint) throw new Error("Failed to mount DMG");

    // Find .app in mounted volume
    const appSource = await new Promise<string>((resolve, reject) => {
      execFile("find", [mountPoint, "-maxdepth", "1", "-name", "*.app", "-print"], (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim().split("\n")[0] || "");
      });
    });

    if (!appSource) {
      execFile("hdiutil", ["detach", mountPoint, "-quiet"], () => {});
      throw new Error("No .app found in DMG");
    }

    // Replace current app
    const appPath = app.getPath("exe").replace(/\/Contents\/.*$/, "");
    await new Promise<void>((resolve, reject) => {
      execFile("rm", ["-rf", appPath], (err) => {
        if (err) return reject(err);
        execFile("cp", ["-R", appSource, appPath], (cpErr) => {
          if (cpErr) return reject(cpErr);
          // Remove quarantine
          execFile("xattr", ["-dr", "com.apple.quarantine", appPath], () => resolve());
        });
      });
    });

    // Unmount
    execFile("hdiutil", ["detach", mountPoint, "-quiet"], () => {});

    // Ask to restart
    sendProgress("ready");
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Installed",
        message: "Harness has been updated. Restart now?",
        buttons: ["Restart", "Later"],
        defaultId: 0,
      });
      if (response === 0) {
        app.relaunch();
        app.exit(0);
      }
    }
  } catch (err) {
    sendProgress("");
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Update Failed",
        message: `Could not install update: ${err instanceof Error ? err.message : err}`,
      });
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }
}
