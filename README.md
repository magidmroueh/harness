# Harness

Desktop manager for Claude Code, Codex, and Cursor. Discover sessions across all three CLIs, resume conversations, run commands — all from one window.

![Harness](screenshot.png)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/magidmroueh/harness/main/install.sh | bash
```

Downloads the latest release, mounts the DMG, and copies Harness to `/Applications`. Supports both Apple Silicon and Intel Macs.

Or download the DMG directly from [Releases](https://github.com/magidmroueh/harness/releases).

**Requirements:** macOS 14+ and at least one of:

| Provider | Binary | Install |
|----------|--------|---------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | Follow Anthropic's docs |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `npm install -g @openai/codex` (or install from the app) |
| [Cursor CLI](https://docs.cursor.com/cli) | `agent` / `cursor-agent` | `curl https://cursor.com/install -fsS \| bash` (or install from the app) |

Pick the active provider from the dropdown in the title bar. If a provider isn't installed, Harness offers to install it inline.

### Updates

Harness checks for updates automatically on launch (and every 4 hours). When a new version is available, a banner appears at the top of the app. You can also check manually from the Toolkit.

To update via terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/magidmroueh/harness/main/install.sh | bash
```

## What This Is

Each CLI keeps its own session store. Harness reads them, groups by project, and gives you a single UI:

- Switch providers from the title bar dropdown — sessions list and Skills tab follow
- Click a past session to resume it in an embedded terminal (`claude --resume`, `codex resume`, `agent --resume`)
- Start fresh sessions in any project with the currently selected provider
- Run tests, builds, dev servers in a split pane (auto-detects npm/yarn/pnpm/bun)
- Manage git worktrees for parallel work
- Browse and edit skills, agents, commands, and instructions files — global and project-scoped — for whichever provider is selected
- Send the active provider commands from the toolkit (create PR, commit, review code, show changes)
- Get notified when the agent finishes or needs input (badges, desktop notifications, sound)
- Search and filter sessions with `Cmd+F`
- Toggle light/dark theme

## How It Works

Harness reads each provider's on-disk layout directly — no daemons, no forks of the CLIs.

```
~/.claude/                                 Claude Code
├── sessions/{pid}.json                      running process markers
├── projects/{slug}/{id}.jsonl               conversation history (label = first user prompt)
├── skills/{name}/SKILL.md                   editable in the Skills tab
├── agents/{name}.md                         editable in the Skills tab
├── commands/{name}.md                       editable in the Skills tab
└── CLAUDE.md                                global instructions

~/.codex/                                  Codex CLI
├── sessions/YYYY/MM/DD/rollout-*.jsonl      per-session rollouts (session_meta line has id/cwd/branch)
├── skills/{name}/SKILL.md                   user-authored skills (built-ins under .system/ are hidden)
└── AGENTS.md                                global instructions

~/.cursor/                                 Cursor CLI
├── projects/{hyphenated-path}/              workspaces Cursor has touched (used to enumerate chats)
├── chats/{md5(cwd)}/{chatId}/store.db       per-chat SQLite store; meta row decodes to JSON
├── skills-cursor/{name}/SKILL.md            global skills
└── AGENTS.md                                global instructions
```

Per-provider project files live under `<project>/.claude/`, `<project>/.codex/`, or `<project>/.cursor/`; Claude's `CLAUDE.md` and the others' `AGENTS.md` live at the project root.

The app polls every 5 seconds (via TanStack Query) for the active provider's sessions, detects which PIDs are alive for Claude, reads rollout metadata in parallel for Codex, and shells out to `sqlite3` per chat for Cursor. The Skills tab uses a file watcher to refresh on external changes.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+J` | Toggle bottom terminal panel |
| `Cmd+F` | Search / filter sessions or skills |
| `Cmd+S` | Save the open skill/agent/command/AGENTS.md/CLAUDE.md in the editor |

---

## Development

```bash
git clone https://github.com/magidmroueh/harness.git
cd harness
bun install
bun run rebuild    # rebuild native modules (node-pty) for Electron
bun run dev        # dev mode with HMR
```

### Scripts

