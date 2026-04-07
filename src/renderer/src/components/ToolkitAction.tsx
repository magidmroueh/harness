import { useRef } from "react";
import { ToolkitAction as ActionType, IconHandle } from "../types";

interface Props {
  action: ActionType;
  onRun: () => void;
}

const modeColor: Record<ActionType["mode"], string> = {
  claude: "var(--accent)",
  shell: "var(--dot-current)",
  ui: "var(--text-muted)",
};

export function ToolkitAction({ action, onRun }: Props) {
  const iconRef = useRef<IconHandle>(null);

  return (
    <button
      onClick={onRun}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        fontSize: "0.8125rem",
        fontFamily: "var(--font-sans)",
        fontWeight: 400,
        transition: "all 200ms var(--ease-spring)",
        width: "100%",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        el.style.color = "var(--text-primary)";
        el.style.borderColor = "var(--text-muted)";
        iconRef.current?.startAnimation();
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
        el.style.color = "var(--text-secondary)";
        el.style.borderColor = "var(--border)";
        iconRef.current?.stopAnimation();
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
    >
      {action.IconComponent ? (
        <span style={{ flexShrink: 0, color: modeColor[action.mode], display: "flex" }}>
          <action.IconComponent ref={iconRef} size={14} />
        </span>
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: modeColor[action.mode],
            opacity: 0.7,
          }}
        />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {action.label}
      </span>
    </button>
  );
}
