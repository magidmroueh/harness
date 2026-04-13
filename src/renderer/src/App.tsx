import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Session, TerminalInstance, ToolkitAction as ActionType, ConfigSelection } from "./types";
import { useSessions, useDeleteSession } from "./hooks/useSessions";
import { useTheme } from "./hooks/useTheme";
import { useNotifications } from "./hooks/useNotifications";
import { useNotificationSound } from "./hooks/useNotificationSound";
import { TitleBar } from "./components/TitleBar";
import { SessionPanel } from "./components/SessionPanel";
import { TerminalView } from "./components/TerminalView";
import { Toolkit } from "./components/Toolkit";
import { WorktreePanel } from "./components/WorktreePanel";
import { StatusBar } from "./components/StatusBar";
import { NewSessionDialog } from "./components/NewSessionDialog";
import { UpdateBanner } from "./components/UpdateBanner";
import { BottomTerminal } from "./components/BottomTerminal";
import { ConfigEditor } from "./components/ConfigEditor";

const SIDEBAR_WIDTH_KEY = "harness.configEditor.sidebarWidth";
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 340;

function readSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT;
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, n));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

interface SplitPane {
  id: string;
  cwd: string;
  command: string;
  label: string;
}

type SplitPanesMap = Map<string, SplitPane>;

