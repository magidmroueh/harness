import { useMemo } from "react";
import { Session, ToolkitAction as ActionType } from "../types";
import { ToolkitAction } from "./ToolkitAction";

interface Props {
  session: Session | null;
  onRunAction: (action: ActionType) => void;
  onShowWorktrees: () => void;
}

type PM = Session["packageManager"];

const runCmd: Record<PM, string> = {
  npm: "npm run",
  yarn: "yarn",
  pnpm: "pnpm",
  bun: "bun run",
};

const testCmd: Record<PM, string> = {
  npm: "npm test",
  yarn: "yarn test",
  pnpm: "pnpm test",
  bun: "bun test",
};

function buildActions(pm: PM): ActionType[] {
  return [
    // Claude actions
    { id: "create-pr", label: "Create PR", icon: "⌥", mode: "claude", command: "/pr" },
    { id: "commit-push", label: "Commit & Push", icon: "⌥", mode: "claude", command: "/commit" },
    {
      id: "review",
      label: "Review Changes",
      icon: "⌥",
      mode: "claude",
      command: "review my recent changes and suggest improvements",
    },
    {
      id: "explain",
      label: "Explain Code",
      icon: "⌥",
      mode: "claude",
      command: "explain the architecture of this project",
    },

    // Shell actions — use detected package manager
    {
      id: "dev-server",
      label: "Dev Server",
      icon: "▶",
      mode: "shell",
      command: `${runCmd[pm]} dev`,
    },
    { id: "run-tests", label: "Run Tests", icon: "▶", mode: "shell", command: testCmd[pm] },
    { id: "lint", label: "Lint", icon: "▶", mode: "shell", command: `${runCmd[pm]} lint` },
    { id: "build", label: "Build", icon: "▶", mode: "shell", command: `${runCmd[pm]} build` },
    { id: "git-status", label: "Git Status", icon: "▶", mode: "shell", command: "git status" },
    {
      id: "git-log",
      label: "Git Log",
      icon: "▶",
      mode: "shell",
      command: "git log --oneline -10",
    },
    {
      id: "claude-diff",
      label: "Show Changes",
      icon: "⌥",
      mode: "claude",
      command: "/diff",
    },

    // UI actions
    { id: "worktree", label: "Worktree", icon: "◇", mode: "ui", command: "worktree" },
  ];
}

export function Toolkit({ session, onRunAction, onShowWorktrees }: Props) {
  const pm = session?.packageManager || "npm";
  const actions = useMemo(() => buildActions(pm), [pm]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
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
          Toolkit
        </span>
        {session && (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {session.name}
            </span>
            <span
              style={{
                fontSize: "0.65rem",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "1px 5px",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pm}
            </span>
          </>
        )}
      </div>

      {/* Action grid */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {actions.map((action) => (
          <ToolkitAction
            key={action.id}
            action={action}
            onRun={() => {
              if (action.mode === "ui" && action.command === "worktree") {
                onShowWorktrees();
              } else {
                onRunAction(action);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
