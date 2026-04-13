---
name: wrap
description: End-of-session protocol. Updates rooms, commits, creates retrospective.
---

# /wrap

## Step 1: Focus sync
For each room touched this session:
1. Edit CLAUDE.md → update **Status** and ## Now
2. Append changelog.md → 1 line: {date} {emoji} {summary}

## Step 2: Commit
git add areas/ lab/ incubate/ memory/ inbox/
git commit with scope + summary

## Step 3: Retrospective (skip for sessions < 30 min)
Create memory/retrospectives/{YYYY-MM}/{DD}/{HH.MM}_{slug}.md

## Step 4: Handoff
Create inbox/handoff/{YYYY-MM-DD}_{HH-MM}_{slug}.md

## Step 5: Push
git push
