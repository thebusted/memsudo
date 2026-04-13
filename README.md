# memsudo

[![npm version](https://img.shields.io/npm/v/memsudo.svg)](https://www.npmjs.com/package/memsudo)
[![license](https://img.shields.io/npm/l/memsudo.svg)](https://github.com/thebusted/memsudo/blob/main/LICENSE)

Memory Palace CLI -- organize knowledge with markdown files. Zero dependencies. Works with any AI agent.

Every room is 3 markdown files. Every link is bidirectional. Every change is logged. Nothing is deleted.

## Install

```bash
bun add -g memsudo    # or: npm install -g memsudo
```

## Quick Start

```bash
memsudo init --name "my-brain"
memsudo room create clients/acme
memsudo room create lab/my-app
memsudo room list
memsudo room link my-app ~/code/my-app
memsudo index rebuild
```

## Commands

### `memsudo init`

Create a new palace with the full directory structure and integration files (Claude Code hooks, skills, scripts).

```bash
memsudo init                    # creates palace in current directory
memsudo init --name "my-brain"  # creates my-brain/ directory
```

### `memsudo room create`

Create a room with 3 files: `CLAUDE.md`, `changelog.md`, `sessions.md`.

Path routing rules:
- `lab/X` -- stays in `lab/`
- `incubate/X` -- stays in `incubate/`
- everything else -- goes to `areas/`

```bash
memsudo room create clients/acme       # creates areas/clients/acme/
memsudo room create lab/my-app         # creates lab/my-app/
memsudo room create incubate/idea      # creates incubate/idea/
memsudo room create personal/finance   # creates areas/personal/finance/
```

### `memsudo room list`

Show all rooms from INDEX.md, optionally filtered by category.

```bash
memsudo room list              # all rooms
memsudo room list lab          # only lab/ rooms
memsudo room list clients      # only areas/clients/ rooms
```

### `memsudo room enter`

Print the cd path to a linked repo and show room status summary.

```bash
memsudo room enter my-app              # prints path + status
memsudo room enter my-app --path-only  # just the path, for piping
```

To actually `cd` into rooms from your shell, add this function to `~/.zshrc`:

```bash
mem() {
  local target
  target=$(memsudo room enter "$1" --path-only 2>/dev/null)
  if [ -n "$target" ]; then
    cd "$target"
  else
    echo "Room not found: $1"
    return 1
  fi
}
```

Then: `mem my-app` jumps straight into the linked repo.

### `memsudo room link`

Create a bidirectional tunnel between a palace room and a code repo.

What it does:
1. Adds the repo path to the room's `CLAUDE.md ## Links`
2. Creates `memsudo.yaml` in the repo (points back to the palace room)
3. Adds `memsudo.yaml` to the repo's `.gitignore`
4. Installs Claude Code hooks in the repo

```bash
memsudo room link my-app ~/code/my-app
memsudo room link acme ~/clients/acme-api
```

The `memsudo.yaml` file is gitignored because it contains machine-specific paths.

### `memsudo index rebuild`

Regenerate `INDEX.md` by scanning all `CLAUDE.md` files in the palace.

```bash
memsudo index rebuild
```

Run this after creating or reorganizing rooms to keep the index current.

### `memsudo search`

Search across the palace with grep, grouped by room. Excludes `.secrets/`.

```bash
memsudo search "api key"                # search everything
memsudo search "deploy" --dir lab       # search only lab/
memsudo search "budget" --dir areas     # search only areas/
```

### `memsudo vault`

Manage secrets in `.secrets/` (gitignored). One file per key, `chmod 600`.

```bash
memsudo vault set OPENAI_KEY sk-abc123   # store a secret
memsudo vault get OPENAI_KEY             # retrieve it
memsudo vault list                       # show all keys (not values)
```

### `memsudo migrate`

Import rooms from an existing markdown structure.

What it does:
1. Scans the path for `CLAUDE.md` files
2. Copies 3-file sets (`CLAUDE.md`, `changelog.md`, `sessions.md`)
3. Creates stub files for any missing files
4. Reports orphans and flags sensitive data

```bash
memsudo migrate ~/old-notes
memsudo migrate ~/existing-palace
```

## Palace Structure

This is what `memsudo init` creates:

```
my-brain/
├── INDEX.md          # Auto-generated directory of all rooms
├── CLAUDE.md         # Rules for AI agents
├── areas/            # Tracking rooms (clients/, jobs/, personal/, tools/)
├── lab/              # Code project rooms
├── incubate/         # Early-stage projects
├── memory/           # learnings/, retrospectives/, plans/, resonance/
├── writing/          # Content drafts
├── inbox/            # handoff/ + messages/{pending,done,failed}
├── outbox/           # Responses
├── archive/          # Completed work
├── .secrets/         # Git-ignored secrets
├── .sample/          # Secret templates (safe to commit)
├── scripts/          # Watch scripts for Claude Code Monitor tool
└── .claude/          # Hooks + skills (recap, standup, wrap)
```

## Room = 3 Files

Every room is exactly 3 markdown files:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Status + Now + Next + Links. Claude Code auto-loads this. |
| `changelog.md` | Append-only history with emoji markers. |
| `sessions.md` | Session narratives and context. |

## AI Agent Compatibility

memsudo works with any tool that reads markdown files:

- **Claude Code** -- auto-loads `CLAUDE.md` per directory, hooks integrate natively
- **Codex** -- reads `CLAUDE.md` as project context
- **Cursor** -- picks up markdown files as context
- **ChatGPT** -- paste or reference any room file

No vendor lock-in. It is just markdown.

## Philosophy

> Nothing is deleted. Patterns over intentions. The palace keeps the human human.

## License

[MIT](LICENSE)
