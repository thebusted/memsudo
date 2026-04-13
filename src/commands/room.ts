/**
 * room.ts — Room subcommands for memsudo CLI.
 *
 * Routes: create | list | enter | link
 *
 * Uses lib/room.ts for CRUD and lib/indexer.ts for index rebuilds.
 * Zero runtime dependencies — Bun fs + path only.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { findRoot } from "../lib/palace";
import {
  createRoom,
  listRooms,
  findByName,
  linkRepo,
  type RoomInfo,
} from "../lib/room";
import { rebuildIndex } from "../lib/indexer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a table row with fixed-width columns.
 * Pads or truncates each value to fit the given widths.
 */
function pad(value: string, width: number): string {
  if (value.length > width) {
    return value.slice(0, width - 1) + "\u2026";
  }
  return value.padEnd(width);
}

/**
 * Check if --path-only flag is present in args.
 */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function handleCreate(args: string[]): Promise<void> {
  const roomPath = args[1];
  if (!roomPath) {
    console.error(
      "\u2717 Usage: memsudo room create <path>\n" +
        "  Examples: memsudo room create clients/acme\n" +
        "           memsudo room create lab/gold-brain"
    );
    process.exit(1);
  }

  let palaceRoot: string;
  try {
    palaceRoot = findRoot();
  } catch {
    console.error("\u2717 Not in a memsudo palace. Run 'memsudo init' first.");
    process.exit(1);
  }

  try {
    const relPath = await createRoom(roomPath, palaceRoot);
    const fullPath = join(palaceRoot, relPath);

    // Rebuild index after room creation
    await rebuildIndex(palaceRoot);

    console.log(`\u2713 Room created: ${fullPath}/ (3 files)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Check if it's an "already exists" error
    if (msg.includes("already exists")) {
      // Extract the relative path from the error
      const pathMatch = msg.match(/at (.+)\./);
      const path = pathMatch ? pathMatch[1] : roomPath;
      console.error(`\u2717 Room already exists: ${path}/`);
    } else {
      console.error(`\u2717 ${msg}`);
    }
    process.exit(1);
  }
}

async function handleList(args: string[]): Promise<void> {
  const categoryFilter = args[1] || null;

  let palaceRoot: string;
  try {
    palaceRoot = findRoot();
  } catch {
    console.error("\u2717 Not in a memsudo palace. Run 'memsudo init' first.");
    process.exit(1);
  }

  let rooms = await listRooms(palaceRoot);

  // Filter by category if specified
  if (categoryFilter) {
    const lower = categoryFilter.toLowerCase();
    rooms = rooms.filter((r) => r.category.toLowerCase() === lower);

    if (rooms.length === 0) {
      console.log(`No rooms in category '${categoryFilter}'.`);
      return;
    }
  }

  if (rooms.length === 0) {
    console.log("No rooms found. Run: memsudo room create <path>");
    return;
  }

  // Group by category
  const groups = new Map<string, RoomInfo[]>();
  for (const room of rooms) {
    const existing = groups.get(room.category);
    if (existing) {
      existing.push(room);
    } else {
      groups.set(room.category, [room]);
    }
  }

  // Sort categories
  const sortedCategories = [...groups.keys()].sort();

  // Print table per category
  for (const category of sortedCategories) {
    const entries = groups.get(category)!;
    const count = entries.length;
    const roomWord = count === 1 ? "room" : "rooms";

    console.log(`\n## ${category} (${count} ${roomWord})\n`);
    console.log(
      `${pad("Room", 20)} ${pad("Status", 10)} ${pad("Now", 50)}`
    );
    console.log(`${"─".repeat(20)} ${"─".repeat(10)} ${"─".repeat(50)}`);

    for (const room of entries) {
      const statusDisplay = room.status.emoji ?? room.status.text.split(/\s+/)[0] ?? "";
      const nowDisplay = room.now || "";
      console.log(
        `${pad(room.name, 20)} ${pad(statusDisplay, 10)} ${pad(nowDisplay, 50)}`
      );
    }
  }

  // Summary
  const totalRooms = rooms.length;
  const totalCategories = sortedCategories.length;
  const roomWord = totalRooms === 1 ? "room" : "rooms";
  const catWord = totalCategories === 1 ? "category" : "categories";
  console.log(
    `\nTotal: ${totalRooms} ${roomWord} across ${totalCategories} ${catWord}`
  );
}

async function handleEnter(args: string[]): Promise<void> {
  const name = args[1];
  if (!name) {
    console.error("\u2717 Usage: memsudo room enter <name> [--path-only]");
    process.exit(1);
  }

  const pathOnly = hasFlag(args, "--path-only");

  let palaceRoot: string;
  try {
    palaceRoot = findRoot();
  } catch {
    console.error("\u2717 Not in a memsudo palace. Run 'memsudo init' first.");
    process.exit(1);
  }

  const result = await findByName(name, palaceRoot);

  if (result === null) {
    console.error(
      `\u2717 No room matching '${name}'. Run memsudo room list.`
    );
    process.exit(1);
  }

  // Ambiguous — multiple matches
  if (Array.isArray(result)) {
    const list = result.map((r) => `  ${r.name} (${r.path})`).join("\n");
    console.error(
      `? Multiple rooms match '${name}':\n${list}\nSpecify the full path.`
    );
    process.exit(1);
  }

  // Single match
  const room = result;

  if (pathOnly) {
    console.log(room.absPath);
    return;
  }

  // Print path + status summary
  const statusDisplay = room.status.emoji
    ? `${room.status.emoji} ${room.status.text}`
    : room.status.text;

  console.log(`Path:     ${room.absPath}`);
  console.log(`Category: ${room.category}`);
  console.log(`Status:   ${statusDisplay}`);

  if (room.now) {
    console.log(`Now:      ${room.now}`);
  }

  // Read and show repo link if present
  try {
    const claudePath = join(room.absPath, "CLAUDE.md");
    const content = readFileSync(claudePath, "utf-8");

    // Look for Repo: links in ## Links section
    const repoMatch = content.match(
      /^- Repo:\s*\[([^\]]+)\]\(([^)]+)\)/m
    );
    if (repoMatch) {
      console.log(`Repo:     ${repoMatch[2]}`);
    }
  } catch {
    // CLAUDE.md unreadable — skip repo info
  }
}

