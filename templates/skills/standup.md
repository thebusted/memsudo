---
name: standup
origin: Adapted from Nat Weerawan's Oracle /standup (Soul Brews Studio) — palace edition
description: "Daily standup check — palace rooms, pending tasks, recent progress, schedule. Use when user says 'standup', 'morning check', 'what is pending', or at start of a work day."
---

# /standup — Daily Standup

> Adapted from [Nat Weerawan's Oracle](https://github.com/laris-co/oracle) /standup skill (Soul Brews Studio).
> Ported for memsudo Memory Palace. Original: v3.5.2 G-SKLL.

Quick check: room status, pending tasks, recent progress, schedule.

## Usage

```
/standup          # Full standup check
```

---

## Action

### Step 0: Timestamp
```bash
date "+%H:%M %Z (%A %d %B %Y)"
```

### Step 1: Palace Overview

```bash
cat INDEX.md
```

Organize rooms by priority:
1. **Blocked** rooms first (need attention now)
2. **Waiting** rooms (check if unblocked)
3. **Active** rooms (sorted by last updated)

### Step 2: Open Issues (if GitHub repo)

```bash
gh issue list --state open --limit 10 --json number,title,updatedAt --jq '.[] | "#\(.number) \(.title)"' 2>/dev/null
```

Skip silently if not a GitHub repo or gh not available.

### Step 3: Recent Progress (24h)

```bash
git log --since="24 hours ago" --format="%h %s" | head -10
```

### Step 4: Latest Handoff

```bash
ls -t inbox/handoff/*.md 2>/dev/null | head -1
```

Read most recent handoff → show pending items from "Next Session".

### Step 5: Schedule/Appointments

```bash
cat inbox/schedule.md 2>/dev/null | grep -v "^#\|^$\|---" | head -5
```

If no schedule file, show "No schedule found."

### Step 6: Latest Retrospective

```bash
ls -t memory/retrospectives/**/*.md 2>/dev/null | head -1
```

Read and show key takeaway (Lessons Learned section).

### Step 7: Inbox Messages

```bash
ls inbox/messages/pending/*.md 2>/dev/null | wc -l
```

If pending messages > 0, show count and latest message subject.

---

## Output Format

```markdown
## Standup @ [TIME]

### Palace
| Status | Rooms |
|--------|-------|
| Blocked | {list or "none"} |
| Waiting | {list or "none"} |
| Active | {count} rooms |

### Done (24h)
- [commit 1]
- [commit 2]

### Pending (from handoff)
- [ ] {item from last handoff}
- [ ] {item from last handoff}

### Open Issues
| # | Task | Updated |
|---|------|---------|
| #N | title | date |

### Appointments
- [from schedule or "none"]

### Inbox
- {N} pending messages

### Next Action
- [suggest based on priorities — blocked rooms first]

---
**Next?**
```

---

## Hard Rules

1. Blocked rooms always surface first
2. Skip sections silently if data unavailable
3. Suggest next action — don't prescribe
4. One bash call per step — minimize latency

---

## Related

- `/recap` — Full session context
- `/wrap` — End-of-session protocol
