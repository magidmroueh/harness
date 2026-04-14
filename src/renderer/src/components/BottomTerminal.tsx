import { useState, useCallback, useRef, useEffect } from "react";
import { TerminalView } from "./TerminalView";
import { PlusIcon } from "./icons";
import type { IconHandle } from "../types";

interface Tab {
  id: string;
  label: string;
  cwd: string;
  launchCommand: string;
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  theme: "light" | "dark";
}

export function BottomTerminal({ isOpen, onToggle, theme }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const plusIconRef = useRef<IconHandle>(null);

  const addTab = useCallback(() => {
    const id = crypto.randomUUID();
    const cwd = window.api.homeDir;
    const label = `Terminal ${tabs.length + 1}`;
    setTabs((prev) => [...prev, { id, label, cwd, launchCommand: "" }]);
    setActiveTabId(id);
  }, [tabs.length]);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (remaining.length === 0) {
        onToggle();
        setActiveTabId(null);
        return [];
      }
      setActiveTabId((current) => {
        if (current !== id) return current;
        return remaining.at(-1)?.id ?? null;
      });
      return remaining;
    });
  }, [onToggle]);

  useEffect(() => {
    if (isOpen && tabs.length === 0) addTab();
  }, [isOpen, tabs.length, addTab]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        height: "35%",
        minHeight: 150,
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          padding: "0 8px",
          gap: 2,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            padding: "0 8px 0 4px",
            flexShrink: 0,
          }}
        >
          Terminal
        </span>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              background: tab.id === activeTabId ? "var(--bg-surface)" : "transparent",
              border: "none",
              borderBottom: tab.id === activeTabId ? "2px solid var(--accent)" : "2px solid transparent",
              color: tab.id === activeTabId ? "var(--text-primary)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.72rem",
              fontFamily: "var(--font-sans)",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              transition: "color 150ms",
              height: "100%",
            }}
            onMouseEnter={(e) => {
              if (tab.id !== activeTabId) e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              if (tab.id !== activeTabId) e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {tab.label}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{
                fontSize: "0.6rem",
                opacity: 0.5,
                cursor: "pointer",
                padding: "0 2px",
                transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
            >
              ✕
            </span>
          </button>
        ))}

        <button
          onClick={addTab}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2px",
            flexShrink: 0,
            transition: "color 150ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            plusIconRef.current?.startAnimation();
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            plusIconRef.current?.stopAnimation();
          }}
        >
          <PlusIcon ref={plusIconRef} size={14} />
        </button>

        <span style={{ flex: 1 }} />

        <button
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "0.7rem",
            padding: "2px 6px",
            flexShrink: 0,
            transition: "color 150ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          ✕
        </button>
      </div>

      {/* Terminal content */}
      <div style={{ flex: 1, position: "relative" }}>
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            sessionId={`bottom-${tab.id}`}
            cwd={tab.cwd}
            isActive={tab.id === activeTabId}
            launchCommand={tab.launchCommand}
            theme={theme}
          />
        ))}
      </div>
    </div>
  );
}
