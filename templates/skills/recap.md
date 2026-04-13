---
name: recap
description: Recap a room's current status. Use at session start or when switching areas.
---

# /recap [room-name]

1. If room-name given → find room's CLAUDE.md
2. If no room-name → check for memsudo.yaml in cwd → read room path
3. If neither → read INDEX.md and ask which room

## Show
- Read CLAUDE.md → show **Status**, ## Now, ## Next
- Read changelog.md → show last 10 lines
- Summarize in 2-3 sentences