async function handleLink(args: string[]): Promise<void> {
  const name = args[1];
  const repoPath = args[2];

  if (!name || !repoPath) {
    console.error(
      "\u2717 Usage: memsudo room link <name> <repo-path>"
    );
    process.exit(1);
  }

  let palaceRoot: string;
  try {
    palaceRoot = findRoot();
  } catch {
    console.error("\u2717 Not in a memsudo palace. Run 'memsudo init' first.");
    process.exit(1);
  }

  try {
    await linkRepo(name, repoPath, palaceRoot);
    console.log(
      `\u2713 Linked ${name} \u2192 ${repoPath} (links.yaml updated)`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("not found")) {
      console.error(
        `\u2717 No room matching '${name}'. Run memsudo room list.`
      );
    } else if (msg.includes("Ambiguous")) {
      // The lib already formats the ambiguous message nicely
      console.error(`? ${msg.replace("Ambiguous room name", "Multiple rooms match")}`);
      console.error("Specify the full path.");
    } else {
      console.error(`\u2717 ${msg}`);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const SUBCOMMANDS: Record<
  string,
  (args: string[]) => Promise<void>
> = {
  create: handleCreate,
  list: handleList,
  enter: handleEnter,
  link: handleLink,
};

export async function roomCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || !SUBCOMMANDS[sub]) {
    const available = Object.keys(SUBCOMMANDS).join(" | ");
    console.error(
      `\u2717 Usage: memsudo room <${available}>\n` +
        "\n" +
        "  create <path>              Create a new room\n" +
        "  list [category]            List all rooms\n" +
        "  enter <name> [--path-only] Find and show a room\n" +
        "  link <name> <repo-path>    Link a room to a repo"
    );
    process.exit(1);
  }

  await SUBCOMMANDS[sub](args);
}
