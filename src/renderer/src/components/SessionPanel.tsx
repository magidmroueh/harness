import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Session, TerminalInstance, PanelTab, IconHandle, ConfigSelection, ProviderId } from "../types";
import { timeAgo } from "../utils/time";
import { SearchIcon, PlusIcon } from "./icons";
import { ConfigPanel } from "./ConfigPanel";

interface Props {
  sessions: Session[];
  selectedProvider: ProviderId;
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  unreadByTerminal: Map<string, number>;
  activeCwd: string | null;
  onResumeSession: (session: Session) => void;
  onSelectTerminal: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onDeleteSession: (session: Session) => void;
  onNewSession: () => void;
  onNewSessionInProject: (cwd: string, name: string) => void;
  selectedConfig: ConfigSelection | null;
  onSelectConfig: (sel: ConfigSelection | null) => void;
}

interface ProjectGroup {
  name: string;
  cwd: string;
  branch: string;
  sessions: Session[];
}

export function SessionPanel({
  sessions,
  selectedProvider,
  terminals,
  activeTerminalId,
  unreadByTerminal,
  activeCwd,
  onResumeSession,
  onSelectTerminal,
  onCloseTerminal,
  onDeleteSession,
  onNewSession,
  onNewSessionInProject,
  selectedConfig,
  onSelectConfig,
}: Props) {
  const [tab, setTab] = useState<PanelTab>("sessions");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchIconRef = useRef<IconHandle>(null);
  const plusIconRef = useRef<IconHandle>(null);

  // Cmd+F to open search, Escape to close. Skip when on the Skills tab — it has its own search.
  useEffect(() => {
    if (tab === "skills") return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTab("sessions");
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, tab]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);

  // Group sessions by project (cwd), filtered by search query
  const projects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const groups = new Map<string, ProjectGroup>();
    for (const s of sessions) {
      // When searching, filter sessions that match the query
      if (q) {
        const haystack = `${s.name} ${s.label} ${s.branch} ${s.cwd} ${s.model}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      const existing = groups.get(s.cwd);
      if (existing) {
        existing.sessions.push(s);
      } else {
        groups.set(s.cwd, { name: s.name, cwd: s.cwd, branch: s.branch, sessions: [s] });
      }
    }
    for (const g of groups.values()) {
      g.sessions.sort((a, b) => b.lastActivity - a.lastActivity);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, searchQuery]);

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
          {(["sessions", "skills"] as PanelTab[]).map((t) => (
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
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {tab === "sessions" && (
          <div
            onClick={() => {
              setSearchOpen(true);
              setTab("sessions");
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            onMouseEnter={() => searchIconRef.current?.startAnimation()}
            onMouseLeave={() => searchIconRef.current?.stopAnimation()}
            data-tooltip="⌘F"
            data-tooltip-pos="bottom"
            style={{
              color: searchOpen ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 150ms",
            }}
          >
            <SearchIcon ref={searchIconRef} size={16} />
          </div>
          )}
          {tab === "sessions" && (
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
              transition: "color 150ms, border-color 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.borderColor = "var(--text-muted)";
              plusIconRef.current?.startAnimation();
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.borderColor = "var(--border)";
              plusIconRef.current?.stopAnimation();
            }}
          >
            <PlusIcon ref={plusIconRef} size={16} />
          </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && tab === "sessions" && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions..."
            style={{
              flex: 1,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "5px 10px",
              fontSize: "0.78rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />
          <button
            onClick={closeSearch}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: "2px 4px",
              flexShrink: 0,
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
      )}

      {/* Skills tab: panel takes over everything below the tab bar */}
      {tab === "skills" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ConfigPanel
            provider={selectedProvider}
            cwd={activeCwd}
            isActive={tab === "skills"}
            selected={selectedConfig}
            onSelect={onSelectConfig}
          />
        </div>
      )}

      {/* Content */}
      {tab === "sessions" && (
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {projects.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.8125rem",
              }}
            >
              {searchQuery ? "No matching sessions" : "No sessions found"}
            </div>
          ) : (
            projects.map((project) => {
              const isExpanded = searchQuery ? true : expandedProjects.has(project.cwd);
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
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewSessionInProject(project.cwd, project.name);
                      }}
                      style={{
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        transition: "color 150ms",
                      }}
                    >
                      <PlusIcon size={16} />
                    </div>
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
                      const hasUnread = attachedTerminal != null && (unreadByTerminal.get(attachedTerminal.terminalId) || 0) > 0;

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
                                  hasUnread
                                    ? "var(--dot-working)"
                                    : session.status === "active"
                                      ? "var(--dot-current)"
                                      : "var(--dot-past)",
                                boxShadow:
                                  hasUnread
                                    ? "0 0 0 3px rgba(251,191,36,0.3)"
                                    : session.status === "active"
                                      ? "0 0 0 3px rgba(74,222,128,0.2)"
                                      : "none",
                                animation:
                                  hasUnread
                                    ? "pulse 2s infinite"
                                    : undefined,
                              }}
                            />
                            <span
                              data-tooltip={session.label}
                              data-tooltip-pos="bottom"
                              style={{
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  color: "var(--text-secondary)",
                                  fontSize: "0.75rem",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  display: "block",
                                }}
                              >
                                {session.label}
                              </span>
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
                              selectedProvider === "claude" && (
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
                              )
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
          )}
      </div>
      )}

      {tab === "sessions" && (
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
        <span>⌘F Search</span>
        <span>⌘J Terminal</span>
      </div>
      )}

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
