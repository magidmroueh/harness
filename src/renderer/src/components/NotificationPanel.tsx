import { AttentionEvent } from "../types";
import { timeAgo } from "../utils/time";

interface Props {
  notifications: AttentionEvent[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onSelectTerminal: (terminalId: string) => void;
  terminalNames: Map<string, string>;
}

const TYPE_STYLES: Record<AttentionEvent["type"], { color: string; label: string; icon: string }> = {
  permission: { color: "var(--dot-error)", label: "Permission", icon: "!" },
  complete: { color: "var(--dot-current)", label: "Complete", icon: "✓" },
  prompt: { color: "var(--dot-working)", label: "Input", icon: "›" },
};

export function NotificationPanel({
  notifications,
  onDismiss,
  onClearAll,
  onSelectTerminal,
  terminalNames,
}: Props) {
  if (notifications.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.8125rem",
        }}
      >
        No notifications
      </div>
    );
  }

  return (
    <div style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "8px 16px 4px",
        }}
      >
        <button
          onClick={onClearAll}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.7rem",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            padding: "2px 6px",
            transition: "color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          Clear all
        </button>
      </div>

      {notifications.map((n) => {
        const style = TYPE_STYLES[n.type];
        const name = terminalNames.get(n.terminalId) || "Terminal";

        return (
          <div
            key={n.id}
            onClick={() => onSelectTerminal(n.terminalId)}
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid var(--border)",
              borderLeft: n.dismissed ? "2px solid transparent" : `2px solid ${style.color}`,
              cursor: "pointer",
              transition: "background 150ms",
              opacity: n.dismissed ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--border-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
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
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: style.color,
                  background: `color-mix(in srgb, ${style.color} 15%, transparent)`,
                  flexShrink: 0,
                }}
              >
                {style.icon}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: style.color,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {style.label}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "0.68rem",
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {timeAgo(n.timestamp)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.summary}
                </div>
              </div>

              {!n.dismissed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(n.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.65rem",
                    padding: "2px 4px",
                    opacity: 0.5,
                    transition: "opacity 150ms",
                    flexShrink: 0,
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
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
