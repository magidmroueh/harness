import { useRef, useState, useEffect } from "react";
import { Session, IconHandle } from "../types";
import { TerminalIcon } from "./icons";

interface Props {
  session: Session | null;
  unreadCount?: number;
  bottomTerminalOpen?: boolean;
  onToggleBottomTerminal?: () => void;
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

export function StatusBar({ session, unreadCount = 0, bottomTerminalOpen = false, onToggleBottomTerminal }: Props) {
  const termIconRef = useRef<IconHandle>(null);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    window.api.getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    if (!session?.cwd) { setGitBranch(null); return; }
    window.api.git.branch(session.cwd).then(setGitBranch);
    const interval = setInterval(() => {
      window.api.git.branch(session.cwd).then(setGitBranch);
    }, 10_000);
    return () => clearInterval(interval);
  }, [session?.cwd]);

  const toggleButton = (
    <div
      onClick={onToggleBottomTerminal}
      onMouseEnter={() => termIconRef.current?.startAnimation()}
      onMouseLeave={() => termIconRef.current?.stopAnimation()}
      data-tooltip="Terminal (⌘J)"
      style={{
        color: bottomTerminalOpen ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        transition: "color 150ms",
        marginRight: 8,
      }}
    >
      <TerminalIcon ref={termIconRef} size={14} />
    </div>
  );

  const versionBadge = appVersion && (
    <span
      data-tooltip="App version"
      style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}
    >
      v{appVersion}
    </span>
  );

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
        {toggleButton}
        No active session
        <span style={{ marginLeft: "auto" }}>{versionBadge}</span>
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
      {toggleButton}
      <span data-tooltip="Working directory">{shortenPath(session.cwd)}</span>
      <span data-tooltip="Git branch" style={{ color: "var(--dot-current)" }}>
        ⌥ {gitBranch || session.branch}
      </span>
      <span data-tooltip="Provider" style={{ textTransform: "capitalize" }}>
        {session.provider}
      </span>
      <span data-tooltip="Model">{session.model.split(" ")[0]}</span>
      <span data-tooltip="Session duration" style={{ marginLeft: "auto" }}>
        {formatDuration(session.startedAt)}
      </span>
      <span data-tooltip="Estimated cost">&lt;${session.cost.toFixed(2)}</span>
      {unreadCount > 0 && (
        <span
          data-tooltip="Unread notifications"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "var(--dot-working)",
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--dot-working)",
              animation: "pulse 2s infinite",
            }}
          />
          {unreadCount}
        </span>
      )}
      {versionBadge}
    </div>
  );
}
