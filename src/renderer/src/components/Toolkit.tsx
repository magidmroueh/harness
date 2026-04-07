import { useMemo } from "react";
import { Session, ToolkitAction as ActionType } from "../types";
import { ToolkitAction } from "./ToolkitAction";
import {
  GitPullRequestIcon,
  GitCommitIcon,
  EyeIcon,
  BookTextIcon,
  PlayIcon,
  GitBranchIcon,
  SparklesIcon,
  ShieldCheckIcon,
  HammerIcon,
  HistoryIcon,
  CheckCheckIcon,
} from "./icons";

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

interface ActionGroup {
  label: string;
  actions: ActionType[];
}

function buildGroups(pm: PM): ActionGroup[] {
  return [
    {
      label: "Claude",
      actions: [
        { id: "create-pr", label: "Create PR", IconComponent: GitPullRequestIcon, mode: "claude", command: "create a pull request for my changes" },
        { id: "commit-push", label: "Commit & Push", IconComponent: GitCommitIcon, mode: "claude", command: "commit all my changes and push to remote" },
        { id: "claude-diff", label: "Show Changes", IconComponent: EyeIcon, mode: "claude", command: "show me a summary of all changes I've made" },
        { id: "simplify", label: "Simplify", IconComponent: SparklesIcon, mode: "claude", command: "review the code I changed for simplicity and clean it up" },
        { id: "review", label: "Review Changes", IconComponent: ShieldCheckIcon, mode: "claude", command: "review my recent changes and suggest improvements" },
        { id: "explain", label: "Explain Code", IconComponent: BookTextIcon, mode: "claude", command: "explain the architecture of this project" },
      ],
    },
    {
      label: "Shell",
      actions: [
        { id: "dev-server", label: "Dev Server", IconComponent: PlayIcon, mode: "shell", command: `${runCmd[pm]} dev` },
        { id: "run-tests", label: "Run Tests", IconComponent: CheckCheckIcon, mode: "shell", command: testCmd[pm] },
        { id: "lint", label: "Lint", IconComponent: ShieldCheckIcon, mode: "shell", command: `${runCmd[pm]} lint` },
        { id: "build", label: "Build", IconComponent: HammerIcon, mode: "shell", command: `${runCmd[pm]} build` },
        { id: "git-status", label: "Git Status", IconComponent: GitCommitIcon, mode: "shell", command: "git status" },
        { id: "git-log", label: "Git Log", IconComponent: HistoryIcon, mode: "shell", command: "git log --oneline -10" },
      ],
    },
    {
      label: "Tools",
      actions: [
        { id: "worktree", label: "Worktree", IconComponent: GitBranchIcon, mode: "ui", command: "worktree" },
      ],
    },
  ];
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        fontSize: "0.65rem",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--text-muted)",
        padding: "6px 0 2px",
      }}
    >
      {label}
    </div>
  );
}

export function Toolkit({ session, onRunAction, onShowWorktrees }: Props) {
  const pm = session?.packageManager || "npm";
  const groups = useMemo(() => buildGroups(pm), [pm]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
        {groups.map((group) => (
          <div key={group.label} style={{ display: "contents" }}>
            <SectionLabel label={group.label} />
            {group.actions.map((action) => (
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
        ))}
      </div>
    </div>
  );
}
