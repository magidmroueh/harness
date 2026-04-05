import { useState, useEffect, useMemo } from "react";
import { Session, TerminalInstance, PanelTab, ActivityEvent, AttentionEvent } from "../types";
import { timeAgo } from "../utils/time";
import { NotificationPanel } from "./NotificationPanel";

interface Props {
  sessions: Session[];
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  activity: ActivityEvent[];
  notifications: AttentionEvent[];
  unreadByTerminal: Map<string, number>;
  unreadCount: number;
  terminalNames: Map<string, string>;
  onDismissNotification: (id: string) => void;
  onClearNotifications: () => void;
  onResumeSession: (session: Session) => void;
  onSelectTerminal: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onDeleteSession: (session: Session) => void;
  onNewSession: () => void;
  onNewSessionInProject: (cwd: string, name: string) => void;
}

function Badge({ count, size = "md", pulse = false }: { count: number; size?: "sm" | "md"; pulse?: boolean }) {
  const dim = size === "sm" ? 14 : 16;
  const font = size === "sm" ? "0.55rem" : "0.6rem";
  const pad = size === "sm" ? "0 4px" : "0 5px";
  return (
    <span
      style={{
        background: "var(--dot-working)",
        color: "#000",
        fontSize: font,
        fontWeight: 700,
        borderRadius: "var(--radius-full)",
        padding: pad,
        minWidth: dim,
        height: dim,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        animation: pulse ? "pulse 2s infinite" : undefined,
      }}
    >
      {count}
    </span>
  );
}

interface ProjectGroup {
  name: string;
  cwd: string;
  branch: string;
  sessions: Session[];
}