export function App() {
  const { data: sessions = [] } = useSessions();
  const deleteSession = useDeleteSession();
  const { theme, toggle: toggleTheme } = useTheme();

  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [splitPanes, setSplitPanes] = useState<SplitPanesMap>(() => new Map());
  const [showNewSession, setShowNewSession] = useState(false);
  const [showBottomTerminal, setShowBottomTerminal] = useState(false);
  const [showWorktrees, setShowWorktrees] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ConfigSelection | null>(null);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readSidebarWidth());
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleCloseEditor = useCallback(() => {
    setSelectedConfig(null);
    setEditorFullscreen(false);
  }, []);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      let lastWidth = sidebarWidth;
      const onMove = (me: MouseEvent) => {
        const st = dragStateRef.current;
        if (!st) return;
        const delta = st.startX - me.clientX;
        lastWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, st.startWidth + delta));
        setSidebarWidth(lastWidth);
      };
      const onUp = () => {
        dragStateRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(lastWidth));
        } catch {
          /* ignore quota errors */
        }
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [sidebarWidth],
  );

  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;

  const handleFocusTerminal = useCallback((terminalId: string) => {
    if (terminalsRef.current.some((t) => t.terminalId === terminalId)) {
      setActiveTerminalId(terminalId);
    }
  }, []);

  const { unreadByTerminal, unreadCount } = useNotifications(activeTerminalId, handleFocusTerminal);
  useNotificationSound(unreadCount);

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
        packageManager: activeTerminal.packageManager,
      }
    );
  }, [activeTerminal, sessions]);

  const handleResumeSession = useCallback(async (session: Session) => {
    const terminalId = crypto.randomUUID();
    const pm = session.packageManager || (await window.api.sessions.detectPM(session.cwd));
    setTerminals((prev) => [
      ...prev,
      {
        terminalId,
        cwd: session.cwd,
        projectName: session.name,
        packageManager: pm,
        resumeSessionId: session.sessionId,
      },
    ]);
    setActiveTerminalId(terminalId);
  }, []);

  const handleNewSession = useCallback(async (name: string, cwd: string) => {
    const expandedCwd = cwd.startsWith("~/") ? cwd.replace("~", window.api.homeDir) : cwd;
    const terminalId = crypto.randomUUID();
    const pm = await window.api.sessions.detectPM(expandedCwd);
    setTerminals((prev) => [
      ...prev,
      { terminalId, cwd: expandedCwd, projectName: name, packageManager: pm },
    ]);
    setActiveTerminalId(terminalId);
  }, []);

  const handleCloseTerminal = useCallback((terminalId: string) => {
    // Don't kill PTY here — TerminalView's cleanup handles it on unmount
    setTerminals((prev) => {
      const remaining = prev.filter((t) => t.terminalId !== terminalId);
      setActiveTerminalId((id) =>
        id === terminalId ? (remaining.at(-1)?.terminalId ?? null) : id,
      );
      return remaining;
    });
    setSplitPanes((prev) => {
      if (!prev.has(terminalId)) return prev;
      const next = new Map(prev);
      next.delete(terminalId);
      return next;
    });
  }, []);

  const handleCloseSplit = useCallback(() => {
    if (!activeTerminalId) return;
    setSplitPanes((prev) => {
      if (!prev.has(activeTerminalId)) return prev;
      const next = new Map(prev);
      next.delete(activeTerminalId);
      return next;
    });
  }, [activeTerminalId]);

  const handleDeleteSession = useCallback(
    (session: Session) => {
      deleteSession.mutate(session);
    },
    [deleteSession],
  );

  const handleRunAction = useCallback(
    (action: ActionType) => {
      if (action.mode === "claude") {
        if (!activeTerminalId) return;
        window.api.terminal.write(activeTerminalId, action.command + "\r");
      } else if (action.mode === "shell") {
        if (!activeTerminalId) return;
        const cwd = activeTerminal?.cwd || window.api.homeDir;
        const id = crypto.randomUUID();
        setSplitPanes((prev) => {
          const next = new Map(prev);
          next.set(activeTerminalId, { id, cwd, command: action.command, label: action.label });
          return next;
        });
      }
    },
    [activeTerminalId, activeTerminal],
  );

  const activeSplitPane = activeTerminalId ? splitPanes.get(activeTerminalId) || null : null;

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
      if (e.key === "j") {
        e.preventDefault();
        setShowBottomTerminal((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
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
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />
      <UpdateBanner />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Main area: either terminals or the config editor */}
        {selectedConfig && !editorFullscreen ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <ConfigEditor
              kind={selectedConfig.kind}
              scope={selectedConfig.scope}
              name={selectedConfig.name}
              cwd={activeTerminal?.cwd || null}
              onClose={handleCloseEditor}
              onDeleted={handleCloseEditor}
              isFullscreen={editorFullscreen}
              onToggleFullscreen={() => setEditorFullscreen((v) => !v)}
            />
          </div>
        ) : (
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
                    theme={theme}
                  />
                ))
              )}
            </div>

            {/* Split panes (per-terminal shell commands). All panes stay
                mounted across session switches; only the active terminal's
                pane is visible. */}
            {splitPanes.size > 0 && (
              <>
                <div
                  style={{
                    width: activeSplitPane ? 1 : 0,
                    background: "var(--border)",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    width: activeSplitPane ? "40%" : 0,
                    minWidth: activeSplitPane ? 200 : 0,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {Array.from(splitPanes.entries()).map(([termId, pane]) => {
                    const isActive = termId === activeTerminalId;
                    return (
                      <div
                        key={pane.id}
                        style={{
                          display: isActive ? "flex" : "none",
                          flexDirection: "column",
                          flex: 1,
                          minHeight: 0,
                        }}
                      >
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
                            {pane.label}
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
                        <div style={{ flex: 1, position: "relative" }}>
                          <TerminalView
                            sessionId={pane.id}
                            cwd={pane.cwd}
                            isActive={isActive}
                            shellCommand={pane.command}
                            theme={theme}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <StatusBar
            session={activeSessionForStatus}
            unreadCount={unreadCount}
            bottomTerminalOpen={showBottomTerminal}
            onToggleBottomTerminal={() => setShowBottomTerminal((prev) => !prev)}
          />
          <BottomTerminal
            isOpen={showBottomTerminal}
            onToggle={() => setShowBottomTerminal(false)}
            theme={theme}
          />
        </div>
        )}

        {selectedConfig && !editorFullscreen && (
          <div
            onMouseDown={handleDividerMouseDown}
            style={{
              width: 4,
              cursor: "col-resize",
              background: "var(--border)",
              flexShrink: 0,
              transition: "background 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--text-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--border)";
            }}
          />
        )}

        {/* Right sidebar */}
        <div
          style={{
            width: selectedConfig && !editorFullscreen ? sidebarWidth : 340,
            borderLeft: selectedConfig && !editorFullscreen ? "none" : "1px solid var(--border)",
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
              unreadByTerminal={unreadByTerminal}
              activeCwd={activeTerminal?.cwd || null}
              onResumeSession={handleResumeSession}
              onSelectTerminal={setActiveTerminalId}
              onCloseTerminal={handleCloseTerminal}
              onDeleteSession={handleDeleteSession}
              onNewSession={() => setShowNewSession(true)}
              onNewSessionInProject={(cwd, name) => handleNewSession(name, cwd)}
              selectedConfig={selectedConfig}
              onSelectConfig={setSelectedConfig}
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

        {selectedConfig && editorFullscreen && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              background: "var(--bg)",
              display: "flex",
            }}
          >
            <ConfigEditor
              kind={selectedConfig.kind}
              scope={selectedConfig.scope}
              name={selectedConfig.name}
              cwd={activeTerminal?.cwd || null}
              onClose={handleCloseEditor}
              onDeleted={handleCloseEditor}
              isFullscreen={editorFullscreen}
              onToggleFullscreen={() => setEditorFullscreen((v) => !v)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
