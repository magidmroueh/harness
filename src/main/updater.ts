import { app, net } from "electron";

const REPO = "magidmroueh/harness";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
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

export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();

  const noUpdate = (): UpdateInfo => ({
    currentVersion,
    latestVersion: currentVersion,
    hasUpdate: false,
    releaseUrl: `https://github.com/${REPO}/releases`,
    releaseNotes: "",
    publishedAt: "",
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
