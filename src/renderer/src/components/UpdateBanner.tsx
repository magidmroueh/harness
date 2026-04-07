import { useState, useEffect } from "react";

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  dmgUrl: string;
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    return window.api.updater.onUpdateAvailable((info) => {
      if (info.hasUpdate) {
        setUpdate(info);
        setDismissed(false);
      }
    });
  }, []);

  useEffect(() => {
    return window.api.updater.onProgress((status) => {
      setProgress(status === "ready" ? "" : status);
    });
  }, []);

  if (!update || dismissed || !update.hasUpdate) {
    return null;
  }

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        fontSize: "0.75rem",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "fadeIn 200ms var(--ease-out-expo)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
      {progress ? (
        <span style={{ color: "var(--text-secondary)", flex: 1 }}>{progress}</span>
      ) : (
        <>
          <span style={{ color: "var(--text-secondary)", flex: 1 }}>
            <strong style={{ color: "var(--text-primary)" }}>v{update.latestVersion}</strong> is available
            <span style={{ color: "var(--text-muted)" }}> (current: v{update.currentVersion})</span>
          </span>
          <button
            onClick={() => {
              if (update.dmgUrl) {
                window.api.updater.install(update.dmgUrl);
              }
            }}
            style={{
              background: "var(--accent)",
              color: "#000",
              border: "none",
              borderRadius: "var(--radius-full)",
              padding: "3px 12px",
              fontSize: "0.7rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              flexShrink: 0,
              transition: "opacity 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            Update Now
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.65rem",
              padding: "2px 4px",
              flexShrink: 0,
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
