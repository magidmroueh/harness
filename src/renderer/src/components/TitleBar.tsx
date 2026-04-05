import type { CSSProperties } from "react";

// Electron-specific CSS property not in React's CSSProperties type
const titleBarStyle: Record<string, unknown> = {
  height: 52,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderBottom: "1px solid var(--border)",
  WebkitAppRegion: "drag",
  paddingLeft: 80,
  paddingRight: 16,
  position: "relative",
  flexShrink: 0,
};

export function TitleBar() {
  return (
    <header className="titlebar" style={titleBarStyle as CSSProperties}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        Harness
      </span>
    </header>
  );
}
