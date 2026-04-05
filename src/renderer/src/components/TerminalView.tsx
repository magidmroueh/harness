import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string;
  cwd?: string;
  isActive: boolean;
  resumeSessionId?: string;
  /** If set, runs this shell command instead of launching Claude */
  shellCommand?: string;
}

export function TerminalView({ sessionId, cwd, isActive, resumeSessionId, shellCommand }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      theme: {
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
      },
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);

    // GPU-accelerated rendering
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available — falls back to canvas renderer
    }

    termRef.current = term;
    fitRef.current = fit;

    // Fit after layout settles
    setTimeout(() => fit.fit(), 50);

    let disposed = false;

    window.api.terminal
      .create({ id: sessionId, cwd })
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
        setTimeout(() => {
          if (disposed) return;
          if (shellCommand) {
            window.api.terminal.write(sessionId, shellCommand + "\n");
          } else if (resumeSessionId) {
            window.api.terminal.write(sessionId, `claude --resume ${resumeSessionId}\n`);
          } else {
            window.api.terminal.write(sessionId, "claude\n");
          }
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
    if (isActive && termRef.current) {
      termRef.current.focus();
      setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        display: isActive ? "block" : "none",
        padding: "4px 0 0 4px",
      }}
    />
  );
}
