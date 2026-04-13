---
name: wrap
origin: Adapted from Nat Weerawan's Oracle /wrap (Soul Brews Studio) — palace edition
description: "Autonomous session wrap-up — analyzes session, syncs rooms, writes retro + handoff, commits, pushes. Zero prompts, zero approval. Use when user says 'wrap', 'bye', 'end session', 'wrap up'."
argument-hint: "[--dry | --no-retro | --no-push]"
---

# /wrap — Autonomous Session Wrap-Up

> Adapted from [Nat Weerawan's Oracle](https://github.com/laris-co/oracle) /wrap skill (Soul Brews Studio).
> Ported for memsudo Memory Palace. Original: v3.5.2 G-SKLL.

> "End the session completely. Don't ask."

```
/wrap              # Full autonomous: retro + rooms + handoff + commit + push
/wrap --dry        # Show plan only, don't execute
/wrap --no-push    # Commit but don't push
```

## Important

- **NEVER ask for approval.** NEVER enter plan mode. Execute ALL steps autonomously.
- **NEVER spawn subagents.** Main agent only.
- **Edit, not Write** — ALWAYS Edit existing CLAUDE.md/changelog.md, NEVER Write.
- **Palace paths** — all paths relative to palace root.

---

## Step 0: Gather Context

```bash
date "+%H:%M %Z (%A %d %B %Y)"
git log --oneline -15
git diff --stat HEAD~10 2>/dev/null || git diff --stat
git status --short
cat INDEX.md | head -30
```

Detect session ID:
```bash
ENCODED_PWD=$(pwd | sed 's|^/|-|; s|/|-|g')
PROJECT_DIR="$HOME/.claude/projects/${ENCODED_PWD}"
LATEST_JSONL=$(ls -t "$PROJECT_DIR"/*.jsonl 2>/dev/null | head -1)
if [ -n "$LATEST_JSONL" ]; then
  SESSION_ID=$(basename "$LATEST_JSONL" .jsonl)
  echo "SESSION: ${SESSION_ID:0:8}"
fi
```

Also gather from **conversation memory**: topics discussed, decisions made, files changed.

### Auto-Detect: Retro or No Retro?

**WRITE RETRO** when session has **at least 2 of 5**:
1. Session > 30 minutes
2. Git commits or file changes > 3 files
3. Decision/architecture change
4. New lesson learned
5. Friction/blocker worth recording

**SKIP RETRO** when session is:
- Quick check/status (< 30 min + no meaningful changes)
- Routine work following known pattern
- Pure reading/research with no output

Announce: `Retro: skipped (quick session)` or `Retro: writing (N signals detected)`

**If `--dry` mode**: After Step 1, print full plan and STOP.

---

## Step 1: Detect Touched Rooms

Read INDEX.md for room inventory.

**Detection algorithm:**

1. From `git diff --stat` and `git status`, extract modified file paths
2. From conversation context, identify which rooms were worked on
3. Match paths against palace structure:
   - `areas/{category}/{room}/` → match to area room
   - `lab/{project}/` → match to lab room
   - `incubate/{project}/` → match to incubate room
   - `memory/` → note but don't match to room
4. Build `TOUCHED_ROOMS` list: `{name, room_path, what_changed}`

If no rooms detected from git, use conversation context. **Every session touches at least one room.**

---

## Step 2: Room Sync

For **each** room in `TOUCHED_ROOMS`:

### 2a. Read current state
Read `{room_path}/CLAUDE.md` and `{room_path}/changelog.md`.

### 2b. Edit CLAUDE.md

Use the **Edit tool** (never Write). Update:
- **Status**: emoji + current state
- **Updated**: today's date (YYYY-MM-DD)
- **Now**: what is actually done / current state (2-5 lines)
- **Next**: concrete next actions (numbered list)

**CLAUDE.md MUST stay under 200 lines.** If over, move detail to sessions.md.

### 2c. Append changelog.md

Insert new entry at top (after header):

```
YYYY-MM-DD: {emoji} {description}
```

Emoji: completed, changed, bug, decision, failed, applied

### 2d. Append sessions.md (if substantial work)

Insert after header, before previous entries:

```markdown
---

## YYYY-MM-DD HH:MM — {session title}

{2-5 sentence narrative: what happened, decisions made, results}
```

Only write if the room had meaningful work this session.

---

## Step 3: Write Retrospective

**Skip if auto-detect says SKIP RETRO (see Step 0).**

Create directory:
```bash
mkdir -p "memory/retrospectives/$(date +%Y-%m/%d)"
```

**Path**: `memory/retrospectives/YYYY-MM/DD/HH.MM_slug.md`

```markdown
# Session Retrospective — {title}

**Date**: YYYY-MM-DD
**Duration**: ~Xh Xm (HH:MM-HH:MM)
**Focus**: {rooms touched}
**Type**: {Feature | Bug Fix | Research | Refactoring | Admin | Mixed}

## Session Summary

{2-3 sentences. What was accomplished, key outcomes.}
Rooms: {list}

## Timeline

| Time | What |
|------|------|
| HH:MM | {event} |

## Files Modified

{Key files changed, grouped by room}

## AI Diary

{150+ words. First-person, honest reflection on the session.
What I experienced, what surprised me, what I learned.}

## Honest Feedback

{Exactly 3 friction points:
1. What slowed us down
2. What was unclear
3. What I would do differently}

## Lessons Learned

1. **{pattern}** — {description}

## Next Steps

- {concrete next action per room}
```

---

## Step 4: Write Lesson Learned

Extract the most significant lesson from Step 3.

**Path**: `memory/learnings/YYYY-MM-DD_slug.md`

```markdown
# {Lesson Title}

**Date**: YYYY-MM-DD
**Source**: /wrap session — {context}
**Tags**: {tag1}, {tag2}

## Pattern

{What we learned}

## Evidence

{What happened that taught us this}

## Application

{When to apply this in the future}
```

**Skip** if lesson is minor or duplicates existing learning.

---

## Step 5: Write Handoff

### 5a. Check previous handoff

```bash
ls -t inbox/handoff/*.md 2>/dev/null | head -1
```

Read most recent handoff → extract "Next Session" items → compare with what actually happened.

### 5b. Write handoff

**Path**: `inbox/handoff/YYYY-MM-DD_HH-MM_slug.md`

```markdown
# Handoff: {Session Focus}

**Date**: YYYY-MM-DD HH:MM
**Session**: {SESSION_ID:0:8}
**Duration**: ~{duration}

## Plan vs Actual
- [x] {planned item completed}
- [ ] {planned item NOT completed — reason}
- [Unplanned] {item that emerged during session}

## What We Did
- {accomplishment 1}
- {accomplishment 2}

## Pending
- [ ] {unfinished item 1}

## Next Session
- [ ] {specific action 1}
- [ ] {specific action 2}

## Key Files
- @{important file path 1}
- @{important file path 2}
```

Use `@path` format for file references (relative to palace root).

---

## Step 6: Rebuild INDEX.md

```bash
memsudo index rebuild 2>/dev/null || echo "INDEX rebuild skipped (memsudo CLI not in PATH)"
```

If memsudo CLI unavailable, skip silently — INDEX.md will be rebuilt next time.

---

## Step 7: Commit + Push

### 7a. Stage files

```bash
git add areas/ lab/ incubate/ memory/ inbox/handoff/
```

Also check `git status --short` for other session files. Stage them with targeted `git add {file}`.

### 7b. Commit

```bash
git commit -m "$(cat <<'EOF'
/wrap handoff + room sync — {concise description under 72 chars}

- {bullet 1: key accomplishment}
- {bullet 2: rooms synced}

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 7c. Push

**Skip if `--no-push` flag.**

```bash
git push
```

If push fails: `git pull --rebase && git push`. If still fails, tell the user. **NEVER force push.**

---

## Step 8: Summary

```
/wrap complete
  Retro: {path or "skipped (quick session)"}
  Handoff: inbox/handoff/{path}
  Plan vs Actual: {N}/{M} planned done {+ K unplanned}
  Rooms: {N} synced ({list})
  Commit: {short-hash} {subject}
  Pushed to {branch}

**Next**: {suggested next session action}
```

---

## Error Handling

| Error | Action |
|-------|--------|
| No git changes | Still write retro + handoff |
| Push rejected | `git pull --rebase && git push`. NEVER force push. |
| Room CLAUDE.md missing | Create it from memsudo template |
| changelog.md missing | Create with header |
| Session detection fails | Skip session ID. Continue. |
