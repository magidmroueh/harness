import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string;
  cwd?: string;
  isActive: boolean;
  resumeSessionId?: string;
  shellCommand?: string;
  theme?: "light" | "dark";
}

const DARK_THEME = {
  background: "#0c0a09",
  foreground: "#fafaf9",
  cursor: "#fafaf9",
  cursorAccent: "#0c0a09",
  selectionBackground: "#44403c",
  selectionForeground: "#fafaf9",
  black: "#1c1917",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#fafaf9",
  brightBlack: "#78716c",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#ffffff",
};

const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#1c1917",
  cursor: "#1c1917",
  cursorAccent: "#ffffff",
  selectionBackground: "#e7e5e4",
  selectionForeground: "#1c1917",
  black: "#1c1917",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#fafaf9",
  brightBlack: "#a8a29e",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#ffffff",
};

export function TerminalView({ sessionId, cwd, isActive, resumeSessionId, shellCommand, theme = "dark" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      theme: theme === "dark" ? DARK_THEME : LIGHT_THEME,
      fontFamily: "'MesloLGS Nerd Font', 'MesloLGS NF', 'Hack Nerd Font', 'FiraCode Nerd Font', 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    term.open(el);

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available — falls back to canvas renderer
    }

    termRef.current = term;
    fitRef.current = fit;

    // Fit BEFORE creating PTY so we get actual dimensions
    fit.fit();

    let disposed = false;

    window.api.terminal
      .create({ id: sessionId, cwd, cols: term.cols, rows: term.rows })
      .then((result) => {
        if (disposed) return;
        if (result && "error" in result && result.error) {
          term.write(`\x1b[31m${result.error}\x1b[0m\r\n`);
          return;
        }

        const inputDisposable = term.onData((data) => {
          window.api.terminal.write(sessionId, data);
        });

        const removeData = window.api.terminal.onData(sessionId, (data) => {
          term.write(data);
        });

        const removeExit = window.api.terminal.onExit(sessionId, () => {
          term.write("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
        });

        // Auto-run command after shell is ready
        // shellCommand === undefined → launch claude; "" → plain shell; "cmd" → run cmd
        setTimeout(() => {
          if (disposed) return;
          if (shellCommand !== undefined && shellCommand !== "") {
            window.api.terminal.write(sessionId, shellCommand + "\n");
          } else if (shellCommand === undefined) {
            if (resumeSessionId) {
              window.api.terminal.write(sessionId, `claude --resume ${resumeSessionId}\n`);
            } else {
              window.api.terminal.write(sessionId, "claude\n");
            }
          }
          // shellCommand === "" → plain shell, do nothing
        }, 600);

        cleanupRef.current = () => {
          inputDisposable.dispose();
          removeData();
          removeExit();
        };
      })
      .catch((err: unknown) => {
        term.write(`\x1b[31mFailed to create terminal: ${err}\x1b[0m\r\n`);
      });

    const observer = new ResizeObserver(() => {
      if (!disposed) {
        fit.fit();
        window.api.terminal.resize(sessionId, term.cols, term.rows);
      }
    });
    observer.observe(el);

    return () => {
      disposed = true;
      try {
        cleanupRef.current?.();
        observer.disconnect();
        term.dispose();
      } catch {
        // WebGL addon can throw during dispose — safe to ignore
      }
      termRef.current = null;
      fitRef.current = null;
      window.api.terminal.kill(sessionId);
    };
  }, [sessionId, cwd, resumeSessionId, shellCommand]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === "dark" ? DARK_THEME : LIGHT_THEME;
    }
  }, [theme]);

  // Show drop overlay when files are dragged over the window
  useEffect(() => {
    if (!isActive) return;
    let count = 0;
    const onEnter = () => { count++; setDragging(true); };
    const onLeave = () => { count--; if (count <= 0) { count = 0; setDragging(false); } };
    const onDrop = () => { count = 0; setDragging(false); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      setDragging(false);
    };
  }, [isActive]);

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
      // Only refit when becoming active, not on every re-render while already active
      if (!wasActiveRef.current) {
        setTimeout(() => fitRef.current?.fit(), 50);
      }
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: isActive ? "block" : "none",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          padding: 0,
        }}
      />
      {dragging && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files);
            console.log("DROP event", files.length, files.map((f) => ({ name: f.name, path: (f as File & { path?: string }).path, size: f.size })));
            if (files.length > 0) {
              const paths = files
                .map((f) => (f as File & { path?: string }).path || f.name)
                .filter(Boolean)
                .map((p) => (p.includes(" ") ? `"${p}"` : p))
                .join(" ");
              if (paths) window.api.terminal.write(sessionId, paths);
            }
          }}
          style={{
            position: "absolute",
            inset: 4,
            zIndex: 10,
            background: "rgba(234, 179, 8, 0.08)",
            border: "2px dashed var(--accent)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{
            fontSize: "0.8rem",
            color: "var(--accent)",
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
          }}>
            Drop files here
          </span>
        </div>
      )}
    </div>
  );
}
