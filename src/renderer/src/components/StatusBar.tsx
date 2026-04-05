import { Session } from "../types";

interface Props {
  session: Session | null;
}

function formatDuration(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function shortenPath(p: string): string {
  const home = window.api.homeDir;
  if (home && p.startsWith(home)) {
    return "~" + p.slice(home.length);
  }
  return p;
}

export function StatusBar({ session }: Props) {
  if (!session) {
    return (
      <div
        style={{
          height: 32,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
        }}
      >
        No active session
      </div>
    );
  }

  return (
    <div
      style={{
        height: 32,
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 16,
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        flexShrink: 0,
        fontFamily: "var(--font-mono)",
      }}
    >
      <span>{shortenPath(session.cwd)}</span>
      <span style={{ color: "var(--dot-current)" }}>⌥ {session.branch}</span>
      <span>{session.model.split(" ")[0]}</span>
      <span style={{ marginLeft: "auto" }}>{formatDuration(session.startedAt)}</span>
      <span>&lt;${session.cost.toFixed(2)}</span>
    </div>
  );
}
