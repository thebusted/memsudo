/**
 * search.ts — memsudo search command.
 *
 * Full-text search across palace markdown files using grep.
 * Groups results by room path for readable output.
 *
 * Zero runtime dependencies — Bun.spawn for grep only.
 */

import { findRoot } from "../lib/palace";
import { relative } from "path";

/**
 * Parse search command arguments.
 *
 * Supports: memsudo search <query> [--dir <dir>] [--regex]
 */
function parseArgs(args: string[]): {
  query: string;
  dir: string | null;
  regex: boolean;
} {
  let query = "";
  let dir: string | null = null;
  let regex = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && i + 1 < args.length) {
      dir = args[++i];
    } else if (args[i] === "--regex") {
      regex = true;
    } else if (!query) {
      query = args[i];
    }
  }

  return { query, dir, regex };
}

/**
 * Extract the room path from a grep match file path.
 *
 * Given a file path relative to palace root (e.g. "areas/clients/betfair/CLAUDE.md"),
 * returns the room directory (e.g. "areas/clients/betfair").
 */
function roomFromFilePath(filePath: string): string {
  const parts = filePath.split("/");
  // Remove the filename to get the directory
  parts.pop();
  return parts.join("/") || ".";
}

/**
 * Search palace markdown files for a query string.
 *
 * Usage:
 *   memsudo search <query>             # fixed-string search
 *   memsudo search <query> --regex     # regex search
 *   memsudo search <query> --dir lab   # limit to lab/ directory
 *
 * @param args - CLI arguments: query string, optional --dir and --regex flags
 */
export async function searchCommand(args: string[]): Promise<void> {
  const { query, dir, regex } = parseArgs(args);

  if (!query) {
    console.log("Usage: memsudo search <query> [--dir <dir>] [--regex]");
    return;
  }

  const root = findRoot();
  const searchDir = dir ? `${root}/${dir}` : root;

  // Build grep command
  const grepArgs: string[] = [
    "-rn",
    '--include=*.md',
    // Exclude directories
    "--exclude-dir=.secrets",
    "--exclude-dir=.git",
    "--exclude-dir=node_modules",
    "--exclude-dir=.sample",
    "--exclude-dir=dist",
  ];

  // Fixed-string mode unless --regex
  if (!regex) {
    grepArgs.push("-F");
  }

  grepArgs.push(query, searchDir);

  const proc = Bun.spawn(["grep", ...grepArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  if (!stdout.trim()) {
    console.log(`No results for '${query}'`);
    return;
  }

  // Parse and group by room
  const lines = stdout.trim().split("\n");
  const grouped = new Map<string, string[]>();
  let matchCount = 0;

  for (const line of lines) {
    // grep output: /absolute/path/file.md:linenum:content
    // Make path relative to palace root
    const relLine = line.startsWith(root)
      ? line.slice(root.length + 1) // strip root + "/"
      : line;

    // Extract room from the relative file path
    const colonIdx = relLine.indexOf(":");
    if (colonIdx === -1) continue;

    const filePath = relLine.slice(0, colonIdx);
    const rest = relLine.slice(colonIdx + 1); // "linenum:content"
    const room = roomFromFilePath(filePath);
    const fileName = filePath.split("/").pop() || filePath;

    // Format as "filename:linenum: content"
    const display = `${fileName}:${rest}`;

    const existing = grouped.get(room);
    if (existing) {
      existing.push(display);
    } else {
      grouped.set(room, [display]);
    }
    matchCount++;
  }

  // Print grouped results
  const roomCount = grouped.size;

  for (const [room, matches] of grouped) {
    console.log(`${room}/`);
    for (const match of matches) {
      console.log(`  ${match}`);
    }
    console.log();
  }

  const matchWord = matchCount === 1 ? "match" : "matches";
  const roomWord = roomCount === 1 ? "room" : "rooms";
  console.log(`${matchCount} ${matchWord} across ${roomCount} ${roomWord}`);
}
