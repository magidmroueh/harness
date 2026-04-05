import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Session, TerminalInstance, ToolkitAction as ActionType, ActivityEvent } from "./types";
import { useSessions, useDeleteSession } from "./hooks/useSessions";
import { TitleBar } from "./components/TitleBar";
import { SessionPanel } from "./components/SessionPanel";
import { TerminalView } from "./components/TerminalView";
import { Toolkit } from "./components/Toolkit";
import { WorktreePanel } from "./components/WorktreePanel";
import { StatusBar } from "./components/StatusBar";
import { NewSessionDialog } from "./components/NewSessionDialog";

interface SplitPane {
  id: string;
  cwd: string;
  command: string;
  label: string;
}

export function App() {
  const { data: sessions = [] } = useSessions();
  const deleteSession = useDeleteSession();

  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [splitPane, setSplitPane] = useState<SplitPane | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showWorktrees, setShowWorktrees] = useState(false);

  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;
  const activeTerminalIdRef = useRef(activeTerminalId);
  activeTerminalIdRef.current = activeTerminalId;

  const activeTerminal = terminals.find((t) => t.terminalId === activeTerminalId) || null;

  const activeSessionForStatus = useMemo(() => {
    if (!activeTerminal) return null;
    const matched = sessions.find((s) => s.sessionId === activeTerminal.resumeSessionId);
    return (
      matched || {
        id: activeTerminal.terminalId,
        pid: 0,
        label: activeTerminal.projectName,
        name: activeTerminal.projectName,
        cwd: activeTerminal.cwd,
        branch: "—",
        status: "active" as const,
        model: "Opus 4.6 (1M context)",
        cost: 0,
        startedAt: Date.now(),
        lastActivity: Date.now(),
        sessionId: "",
        entrypoint: "harness",
        packageManager: "npm",
      }
    );
  }, [activeTerminal, sessions]);

  const addActivity = useCallback((type: ActivityEvent["type"], message: string) => {
    setActivity((prev) =>
      [{ id: crypto.randomUUID(), type, message, timestamp: Date.now() }, ...prev].slice(0, 50),
    );
  }, []);

  const handleResumeSession = useCallback(
    (session: Session) => {
      const terminalId = crypto.randomUUID();
      setTerminals((prev) => [
        ...prev,
        {
          terminalId,
          cwd: session.cwd,
          projectName: session.name,
          resumeSessionId: session.sessionId,
        },
      ]);
      setActiveTerminalId(terminalId);
      addActivity("session_created", `Resumed: ${session.name}`);
    },
    [addActivity],
  );

  const handleNewSession = useCallback(
    (name: string, cwd: string) => {
      const expandedCwd = cwd.startsWith("~/") ? cwd.replace("~", window.api.homeDir) : cwd;
      const terminalId = crypto.randomUUID();
      setTerminals((prev) => [...prev, { terminalId, cwd: expandedCwd, projectName: name }]);
      setActiveTerminalId(terminalId);
      addActivity("session_created", `New session: ${name}`);
    },
    [addActivity],
  );

  const handleCloseTerminal = useCallback((terminalId: string) => {
    // Don't kill PTY here — TerminalView's cleanup handles it on unmount
    setTerminals((prev) => {
      const remaining = prev.filter((t) => t.terminalId !== terminalId);
      setActiveTerminalId((id) =>
        id === terminalId ? (remaining.at(-1)?.terminalId ?? null) : id,
      );
      return remaining;
    });
  }, []);

  const handleCloseSplit = useCallback(() => {
    // Just remove from state — TerminalView's cleanup will kill the PTY
    setSplitPane(null);
  }, []);

  const handleDeleteSession = useCallback(
    (session: Session) => {
      deleteSession.mutate(session);
      addActivity("session_ended", `Deleted: ${session.label}`);
    },
    [deleteSession, addActivity],
  );

  const handleRunAction = useCallback(
    (action: ActionType) => {
      if (action.mode === "claude") {
        // Claude actions write into the active Claude terminal
        if (!activeTerminalId) return;
        window.api.terminal.write(activeTerminalId, action.command + "\n");
      } else if (action.mode === "shell") {
        // Shell actions open in the split pane
        // Setting new state unmounts the old TerminalView, whose cleanup kills the old PTY
        const cwd = activeTerminal?.cwd || window.api.homeDir;
        const id = crypto.randomUUID();
        setSplitPane({ id, cwd, command: action.command, label: action.label });
      }
      addActivity("command_run", action.label);
    },
    [activeTerminalId, activeTerminal, splitPane, addActivity],
  );

  const handleWorktreeSession = useCallback(
    (cwd: string, name: string) => {
      handleNewSession(name, cwd);
      setShowWorktrees(false);
    },
    [handleNewSession],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!e.metaKey) return;
      const terms = terminalsRef.current;
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const idx = terms.findIndex((t) => t.terminalId === activeTerminalIdRef.current);
        const next = e.key === "[" ? idx - 1 : idx + 1;
        if (next >= 0 && next < terms.length) setActiveTerminalId(terms[next].terminalId);
      }
      if (e.key >= "0" && e.key <= "9") {
        const idx = e.key === "0" ? 9 : parseInt(e.key) - 1;
        if (idx < terms.length) setActiveTerminalId(terms[idx].terminalId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        overflow: "hidden",
      }}
    >
      <TitleBar />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Terminal area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, display: "flex" }}>
            {/* Main terminal (Claude) */}
            <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
              {terminals.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    Select a session or create a new one
                  </span>
                  <button
                    onClick={() => setShowNewSession(true)}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-full)",
                      padding: "8px 20px",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                      transition: "all 200ms var(--ease-spring)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    New Session
                  </button>
                </div>
              ) : (
                terminals.map((t) => (
                  <TerminalView
                    key={t.terminalId}
                    sessionId={t.terminalId}
                    cwd={t.cwd}
                    isActive={t.terminalId === activeTerminalId}
                    resumeSessionId={t.resumeSessionId}
                  />
                ))
              )}
            </div>

            {/* Split pane (shell commands) */}
            {splitPane && (
              <>
                <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />
                <div
                  style={{
                    width: "40%",
                    minWidth: 200,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Split header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 8px 4px 12px",
                      background: "var(--bg)",
                      borderBottom: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--text-muted)",
                      }}
                    >
                      {splitPane.label}
                    </span>
                    <button
                      onClick={handleCloseSplit}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        transition: "color 150ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {/* Split terminal */}
                  <div style={{ flex: 1, position: "relative" }}>
                    <TerminalView
                      sessionId={splitPane.id}
                      cwd={splitPane.cwd}
                      isActive
                      shellCommand={splitPane.command}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <StatusBar session={activeSessionForStatus} />
        </div>

        {/* Right sidebar */}
        <div
          style={{
            width: 340,
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <NewSessionDialog
              isOpen={showNewSession}
              onClose={() => setShowNewSession(false)}
              onCreate={handleNewSession}
            />
            <SessionPanel
              sessions={sessions}
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              activity={activity}
              onResumeSession={handleResumeSession}
              onSelectTerminal={setActiveTerminalId}
              onCloseTerminal={handleCloseTerminal}
              onDeleteSession={handleDeleteSession}
              onNewSession={() => setShowNewSession(true)}
              onNewSessionInProject={(cwd, name) => handleNewSession(name, cwd)}
            />
          </div>

          <div style={{ height: "45%", display: "flex", flexDirection: "column", minHeight: 200 }}>
            <Toolkit
              session={activeSessionForStatus}
              onRunAction={handleRunAction}
              onShowWorktrees={() => setShowWorktrees(true)}
            />
          </div>

          <WorktreePanel
            cwd={activeTerminal?.cwd || window.api.homeDir}
            isOpen={showWorktrees}
            onClose={() => setShowWorktrees(false)}
            onCreateSession={handleWorktreeSession}
          />
        </div>
      </div>
    </div>
  );
}
