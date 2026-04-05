import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, cwd: string) => void;
}

export function NewSessionDialog({ isOpen, onClose, onCreate }: Props) {
  const [cwd, setCwd] = useState("");

  if (!isOpen) return null;

  const name = cwd.split("/").filter(Boolean).pop() || "session";

  const handleBrowse = async () => {
    const selected = await window.api.dialog.openFolder();
    if (selected) {
      setCwd(selected);
    }
  };

  const handleSubmit = () => {
    if (!cwd.trim()) return;
    onCreate(name, cwd.trim());
    setCwd("");
    onClose();
  };

  return (
    <div
      style={{
        padding: 16,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          textTransform: "uppercase" as const,
          letterSpacing: "0.12em",
          color: "var(--text-muted)",
          marginBottom: 10,
        }}
      >
        New Session
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          onClick={handleBrowse}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            fontSize: "0.8125rem",
            color: cwd ? "var(--text-primary)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "border-color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          {cwd || "Select project folder..."}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={() => {
            setCwd("");
            onClose();
          }}
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
          onClick={handleSubmit}
          disabled={!cwd.trim()}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-full)",
            padding: "6px 16px",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: cwd.trim() ? "var(--text-primary)" : "var(--text-muted)",
            cursor: cwd.trim() ? "pointer" : "default",
            fontFamily: "var(--font-sans)",
            transition: "all 200ms var(--ease-spring)",
          }}
        >
          Start
        </button>
      </div>
    </div>
  );
}
