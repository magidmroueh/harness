import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConfigEntry, ConfigKind, ConfigScope, ConfigSelection } from "../types";
import { useClaudeConfig, type ConfigProvider } from "../hooks/useClaudeConfig";

interface Props {
  provider: ConfigProvider;
  cwd: string | null;
  isActive: boolean;
  selected: ConfigSelection | null;
  onSelect: (sel: ConfigSelection | null) => void;
}

const CLAUDE_TABS: { id: ConfigKind; label: string }[] = [
  { id: "skill", label: "Skills" },
  { id: "agent", label: "Agents" },
  { id: "command", label: "Commands" },
  { id: "claudemd", label: "CLAUDE.md" },
];

const NON_CLAUDE_TABS: { id: ConfigKind; label: string }[] = [
  { id: "skill", label: "Skills" },
  { id: "claudemd", label: "AGENTS.md" },
];

function instructionsName(provider: ConfigProvider): string {
  return provider === "claude" ? "CLAUDE.md" : "AGENTS.md";
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function ConfigPanel({ provider, cwd, isActive, selected, onSelect }: Props) {
  const kindTabs = provider === "claude" ? CLAUDE_TABS : NON_CLAUDE_TABS;
  const instrName = instructionsName(provider);
  const [activeKind, setActiveKind] = useState<ConfigKind>("skill");

  useEffect(() => {
    if (!kindTabs.some((t) => t.id === activeKind)) {
      setActiveKind("skill");
      onSelect(null);
    }
  }, [kindTabs, activeKind, onSelect]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [newGlobal, setNewGlobal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: entries = [] } = useClaudeConfig(provider, cwd);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, searchOpen]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return entries.filter((e) => {
      if (e.kind !== activeKind) return false;
      if (!q) return true;
      const hay = `${e.name} ${e.description || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, activeKind, searchQuery]);

  const projectEntries = useMemo(
    () =>
      filtered
        .filter((e) => e.scope === "project")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );
  const globalEntries = useMemo(
    () =>
      filtered.filter((e) => e.scope === "global").sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  const projectLabel = cwd ? basename(cwd) : null;

  const handleCreate = useCallback(
    async (scope: ConfigScope) => {
      const trimmed = newName.trim();
      if (activeKind === "claudemd") {
        setCreating(true);
        try {
          await window.api.config.create(provider, "claudemd", scope, instrName, cwd);
          queryClient.invalidateQueries({ queryKey: ["claude-config"] });
          onSelect({ kind: "claudemd", scope, name: instrName });
        } finally {
          setCreating(false);
          setNewProject(false);
          setNewGlobal(false);
          setNewName("");
        }
        return;
      }
      if (!trimmed) return;
      setCreating(true);
      try {
        await window.api.config.create(provider, activeKind, scope, trimmed, cwd);
        queryClient.invalidateQueries({ queryKey: ["claude-config"] });
        onSelect({ kind: activeKind, scope, name: trimmed });
        setNewName("");
        setNewProject(false);
        setNewGlobal(false);
      } finally {
        setCreating(false);
      }
    },
    [activeKind, provider, instrName, cwd, newName, queryClient, onSelect],
  );

  const existingProjectClaudeMd = projectEntries.find((e) => e.kind === "claudemd");
  const existingGlobalClaudeMd = globalEntries.find((e) => e.kind === "claudemd");

  const renderRow = (entry: ConfigEntry) => {
    const isSel =
      selected &&
      selected.kind === entry.kind &&
      selected.scope === entry.scope &&
      selected.name === entry.name;
    return (
      <div
        key={`${entry.scope}:${entry.kind}:${entry.name}`}
        onClick={() =>
          onSelect({ kind: entry.kind, scope: entry.scope, name: entry.name })
        }
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          borderLeft: isSel ? "2px solid var(--accent)" : "2px solid transparent",
          cursor: "pointer",
          transition: "background 150ms",
          background: isSel ? "var(--border-subtle)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isSel) e.currentTarget.style.background = "var(--border-subtle)";
        }}
        onMouseLeave={(e) => {
          if (!isSel) e.currentTarget.style.background = "transparent";
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.kind === "claudemd" ? instrName : entry.name}
          </span>
          <span
            style={{
              fontSize: "0.6rem",
              color: "var(--text-muted)",
              background: "var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "1px 6px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              flexShrink: 0,
            }}
          >
            {entry.scope === "global" ? "Global" : "Project"}
          </span>
        </div>
        {entry.description && (
          <div
            style={{
              marginTop: 3,
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.description}
          </div>
        )}
      </div>
    );
  };

  const renderNewRow = (scope: ConfigScope, visible: boolean, onCancel: () => void) => {
    if (!visible) return null;
    if (activeKind === "claudemd") {
      return (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--bg-surface)",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", flex: 1 }}>
            Create {instrName} ({scope})?
          </span>
          <button
            onClick={() => void handleCreate(scope)}
            disabled={creating}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
              fontSize: "0.72rem",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {creating ? "..." : "Create"}
          </button>
          <button
            onClick={onCancel}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.72rem",
              fontFamily: "var(--font-sans)",
            }}
          >
            Cancel
          </button>
        </div>
      );
    }
    return (
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--bg-surface)",
        }}
      >
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate(scope);
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Name..."
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 8px",
            fontSize: "0.78rem",
            color: "var(--text-primary)",
            fontFamily: "var(--font-sans)",
            outline: "none",
          }}
        />
        <button
          onClick={() => void handleCreate(scope)}
          disabled={creating || !newName.trim()}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "3px 10px",
            fontSize: "0.72rem",
            color: newName.trim() ? "var(--text-primary)" : "var(--text-muted)",
            cursor: newName.trim() ? "pointer" : "default",
            fontFamily: "var(--font-sans)",
          }}
        >
          {creating ? "..." : "Create"}
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.72rem",
            padding: "3px 4px",
            fontFamily: "var(--font-sans)",
          }}
        >
          ✕
        </button>
      </div>
    );
  };

  const renderSectionHeader = (
    title: string,
    count: number,
    onNew: (() => void) | null,
    disableNewReason?: string,
    hideNew?: boolean,
  ) => (
    <div
      style={{
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <span
        style={{
          fontSize: "0.65rem",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          background: "var(--border)",
          borderRadius: "var(--radius-full)",
          padding: "1px 6px",
          fontWeight: 500,
        }}
      >
        {count}
      </span>
      <span style={{ flex: 1 }} />
      {!hideNew && onNew && (
        <button
          onClick={onNew}
          disabled={Boolean(disableNewReason)}
          data-tooltip={disableNewReason}
          data-tooltip-pos="bottom"
          style={{
            background: "none",
            border: "none",
            color: disableNewReason ? "var(--text-muted)" : "var(--text-muted)",
            cursor: disableNewReason ? "default" : "pointer",
            fontSize: "0.7rem",
            padding: "2px 6px",
            fontFamily: "var(--font-sans)",
            opacity: disableNewReason ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disableNewReason) e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          + New
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Sub-tab strip */}
      <div
        style={{
          display: "flex",
          gap: 14,
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {kindTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveKind(t.id);
              onSelect(null);
              setNewProject(false);
              setNewGlobal(false);
              setNewName("");
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: "0.75rem",
              fontWeight: 500,
              color: activeKind === t.id ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              transition: "color 150ms",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {searchOpen && (
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
            placeholder="Filter..."
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
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.7rem",
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {/* Project section */}
        {cwd ? (
          <>
            {renderSectionHeader(
              `Project (${projectLabel})`,
              projectEntries.length,
              () => {
                setNewProject(true);
                setNewGlobal(false);
                setNewName("");
              },
              activeKind === "claudemd" && existingProjectClaudeMd
                ? `${instrName} already exists`
                : undefined,
              activeKind === "claudemd" && Boolean(existingProjectClaudeMd),
            )}
            {renderNewRow("project", newProject, () => {
              setNewProject(false);
              setNewName("");
            })}
            {projectEntries.length === 0 && !newProject ? (
              <div
                style={{
                  padding: "12px 16px",
                  color: "var(--text-muted)",
                  fontSize: "0.75rem",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                No {activeKind === "claudemd" ? instrName : activeKind + "s"} in this project
              </div>
            ) : (
              projectEntries.map(renderRow)
            )}
          </>
        ) : (
          <div
            style={{
              padding: "10px 16px",
              color: "var(--text-muted)",
              fontSize: "0.72rem",
              fontStyle: "italic",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Select a session to enable project scope
          </div>
        )}

        {/* Global section */}
        {renderSectionHeader(
          "Global",
          globalEntries.length,
          () => {
            setNewGlobal(true);
            setNewProject(false);
            setNewName("");
          },
          activeKind === "claudemd" && existingGlobalClaudeMd
            ? `${instrName} already exists`
            : undefined,
          activeKind === "claudemd" && Boolean(existingGlobalClaudeMd),
        )}
        {renderNewRow("global", newGlobal, () => {
          setNewGlobal(false);
          setNewName("");
        })}
        {globalEntries.length === 0 && !newGlobal ? (
          <div
            style={{
              padding: "12px 16px",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            No {activeKind === "claudemd" ? instrName : activeKind + "s"} globally
          </div>
        ) : (
          globalEntries.map(renderRow)
        )}
      </div>

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
        <span>⌘S Save</span>
      </div>
    </div>
  );
}