export function SessionPanel({
  sessions,
  terminals,
  activeTerminalId,
  activity,
  notifications,
  unreadByTerminal,
  unreadCount,
  terminalNames,
  onDismissNotification,
  onClearNotifications,
  onResumeSession,
  onSelectTerminal,
  onCloseTerminal,
  onDeleteSession,
  onNewSession,
  onNewSessionInProject,
}: Props) {
  const [tab, setTab] = useState<PanelTab>("sessions");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);

  // Group sessions by project (cwd)
  const projects = useMemo(() => {
    const groups = new Map<string, ProjectGroup>();
    for (const s of sessions) {
      const existing = groups.get(s.cwd);
      if (existing) {
        existing.sessions.push(s);
      } else {
        groups.set(s.cwd, { name: s.name, cwd: s.cwd, branch: s.branch, sessions: [s] });
      }
    }
    // Sort sessions within each group by lastActivity desc
    for (const g of groups.values()) {
      g.sessions.sort((a, b) => b.lastActivity - a.lastActivity);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  // Auto-expand projects on first load
  useEffect(() => {
    if (expandedProjects.size === 0 && projects.length > 0) {
      setExpandedProjects(new Set(projects.map((p) => p.cwd)));
    }
  }, [projects, expandedProjects.size]);

  const toggleProject = (cwd: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  // Which sessions have an active terminal?
  const resumedSessionIds = useMemo(() => {
    return new Set(terminals.map((t) => t.resumeSessionId).filter(Boolean));
  }, [terminals]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          height: 44,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          {(["sessions", "notifications", "activity"] as PanelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "color 150ms",
                fontFamily: "var(--font-sans)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {t === "notifications" ? "alerts" : t}
              {t === "notifications" && unreadCount > 0 && (
                <Badge count={unreadCount} />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onNewSession}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
            cursor: "pointer",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            transition: "color 150ms, border-color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          +
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "sessions" ? (
          projects.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.8125rem",
              }}
            >
              No sessions found
            </div>
          ) : (
            projects.map((project) => {
              const isExpanded = expandedProjects.has(project.cwd);
              return (
                <div key={project.cwd}>
                  {/* Project header (accordion toggle) */}
                  <div
                    onClick={() => toggleProject(project.cwd)}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--border-subtle)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        transition: "transform 150ms",
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        display: "inline-block",
                      }}
                    >
                      ▶
                    </span>
                    <span
                      style={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {project.name}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      ⌥ {project.branch}
                    </span>
                    <span style={{ marginLeft: "auto" }} />
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        background: "var(--border)",
                        borderRadius: "var(--radius-full)",
                        padding: "1px 6px",
                        fontWeight: 500,
                      }}
                    >
                      {project.sessions.length}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewSessionInProject(project.cwd, project.name);
                      }}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        width: 22,
                        height: 22,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                        flexShrink: 0,
                        transition: "color 150ms, border-color 150ms",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                        e.currentTarget.style.borderColor = "var(--text-muted)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* Sessions under this project */}
                  {isExpanded &&
                    project.sessions.map((session) => {
                      const isResumed = resumedSessionIds.has(session.sessionId);
                      // Find the terminal attached to this session (if any)
                      const attachedTerminal = terminals.find(
                        (t) => t.resumeSessionId === session.sessionId,
                      );
                      const isActiveTerminal = attachedTerminal?.terminalId === activeTerminalId;

                      return (
                        <div
                          key={session.sessionId}
                          onClick={() => {
                            if (attachedTerminal) {
                              onSelectTerminal(attachedTerminal.terminalId);
                            } else {
                              onResumeSession(session);
                            }
                          }}
                          style={{
                            padding: "8px 16px 8px 36px",
                            borderBottom: "1px solid var(--border)",
                            borderLeft: isActiveTerminal
                              ? "2px solid var(--accent)"
                              : "2px solid transparent",
                            cursor: "pointer",
                            transition: "background 150ms",
                            background: isActiveTerminal ? "var(--border-subtle)" : "transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActiveTerminal)
                              e.currentTarget.style.background = "var(--border-subtle)";
                            const del = e.currentTarget.querySelector(
                              "[data-delete]",
                            ) as HTMLElement;
                            if (del) del.style.opacity = "0.6";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActiveTerminal) e.currentTarget.style.background = "transparent";
                            const del = e.currentTarget.querySelector(
                              "[data-delete]",
                            ) as HTMLElement;
                            if (del) del.style.opacity = "0";
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: "0.78rem",
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                flexShrink: 0,
                                backgroundColor:
                                  session.status === "active"
                                    ? "var(--dot-current)"
                                    : "var(--dot-past)",
                                boxShadow:
                                  session.status === "active"
                                    ? "0 0 0 3px rgba(74,222,128,0.2)"
                                    : "none",
                              }}
                            />
                            <span
                              style={{
                                color: "var(--text-secondary)",
                                fontSize: "0.75rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              {session.label}
                            </span>
                            <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                              {timeAgo(session.lastActivity)}
                            </span>
                            {isResumed && (
                              <span
                                style={{
                                  marginLeft: "auto",
                                  fontSize: "0.65rem",
                                  color: "var(--accent)",
                                  fontWeight: 500,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                attached
                              </span>
                            )}
                            {attachedTerminal &&
                              (unreadByTerminal.get(attachedTerminal.terminalId) || 0) > 0 && (
                                <span style={{ marginLeft: isResumed ? 4 : "auto" }}>
                                  <Badge
                                    count={unreadByTerminal.get(attachedTerminal.terminalId)!}
                                    size="sm"
                                    pulse
                                  />
                                </span>
                              )}
                            {attachedTerminal ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCloseTerminal(attachedTerminal.terminalId);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: "0.7rem",
                                  padding: "0 2px",
                                  opacity: 0.5,
                                  transition: "opacity 150ms",
                                  marginLeft: isResumed ? 4 : "auto",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = "1";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = "0.5";
                                }}
                              >
                                ✕
                              </button>
                            ) : (
                              <button
                                data-delete
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(session);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--dot-error)",
                                  cursor: "pointer",
                                  fontSize: "0.65rem",
                                  padding: "1px 4px",
                                  opacity: 0,
                                  transition: "opacity 150ms",
                                  marginLeft: "auto",
                                  fontFamily: "var(--font-sans)",
                                  fontWeight: 500,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = "1";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = "0";
                                }}
                              >
                                delete
                              </button>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              marginTop: 3,
                              marginLeft: 15,
                            }}
                          >
                            {session.model.split(" ")[0]} · &lt;${session.cost.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })
          )
        ) : tab === "notifications" ? (
          <NotificationPanel
            notifications={notifications}
            onDismiss={onDismissNotification}
            onClearAll={onClearNotifications}
            onSelectTerminal={onSelectTerminal}
            terminalNames={terminalNames}
          />
        ) : (
          <div style={{ padding: 16 }}>
            {activity.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.8125rem",
                  textAlign: "center",
                  paddingTop: 8,
                }}
              >
                No recent activity
              </div>
            ) : (
              activity.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span>{ev.message}</span>
                  <span style={{ float: "right", color: "var(--text-muted)", fontSize: "0.7rem" }}>
                    {new Date(ev.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Keyboard hints */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          display: "flex",
          gap: 12,
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}
      >
        <span>⌘0-9 Jump</span>
        <span>⌘[ Prev</span>
        <span>⌘] Next</span>
      </div>

      {/* Delete confirmation popup */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              maxWidth: 300,
              animation: "fadeIn 200ms var(--ease-out-expo)",
            }}
          >
            <div
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Delete session?
            </div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 4,
                }}
              >
                "{confirmDelete.label}"
              </span>
              This will permanently remove the conversation from Claude Code.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  padding: "6px 12px",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteSession(confirmDelete);
                  setConfirmDelete(null);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--dot-error)",
                  borderRadius: "var(--radius-full)",
                  color: "var(--dot-error)",
                  cursor: "pointer",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  padding: "6px 16px",
                  fontFamily: "var(--font-sans)",
                  transition: "all 200ms var(--ease-spring)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--dot-error)";
                  e.currentTarget.style.color = "var(--bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--dot-error)";
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
