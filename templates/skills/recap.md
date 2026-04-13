---
name: recap
origin: Adapted from Nat Weerawan's Oracle /recap (Soul Brews Studio) — palace edition
description: "Session orientation and awareness for memsudo palaces. Rich context by default. Mid-session awareness with --now. Use when starting a session, switching context, or when user asks 'now', 'where are we', 'status', 'recap'."
argument-hint: "[room-name | --now | --now deep | --quick]"
---

# /recap — Session Orientation & Awareness

> Adapted from [Nat Weerawan's Oracle](https://github.com/laris-co/oracle) /recap skill (Soul Brews Studio).
> Ported for memsudo Memory Palace. Original: v3.5.2 G-SKLL.

**Goal**: Orient yourself fast. Rich context by default. Mid-session awareness with `--now`.

## Usage

```
/recap              # Rich: retro summary, handoff, rooms, git
/recap [room-name]  # Rich: focused on a specific room
/recap --quick      # Minimal: git + INDEX.md only
/recap --now        # Mid-session: timeline + jumps from AI memory
/recap --now deep   # Mid-session: + handoff + connections
```

---

## DEFAULT MODE (Rich)

### Step 1: Palace overview

```bash
cat INDEX.md
```

Show room count, categories, any rooms with status changes.

### Step 2: Git context

```bash
git status --short
git log --oneline -1
```

Check what's appropriate:
- **Uncommitted changes?** → show them, suggest commit or stash
- **On a branch (not main)?** → `git log main..HEAD --oneline` to see branch work
- **Branch ahead of remote?** → suggest push or PR
- **Clean on main?** → just show last commit, move on

### Step 3: Read latest palace files

Sort all palace files by modification time, read the most recent:

```bash
find . -name '*.md' -not -name 'INDEX.md' -not -name 'README.md' -not -name '.gitkeep' -not -path './.git/*' -not -path './.secrets/*' 2>/dev/null | xargs ls -t 2>/dev/null | head -5
```

Read those top 5 files. This recovers context from handoffs, retros, learnings, whatever was touched last.

### Step 4: Latest handoff

```bash
ls -t inbox/handoff/*.md 2>/dev/null | head -1
```

Read the most recent handoff → extract "Next Session" items → show what's pending.

### Step 5: Dig last session

```bash
ENCODED_PWD=$(pwd | sed 's|^/|-|; s|/|-|g')
PROJECT_BASE=$(ls -d "$HOME/.claude/projects/${ENCODED_PWD}" 2>/dev/null | head -1)
export PROJECT_DIRS="$PROJECT_BASE"
python3 ~/.claude/skills/dig/scripts/dig.py 1 2>/dev/null
```

Include in recap:
```
Last session: HH:MM-HH:MM (Xm, N msgs) - [topic]
```

If dig script unavailable, skip silently.

### Step 6: LLM adds suggestions

- **What's next?** (2-3 options based on context)

---

## ROOM MODE (`/recap [room-name]`)

When a room name is given:

1. Find room using memsudo room resolution:
   - Exact match in areas/, lab/, incubate/
   - Partial/fuzzy match if no exact
2. Read room's CLAUDE.md → show Status, Now, Next, Links
3. Read room's changelog.md → show last 10 entries
4. Read room's sessions.md → show last session entry (if exists)
5. Summarize: "Room {name} is {status}. Currently: {now}. Next: {next}"

If no room-name and memsudo.yaml exists in cwd:
- Read `room:` field → auto-detect room → show that room

---

## QUICK MODE (`/recap --quick`)

Minimal, fast:

```bash
cat INDEX.md | head -30
git status --short
git log --oneline -3
```

LLM adds:
- **What's next?** (2-3 options based on git state)

---

## "What's next?" Rules

| If you see... | Suggest... |
|---------------|------------|
| Handoff exists | Continue from handoff |
| Untracked files | Commit them |
| All rooms green | Pick a room or start fresh |
| Branch ahead | Push or create PR |
| Messages pending | Check inbox/messages/pending/ |

---

## NOW MODE (`/recap --now`)

**Mid-session awareness from AI memory** — no file reading needed.

AI reconstructs session timeline from conversation memory:

```markdown
## This Session

| Time | Duration | Topic | Jump |
|------|----------|-------|------|
| HH:MM | ~Xm | First topic | - |
| HH:MM | ~Xm | Second topic | spark |
| HH:MM | ongoing | **Now**: Current | complete |

**Noticed**:
- [Pattern - energy/mode]
- [Jump pattern: sparks vs escapes vs completions]

**Status**:
- Energy: [level]
- Loose ends: [unfinished]
- Parked: [topics we'll return to]

**My Read**: [1-2 sentences]

---
**Next?**
```

### Jump Types

| Icon | Type | Meaning |
|------|------|---------|
| spark | New idea, exciting |
| complete | Finished, moving on |
| return | Coming back to parked |
| park | Intentional pause |
| escape | Avoiding difficulty |

---

## NOW DEEP MODE (`/recap --now deep`)

Same as `--now` but adds bigger picture context.

### Step 1: Gather (parallel)

```
1. Current session from AI memory
2. Read latest handoff: ls -t inbox/handoff/*.md | head -1
3. Git status: git status --short
4. INDEX.md for room context
```

### Step 2: Output

Everything from `--now`, plus:

```markdown
### Bigger Picture

**Came from**: [Last session/handoff summary - 1 line]
**Working on**: [Current thread/goal]
**Thread**: [Larger pattern this connects to]

### Pending

| Priority | Item | Source |
|----------|------|--------|
| Now | [Current task] | This session |
| Soon | [Next up] | Handoff/discussion |
| Later | [Backlog] | INDEX.md rooms |

### Connections

**Pattern**: [What pattern emerged]
**Learning**: [Key insight from session]

**My Read**: [2-3 sentences - deeper reflection]

**Next action?**
```

---

## Hard Rules

1. **ONE bash call per step** — minimize latency
2. **No subagents** — everything in main agent
3. **Ask, don't prescribe** — "What next?" not "You should..."
4. **Palace paths** — use relative paths from palace root, not absolute

---

**Philosophy**: Detect reality. Surface blockers. Offer direction. *"Not just the clock. The map."*
