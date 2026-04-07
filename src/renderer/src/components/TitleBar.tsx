import type { CSSProperties } from "react";
import { useRef } from "react";
import { SunIcon, MoonIcon } from "./icons";
import type { IconHandle } from "../types";
import iconDark from "../assets/icon-dark.svg";
import iconLight from "../assets/icon-light.svg";

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

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function TitleBar({ theme, onToggleTheme }: Props) {
  const iconRef = useRef<IconHandle>(null);
  return (
    <header className="titlebar" style={titleBarStyle as CSSProperties}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <img
          src={theme === "dark" ? iconDark : iconLight}
          alt="Harness"
          style={{ width: 22, height: 22, borderRadius: 5 }}
        />
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
      </div>
      <div
        onClick={onToggleTheme}
        onMouseEnter={() => iconRef.current?.startAnimation()}
        onMouseLeave={() => iconRef.current?.stopAnimation()}
        data-tooltip={theme === "dark" ? "Light mode" : "Dark mode"}
        data-tooltip-pos="bottom"
        data-tooltip-align="right"
        style={{
          position: "absolute",
          right: 16,
          color: "var(--text-muted)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 150ms",
          WebkitAppRegion: "no-drag",
        } as CSSProperties}
      >
        {theme === "dark" ? <SunIcon ref={iconRef} size={18} /> : <MoonIcon ref={iconRef} size={18} />}
      </div>
    </header>
  );
}
