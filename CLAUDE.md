# memsudo — Development Guide

## Project

Memory Palace CLI tool. Bun + TypeScript. Zero runtime dependencies.

## Architecture

```
src/
├── index.ts              # CLI router (Bun.argv switch/case, NO framework)
├── commands/
│   ├── init.ts           # memsudo init
│   ├── room.ts           # memsudo room {create|list|enter|link}
│   ├── index-rebuild.ts  # memsudo index rebuild
│   ├── search.ts         # memsudo search
│   ├── vault.ts          # memsudo vault {set|get|list}
│   └── migrate.ts        # memsudo migrate
└── lib/
    ├── palace.ts         # findRoot (walk up dirs for INDEX.md)
    ├── room.ts           # CRUD: create 3 files, parse CLAUDE.md, findByName
    ├── indexer.ts         # Scan rooms → generate INDEX.md
    ├── markdown.ts       # Parse **Status**: line, ## sections
    └── vault.ts          # .secrets/ CRUD + .sample/ generation
```

## Key Rules

1. **Zero runtime dependencies** — use Bun.argv for CLI, Bun.file/write for fs. No Commander.js, no chalk, no inquirer.
2. **Match reality** — templates must match real CLAUDE.md format (inline bold `**Status**:`, `## Links` section)
3. **Parser edge cases** (from testing 57 real rooms):
   - Status: first emoji if present, else first word. First occurrence only.
   - ## Now: first non-empty line that does NOT start with `###`. Strip leading `- ` and markdown bold.
   - Links section: accept `## Links`, `## Reference`, `## References`
   - Skip CLAUDE.md files without `**Status**:` line (not room format)
4. **Path routing for room create**: prefix `lab/` → lab/, prefix `incubate/` → incubate/, everything else → areas/
5. **Name resolution**: exact dir name → **Aliases**: field → substring → ambiguous list
6. **Index scan depth**: areas depth 2-3, lab depth 2-3, incubate depth 2

## Dev Commands

```bash
bun run dev                    # Run from source
bun run dev -- init --name x   # Test init
bun run dev -- room create lab/test
bun run build                  # Build for npm publish
bun test                       # Run tests
```

## Testing

Test against real data at ~/oracle/ψ/ (57 rooms, 6 categories).
Plan with all specs: ~/oracle/ψ/memory/plans/2026-04-12_memsudo/plan-memsudo-v2.md