| Script | What it does |
|--------|-------------|
| `bun run dev` | Dev mode with hot reload |
| `bun run build` | Production build |
| `bun run start` | Run production build |
| `bun run rebuild` | Rebuild native modules for Electron |
| `bun run pack` | Package .app locally (no installer) |
| `bun run dist` | Build DMG + ZIP for distribution |
| `bun run lint` | Run oxlint |
| `bun run fmt` | Format with oxfmt |

### Architecture

```
Electron main process          Renderer (React)
┌─────────────────────┐        ┌──────────────────────────────┐
│ node-pty (PTY mgmt) │◄──IPC──►│ xterm.js + WebGL (terminal) │
│ SessionManager      │◄──IPC──►│ TanStack Query (sessions)   │
│ ProviderManager     │◄──IPC──►│ Provider switcher + install │
│ WorktreeManager     │◄──IPC──►│ React components (UI)       │
│ ConfigManager       │◄──IPC──►│ Skills editor + watcher     │
│ AttentionDetector   │◄──IPC──►│ Notification system         │
│ Updater             │◄──IPC──►│ Update banner               │
└─────────────────────┘        └──────────────────────────────┘
```

### Stack

| Layer | Choice |
|-------|--------|
| Runtime | Electron 32 (frameless macOS window) |
| UI | React 18 + TypeScript |
| Data | TanStack Query (polling, cache, optimistic updates) |
| Terminal | xterm.js + WebGL addon + node-pty |
| Icons | Animated Lucide icons via motion/react |
| Build | electron-vite + electron-builder |
| Package manager | Bun |
| Linting | oxlint + oxfmt |
| Styling | CSS custom properties (no framework) |

### Releasing

Releases are automated. Every push to `main` triggers a GitHub Actions workflow that:

1. Builds the app
2. Packages DMG + ZIP for macOS
3. Creates a GitHub Release with the artifacts

To bump the version before merging:

```bash
# Edit version in package.json, then merge to main
```

### Project Layout

```
src/
├── main/
│   ├── index.ts           IPC handlers, PTY spawn (with PATH augmented), window setup
│   ├── providers.ts       Claude/Codex/Cursor registry: install check, install, launch commands
│   ├── sessions.ts        Per-provider session discovery (Claude PIDs, Codex rollouts, Cursor SQLite)
│   ├── worktrees.ts       git worktree list/create/remove
│   ├── claudeConfig.ts    Provider-aware skills/agents/commands/AGENTS.md or CLAUDE.md CRUD + fs.watch
│   ├── notifications.ts   Terminal attention detection (idle + patterns)
│   └── updater.ts         GitHub release version checker
├── preload/
│   ├── index.ts           contextBridge API
│   └── index.d.ts         TypeScript types for window.api (ProviderId lives here)
└── renderer/
    └── src/
        ├── App.tsx         Layout, provider switcher state, terminal + split pane + editor
        ├── types.ts        ProviderId, Session, TerminalInstance, ProviderStatus, ToolkitAction
        ├── tokens.css      Design tokens (stone palette, dark/light)
        ├── hooks/
        │   ├── useSessions.ts          Sessions query, keyed by provider
        │   ├── useProviders.ts         Provider list + install mutation
        │   ├── useClaudeConfig.ts      Skills list + detail, keyed by provider, watcher invalidation
        │   ├── useTheme.ts             Dark/light toggle
        │   ├── useNotifications.ts     Attention event state
        │   └── useNotificationSound.ts Audio chime
        └── components/
            ├── TitleBar.tsx         Provider dropdown + theme toggle
            ├── SessionPanel.tsx     Sessions tab + Skills tab host
            ├── ConfigPanel.tsx      Skills/agents/commands/(AGENTS|CLAUDE).md browser
            ├── ConfigEditor.tsx     Frontmatter + body editor; fullscreen + reveal + open-external
            ├── TerminalView.tsx     xterm.js + PTY bridge, theme + Nerd Font support
            ├── BottomTerminal.tsx   Tabbed general-purpose terminal panel
            ├── Toolkit.tsx          Grouped action grid (agent + shell + tools)
            ├── ToolkitAction.tsx    Single action with animated icon
            ├── WorktreePanel.tsx    Git worktree overlay
            ├── UpdateBanner.tsx     Update notification banner
            ├── StatusBar.tsx        cwd, git branch (live), model, terminal toggle
            ├── NewSessionDialog.tsx Folder picker
            └── icons/              Animated Lucide icons (motion/react)
```

## License

MIT
