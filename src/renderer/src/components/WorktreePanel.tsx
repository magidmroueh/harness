import { useState, useEffect, useCallback } from "react";
import { Worktree } from "../types";

interface Props {
  cwd: string;
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: (cwd: string, name: string) => void;
}

export function WorktreePanel({ cwd, isOpen, onClose, onCreateSession }: Props) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [newBranch, setNewBranch] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const list = await window.api.worktrees.list(cwd);
    setWorktrees(list);
  }, [cwd]);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const handleCreate = async () => {
    if (!newBranch.trim()) return;
    setCreating(true);
    const path = `${cwd}/../${newBranch.replace(/\//g, "-")}`;
    const result = await window.api.worktrees.create({
      cwd,
      path,
      branch: newBranch,
      newBranch: true,
    });
    if (result) {
      setNewBranch("");
      await refresh();
    }
    setCreating(false);
  };

  const handleRemove = async (path: string) => {
    await window.api.worktrees.remove({ cwd, path, force: false });
    await refresh();
  };

  const handleOpenSession = (wt: Worktree) => {
    const name = wt.path.split("/").pop() || wt.branch;
    onCreateSession(wt.path, name);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--bg)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 500,
            textTransform: "uppercase" as const,
            letterSpacing: "0.12em",
            color: "var(--text-muted)",
          }}
        >
          Worktrees
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          ✕
        </button>
      </div>

      {/* Worktree list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {worktrees.map((wt) => (
          <div
            key={wt.path}
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: wt.isMain ? "var(--dot-current)" : "var(--dot-past)",
                boxShadow: wt.isMain ? "0 0 0 3px rgba(74,222,128,0.2)" : "none",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {wt.branch || "detached"}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                {wt.path}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => handleOpenSession(wt)}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  padding: "4px 8px",
                  fontFamily: "var(--font-sans)",
                  transition: "color 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                Open
              </button>
              {!wt.isMain && (
                <button
                  onClick={() => handleRemove(wt.path)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--dot-error)",
                    cursor: "pointer",
                    fontSize: "0.7rem",
                    padding: "4px 8px",
                    fontFamily: "var(--font-sans)",
                    opacity: 0.6,
                    transition: "opacity 150ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "0.6";
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create new worktree */}
      <div
        style={{
          padding: 16,
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <input
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="New branch name..."
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            fontSize: "0.8125rem",
            color: "var(--text-primary)",
            fontFamily: "var(--font-sans)",
            outline: "none",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newBranch.trim()}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "6px 16px",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: newBranch.trim() ? "var(--text-primary)" : "var(--text-muted)",
            cursor: newBranch.trim() ? "pointer" : "default",
            fontFamily: "var(--font-sans)",
            transition: "all 200ms var(--ease-spring)",
            opacity: creating ? 0.5 : 1,
          }}
        >
          {creating ? "..." : "Create"}
        </button>
      </div>
    </div>
  );
}
