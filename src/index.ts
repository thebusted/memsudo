#!/usr/bin/env node
/**
 * index.ts — CLI router for memsudo.
 *
 * Routes process.argv to command handlers using switch/case.
 * Zero runtime dependencies — no Commander.js, no yargs.
 */

import { initCommand } from "./commands/init";
import { roomCommand } from "./commands/room";
import { indexRebuildCommand } from "./commands/index-rebuild";
import { searchCommand } from "./commands/search";
import { vaultCommand } from "./commands/vault";
import { migrateCommand } from "./commands/migrate";

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP = `memsudo v${VERSION} — Memory Palace CLI

Usage:
  memsudo init [--name <name>]          Initialize a new palace
  memsudo room create <path>            Create a new room
  memsudo room list [category]          List all rooms
  memsudo room enter <name> [--path-only]  Find and show a room
  memsudo room link <name> <repo-path>  Link a room to a repo
  memsudo index rebuild                 Rebuild INDEX.md
  memsudo search <query> [--dir <d>] [--regex]  Search palace
  memsudo vault set KEY value           Store a secret
  memsudo vault get KEY                 Retrieve a secret
  memsudo vault list                    List all keys
  memsudo migrate <source-path>         Migrate existing palace

Flags:
  --help, -h      Show this help
  --version, -v   Show version
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Bun.argv: [bun, script, ...args]
  // Node: [node, script, ...args]
  const args = process.argv.slice(2);

  // No args — show help
  if (args.length === 0) {
    console.log(HELP);
    return;
  }

  const command = args[0];

  // Global flags
  if (command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  // Route to command handlers
  switch (command) {
    case "init":
      await initCommand(args.slice(1));
      break;

    case "room":
      await roomCommand(args.slice(1));
      break;

    case "index": {
      const sub = args[1];
      if (sub === "rebuild") {
        await indexRebuildCommand(args.slice(2));
      } else {
        console.error("Usage: memsudo index rebuild");
        process.exit(1);
      }
      break;
    }

    case "search":
      await searchCommand(args.slice(1));
      break;

    case "vault":
      await vaultCommand(args.slice(1));
      break;

    case "migrate":
      await migrateCommand(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
