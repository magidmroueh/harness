# Harness

Desktop manager for Claude Code. Discover sessions, resume conversations, run commands -- all from one window.

## Quick Start

```
bun install
bun run rebuild
bun run dev
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude` in your PATH) and Node.js 18+.

## What This Is

Every time you run `claude` in a terminal, it creates a session file in `~/.claude/`. Harness reads those files, groups them by project, and gives you a UI to manage everything:

- Click a past session to resume it in an embedded terminal
- Start fresh sessions in any project
- Run tests, builds, dev servers in a split pane (auto-detects npm/yarn/pnpm/bun)
- Manage git worktrees for parallel work
- Send Claude commands from the toolkit (create PR, commit, review code)

## How It Works

```
~/.claude/
├── sessions/          Harness reads these to find running Claude processes
│   └── {PID}.json       { pid, sessionId, cwd, startedAt }
└── projects/          Harness reads these for conversation history
    └── {slug}/
        └── {id}.jsonl   First user message becomes the session label
```

The app polls every 5 seconds (via TanStack Query), detects which PIDs are alive, and merges running + past sessions into the sidebar.

## Architecture

```
Electron main process          Renderer (React)
┌─────────────────────┐        ┌──────────────────────────────┐
│ node-pty (PTY mgmt) │◄──IPC──►│ xterm.js + WebGL (terminal) │
│ SessionManager      │◄──IPC──►│ TanStack Query (sessions)   │
│ WorktreeManager     │◄──IPC──►│ React components (UI)       │
│ dialog (folder pick)│◄──IPC──►│ CSS custom properties       │
└─────────────────────┘        └──────────────────────────────┘
```

### Stack

| Layer | Choice |
|-------|--------|
| Runtime | Electron 32 (frameless macOS window) |
| UI | React 18 + TypeScript |
| Data | TanStack Query (polling, cache, optimistic updates) |
| Terminal | xterm.js + WebGL addon + node-pty |
| Build | electron-vite (Vite for renderer, SSR for main/preload) |
| Package manager | Bun |
| Linting | oxlint + oxfmt |
| Styling | CSS custom properties (no framework) |

### Project Layout

```
src/
├── main/
│   ├── index.ts           IPC handlers, PTY spawn, window setup
│   ├── sessions.ts        Read ~/.claude/, detect package managers
│   └── worktrees.ts       git worktree list/create/remove
├── preload/
│   ├── index.ts           contextBridge API
│   └── index.d.ts         TypeScript types for window.api
└── renderer/
    └── src/
        ├── App.tsx         Layout, terminal + split pane state
        ├── types.ts        Session, TerminalInstance, ToolkitAction
        ├── tokens.css      Design tokens (stone palette, dark/light)
        ├── hooks/
        │   ├── useSessions.ts   TanStack Query hooks
        │   └── useTheme.ts      Dark/light toggle
        └── components/
            ├── SessionPanel.tsx     Accordion by project, session list
            ├── TerminalView.tsx     xterm.js + PTY bridge
            ├── Toolkit.tsx          Action grid (claude + shell modes)
            ├── WorktreePanel.tsx    Git worktree overlay
            ├── StatusBar.tsx        cwd, branch, model, cost
            ├── TitleBar.tsx         Frameless drag region
            └── NewSessionDialog.tsx Folder picker
```

## Toolkit

Actions are color-coded by type:

| Dot | Type | What happens |
|-----|------|-------------|
| Yellow | Claude | Writes into the active Claude session (`/pr`, `/commit`, natural language) |
| Green | Shell | Opens a split pane and runs the command (`bun test`, `git status`) |
| Gray | UI | Opens an internal panel (worktree manager) |

Shell commands auto-detect the project's package manager from lockfiles.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+1` -- `Cmd+9` | Jump to terminal by index |
| `Cmd+[` | Previous terminal |
| `Cmd+]` | Next terminal |

## Scripts

```
bun run dev          Dev mode with HMR
bun run build        Production build
bun run start        Run production build
bun run rebuild      Rebuild native modules for Electron
bun run lint         Run oxlint
bun run fmt          Format with oxfmt
```

## License

MIT
