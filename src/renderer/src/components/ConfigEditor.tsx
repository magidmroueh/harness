import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConfigKind, ConfigScope } from "../types";
import { useClaudeConfigDetail, type ConfigProvider } from "../hooks/useClaudeConfig";

interface Props {
  provider: ConfigProvider;
  kind: ConfigKind;
  scope: ConfigScope;
  name: string;
  cwd: string | null;
  onClose: () => void;
  onDeleted: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const KNOWN_KEYS: Record<ConfigKind, string[]> = {
  skill: ["name", "description"],
  agent: ["name", "description"],
  command: ["name", "description", "allowed-tools"],
  claudemd: [],
};

function stringifyFrontmatterValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return String(value);
}

function parseFrontmatterValue(key: string, raw: string, original: unknown): unknown {
  if (key === "allowed-tools") {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts;
  }
  if (Array.isArray(original)) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return raw;
}

export function ConfigEditor({
  provider,
  kind,
  scope,
  name,
  cwd,
  onClose,
  onDeleted,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const { data: detail, isLoading } = useClaudeConfigDetail(provider, kind, scope, name, cwd);
  const queryClient = useQueryClient();

  const [formFm, setFormFm] = useState<Record<string, string>>({});
  const [formBody, setFormBody] = useState<string>("");
  const baselineRef = useRef<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [pendingBack, setPendingBack] = useState(false);

  const fmKeys = useMemo(() => {
    if (!detail) return [] as string[];
    const known = KNOWN_KEYS[kind];
    const all = Object.keys(detail.frontmatter || {});
    const extras = all.filter((k) => !known.includes(k));
    return [...known, ...extras];
  }, [detail, kind]);

  useEffect(() => {
    if (!detail) return;
    const fm: Record<string, string> = {};
    const keys = new Set<string>([...(KNOWN_KEYS[kind] || []), ...Object.keys(detail.frontmatter || {})]);
    for (const k of keys) {
      fm[k] = stringifyFrontmatterValue(detail.frontmatter?.[k]);
    }
    const body = detail.body || "";
    setFormFm(fm);
    setFormBody(body);
    baselineRef.current = JSON.stringify({ fm, body });
  }, [detail, kind]);

  const isDirty = useMemo(() => {
    if (baselineRef.current === "") return false;
    return JSON.stringify({ fm: formFm, body: formBody }) !== baselineRef.current;
  }, [formFm, formBody]);

  const buildNextFm = useCallback((): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...detail?.frontmatter };
    for (const k of Object.keys(formFm)) {
      const raw = formFm[k];
      if (k === "name") {
        next[k] = raw;
        continue;
      }
      next[k] = parseFrontmatterValue(k, raw, detail?.frontmatter?.[k]);
    }
    return next;
  }, [detail, formFm]);

  const handleSave = useCallback(async () => {
    if (!detail || !isDirty || saving) return;
    setSaving(true);
    try {
      const nextFm = buildNextFm();
      await window.api.config.write(provider, kind, scope, name, cwd, nextFm, formBody);
      queryClient.invalidateQueries({ queryKey: ["claude-config"] });
      queryClient.invalidateQueries({
        queryKey: ["claude-config-detail", provider, kind, scope, name, cwd],
      });
      baselineRef.current = JSON.stringify({ fm: formFm, body: formBody });
      if (pendingBack) {
        setPendingBack(false);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }, [detail, isDirty, saving, buildNextFm, provider, kind, scope, name, cwd, formBody, formFm, queryClient, pendingBack, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  useEffect(() => {
    return () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    };
  }, []);

  const handleReveal = () => {
    void window.api.config.reveal(provider, kind, scope, name, cwd);
  };

  const handleOpenExternal = () => {
    void window.api.config.openExternal(provider, kind, scope, name, cwd);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await window.api.config.remove(provider, kind, scope, name, cwd);
    queryClient.invalidateQueries({ queryKey: ["claude-config"] });
    onDeleted();
  };

  const otherScope: ConfigScope = scope === "global" ? "project" : "global";
  const canDuplicate = otherScope === "global" || Boolean(cwd);

  const handleDuplicate = async () => {
    if (!detail || duplicating || !canDuplicate) return;
    setDuplicating(true);
    try {
      await window.api.config.create(provider, kind, otherScope, name, cwd);
      await window.api.config.write(provider, kind, otherScope, name, cwd, buildNextFm(), formBody);
      queryClient.invalidateQueries({ queryKey: ["claude-config"] });
      setDuplicatePrompt(false);
    } finally {
      setDuplicating(false);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      setPendingBack(true);
      return;
    }
    onClose();
  };

  if (isLoading || !detail) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--text-muted)",
          fontSize: "0.8125rem",
        }}
      >
        Loading...
      </div>
    );
  }

  const isClaudeMd = kind === "claudemd";
  const scopeLabel = scope === "global" ? "Global" : "Project";
  const displayName = isClaudeMd ? "CLAUDE.md" : name;

  const pad = isFullscreen ? 24 : 20;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: `12px ${pad}px`,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.85rem",
            padding: "4px 6px",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
          <span
            style={{
              fontSize: "0.6rem",
              color: "var(--text-muted)",
              background: "var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "1px 8px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              flexShrink: 0,
            }}
          >
            {scopeLabel}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: `8px ${pad}px`,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "4px 12px",
            fontSize: "0.72rem",
            fontWeight: 500,
            color: isDirty ? "var(--text-primary)" : "var(--text-muted)",
            cursor: isDirty && !saving ? "pointer" : "default",
            fontFamily: "var(--font-sans)",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={handleReveal}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "4px 12px",
            fontSize: "0.72rem",
            fontWeight: 500,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          Reveal
        </button>
        <button
          onClick={handleOpenExternal}
          data-tooltip="Open in external editor"
          data-tooltip-pos="bottom"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "4px 10px",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          ↗
        </button>
        {!isClaudeMd && (
          <button
            onClick={() => {
              if (!canDuplicate) return;
              if (duplicatePrompt) void handleDuplicate();
              else setDuplicatePrompt(true);
            }}
            disabled={!canDuplicate || duplicating}
            data-tooltip={!canDuplicate ? "Select a session to enable project scope" : undefined}
            data-tooltip-pos="bottom"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "4px 12px",
              fontSize: "0.72rem",
              fontWeight: 500,
              color: "var(--text-muted)",
              cursor: canDuplicate && !duplicating ? "pointer" : "default",
              fontFamily: "var(--font-sans)",
              opacity: canDuplicate ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (canDuplicate) e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {duplicating
              ? "..."
              : duplicatePrompt
                ? `Confirm duplicate to ${otherScope}`
                : `Duplicate to ${otherScope}`}
          </button>
        )}
        {duplicatePrompt && !duplicating && (
          <button
            onClick={() => setDuplicatePrompt(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.72rem",
              padding: "4px 8px",
              fontFamily: "var(--font-sans)",
            }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={onToggleFullscreen}
          data-tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          data-tooltip-pos="bottom"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "4px 10px",
            fontSize: "0.78rem",
            lineHeight: 1,
            fontWeight: 500,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {isFullscreen ? "⤓" : "⛶"}
        </button>
        <span style={{ flex: 1 }} />
        {!isClaudeMd && (
          <button
            onClick={handleDelete}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "4px 12px",
              fontSize: "0.72rem",
              fontWeight: 500,
              color: "var(--dot-error)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              opacity: 0.8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
          >
            {confirmDelete ? "Click again to confirm" : "Delete"}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {!isClaudeMd && fmKeys.length > 0 && (
          <div
            style={{
              padding: `16px ${pad}px 0 ${pad}px`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flexShrink: 0,
            }}
          >
            {fmKeys.map((key) => {
              const isName = key === "name";
              const value = formFm[key] ?? "";
              return (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label
                    style={{
                      fontSize: "0.65rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {key}
                    {isName ? " (readonly)" : ""}
                  </label>
                  <input
                    type="text"
                    value={value}
                    readOnly={isName}
                    onChange={(e) => {
                      if (isName) return;
                      setFormFm((prev) => ({ ...prev, [key]: e.target.value }));
                    }}
                    style={{
                      background: isName ? "transparent" : "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "5px 8px",
                      fontSize: "0.78rem",
                      color: isName ? "var(--text-muted)" : "var(--text-primary)",
                      fontFamily: key === "allowed-tools" ? "var(--font-mono)" : "var(--font-sans)",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      if (!isName) e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {kind === "skill" && detail.resources && detail.resources.length > 0 && (
          <div
            style={{
              padding: `16px ${pad}px 0 ${pad}px`,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Resources
            </div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {detail.resources.map((r) => (
                <div
                  key={r}
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {r}
                </div>
              ))}
              <button
                onClick={handleReveal}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  padding: 0,
                  fontFamily: "var(--font-sans)",
                  textDecoration: "underline",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                Open folder
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            padding: `16px ${pad}px ${pad}px ${pad}px`,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 200,
          }}
        >
          <label
            style={{
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            {isClaudeMd ? "Contents" : "Body"}
          </label>
          <textarea
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              minHeight: 240,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "14px 16px",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              outline: "none",
              resize: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />
        </div>
      </div>

      {pendingBack && isDirty && (
        <div
          style={{
            padding: `8px ${pad}px`,
            borderTop: "1px solid var(--border)",
            background: "var(--bg-surface)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            fontSize: "0.75rem",
          }}
        >
          <span style={{ color: "var(--text-secondary)", flex: 1 }}>Unsaved changes</span>
          <button
            onClick={() => {
              setPendingBack(false);
              onClose();
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Discard
          </button>
          <button
            onClick={() => {
              void handleSave();
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
              fontSize: "0.72rem",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
            }}
          >
            Save
          </button>
          <button
            onClick={() => setPendingBack(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.72rem",
              padding: "3px 6px",
              fontFamily: "var(--font-sans)",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
