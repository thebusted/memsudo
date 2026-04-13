/**
 * room.ts — Room CRUD operations for memsudo.
 *
 * Handles creating rooms (3-file sets), listing/scanning rooms,
 * finding rooms by name, linking repos, and parsing CLAUDE.md.
 *
 * Zero runtime dependencies — Bun fs + path only.
 */

import { mkdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join, resolve, basename, dirname, relative } from "path";
import { findRoot } from "./palace";
import {
  parseStatus,
  parseNow,
  findLinksSection,
  parseAliases,
} from "./markdown";

// ---------------------------------------------------------------------------
// links.yaml validation
// ---------------------------------------------------------------------------

export interface LinksYaml {
  repos?: Record<string, string>;
  infra?: Record<string, string>;
}

const VALID_REPO_KEYS = new Set(["local", "remote", "server", "origin", "mirror"]);
const VALID_INFRA_KEYS = new Set(["docker", "database", "redis", "ssh", "tunnel", "nginx", "cdn", "api", "dashboard", "pm2"]);

/**
 * Parse and validate a links.yaml file.
 * Returns parsed object or throws with specific error.
 */
export function parseLinksYaml(filePath: string): LinksYaml {
  if (!existsSync(filePath)) return {};

  const content = readFileSync(filePath, "utf-8");
  const result: LinksYaml = {};
  let currentSection: "repos" | "infra" | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed === "repos:") {
      currentSection = "repos";
      result.repos = {};
      continue;
    }
    if (trimmed === "infra:") {
      currentSection = "infra";
      result.infra = {};
      continue;
    }

    // Parse key: value under current section
    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (kvMatch && currentSection) {
      const [, key, value] = kvMatch;
      const cleanValue = value.replace(/^["']|["']$/g, "");

      if (currentSection === "repos") {
        if (!VALID_REPO_KEYS.has(key)) {
          console.warn(`links.yaml warning: unknown repo key "${key}" in ${filePath}`);
        }
        result.repos![key] = cleanValue;
      } else if (currentSection === "infra") {
        if (!VALID_INFRA_KEYS.has(key)) {
          console.warn(`links.yaml warning: unknown infra key "${key}" in ${filePath}`);
        }
        result.infra![key] = cleanValue;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoomInfo {
  name: string; // directory name (e.g. "betfair")
  path: string; // relative to palace root (e.g. "areas/clients/betfair")
  absPath: string; // absolute path
  status: { emoji: string | null; text: string };
  now: string; // first 60 chars of ## Now
  category: string; // derived from path (e.g. "clients", "lab", "incubate")
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESERVED_NAMES = new Set([
  "memory",
  "inbox",
  "outbox",
  "archive",
  ".secrets",
  ".sample",
  ".claude",
  "scripts",
  "writing",
]);

// Scan patterns: [baseDir, depth] — depth is how many path segments after baseDir
// areas depth 2-3: areas/clients/betfair, areas/clients/sub/room
// lab depth 2-3: lab/gold-brain, lab/football/basketball
// incubate depth 2: incubate/my-app
const SCAN_PATTERNS: Array<{ base: string; glob: string }> = [
  { base: "areas", glob: "areas/*/*" },
  { base: "areas", glob: "areas/*/*/*" },
  { base: "lab", glob: "lab/*" },
  { base: "lab", glob: "lab/*/*" },
  { base: "incubate", glob: "incubate/*" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function titleCase(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derive the category from a room's relative path.
 *
 * - "areas/clients/betfair" → "clients"
 * - "lab/gold-brain" → "lab"
 * - "incubate/my-app" → "incubate"
 */
function deriveCategory(relPath: string): string {
  const parts = relPath.split("/");
  if (parts[0] === "areas" && parts.length >= 3) {
    return parts[1]; // e.g. "clients", "personal", "jobs", "tools"
  }
  return parts[0]; // "lab" or "incubate"
}

/**
 * Compute the resolved path for a room based on path routing rules.
 *
 * - "lab/X" → "lab/X"
 * - "incubate/X" → "incubate/X"
 * - everything else → "areas/{path}"
 */
function routePath(roomPath: string): string {
  const parts = roomPath.split("/");
  if (parts[0] === "lab" || parts[0] === "incubate") {
    return roomPath;
  }
  return `areas/${roomPath}`;
}

/**
 * Scan for directories matching patterns using Bun.Glob.
 * Returns directories that contain a CLAUDE.md file.
 */
async function scanRoomDirs(palaceRoot: string): Promise<string[]> {
  const dirs: Set<string> = new Set();

  for (const pattern of SCAN_PATTERNS) {
    const globPattern = pattern.glob + "/CLAUDE.md";
    const glob = new Bun.Glob(globPattern);

    for await (const match of glob.scan({
      cwd: palaceRoot,
      absolute: false,
      onlyFiles: true,
    })) {
      // match is like "areas/clients/betfair/CLAUDE.md"
      const dir = dirname(match);
      dirs.add(dir);
    }
  }

  return Array.from(dirs).sort();
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function claudeMdTemplate(roomName: string, category: string): string {
  const title = titleCase(roomName);
  return `# ${title}

**Status**: \u{1F7E1} New
**Updated**: ${today()}
**Category**: ${category}

## Now

_Describe current state_

## Next

1. _First priority_

## Links

- Changelog: [changelog.md](changelog.md)
- Sessions: [sessions.md](sessions.md)
`;
}

function changelogTemplate(roomName: string): string {
  const title = titleCase(roomName);
  return `# Changelog \u2014 ${title}

${today()} \u{1F3D7}\uFE0F Room created
`;
}

function sessionsTemplate(roomName: string): string {
  const title = titleCase(roomName);
  return `# Sessions \u2014 ${title}

<!-- Append session narratives below. Newest at bottom. -->
`;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Create a new room with 3 files (CLAUDE.md, changelog.md, sessions.md).
 *
 * Path routing:
 * - "lab/X" -> lab/X/
 * - "incubate/X" -> incubate/X/
 * - everything else -> areas/X/
 *
 * @param roomPath - The room path as provided by the user (e.g. "clients/acme", "lab/gold-brain")
 * @param palaceRoot - Absolute path to the palace root
 * @returns The relative path where the room was created
 * @throws If the room already exists or the name is reserved
 */
export async function createRoom(
  roomPath: string,
  palaceRoot: string
): Promise<string> {
  // Normalise: strip trailing slashes
  roomPath = roomPath.replace(/\/+$/, "");

  const roomName = basename(roomPath);

  // Check reserved names
  if (RESERVED_NAMES.has(roomName.toLowerCase())) {
    throw new Error(
      `Cannot create room "${roomName}": name is reserved.`
    );
  }

  // Route to the correct location
  const relPath = routePath(roomPath);
  const absPath = join(palaceRoot, relPath);

  // Check if room already exists
  const claudePath = join(absPath, "CLAUDE.md");
  if (existsSync(claudePath)) {
    throw new Error(`Room already exists at ${relPath}.`);
  }

  // Derive category
  const category = deriveCategory(relPath);

  // Create directory tree
  await mkdir(absPath, { recursive: true });

  // Write the 3 files
  await Bun.write(join(absPath, "CLAUDE.md"), claudeMdTemplate(roomName, category));
  await Bun.write(join(absPath, "changelog.md"), changelogTemplate(roomName));
  await Bun.write(join(absPath, "sessions.md"), sessionsTemplate(roomName));

  return relPath;
}

/**
 * List all rooms by scanning for CLAUDE.md files across the palace.
 *
 * Scans: areas/*\/*, areas/*\/*\/*, lab/*, lab/*\/*, incubate/*
 * Skips files without a **Status**: line (not room format).
 *
 * @param palaceRoot - Absolute path to the palace root
 * @returns Array of RoomInfo objects, sorted by path
 */
export async function listRooms(palaceRoot: string): Promise<RoomInfo[]> {
  const dirs = await scanRoomDirs(palaceRoot);
  const rooms: RoomInfo[] = [];

  for (const relDir of dirs) {
    const absDir = join(palaceRoot, relDir);
    const claudePath = join(absDir, "CLAUDE.md");

    try {
      const file = Bun.file(claudePath);
      const content = await file.text();

      // Skip CLAUDE.md files without **Status**: line
      if (!content.match(/^\*\*Status\*\*:/m)) {
        continue;
      }

      const status = parseStatus(content);
      const now = parseNow(content, 60);
      const aliases = parseAliases(content);
      const name = basename(relDir);
      const category = deriveCategory(relDir);

      rooms.push({
        name,
        path: relDir,
        absPath: absDir,
        status,
        now,
        category,
        aliases,
      });
    } catch {
      // File unreadable — skip
      continue;
    }
  }

  return rooms;
}

/**
 * Find a room by name.
 *
 * Resolution order:
 * 1. Exact directory name match
 * 2. Alias match (from **Aliases**: field)
 * 3. Substring match on directory name
 *
 * @param name - The name/alias/substring to search for
 * @param palaceRoot - Absolute path to the palace root
 * @returns Single RoomInfo if unique match, array if ambiguous, null if not found
 */
export async function findByName(
  name: string,
  palaceRoot: string
): Promise<RoomInfo | RoomInfo[] | null> {
  const rooms = await listRooms(palaceRoot);
  const lower = name.toLowerCase();

  // 0. Path match — allows "tools/memsudo" or "lab/gold-brain" for disambiguation
  if (lower.includes("/")) {
    const pathMatches = rooms.filter((r) => r.path.toLowerCase().endsWith(lower));
    if (pathMatches.length === 1) return pathMatches[0];
    if (pathMatches.length > 1) return pathMatches;
  }

  // 1. Exact directory name match
  const exactMatches = rooms.filter((r) => r.name.toLowerCase() === lower);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return exactMatches;

  // 2. Alias match
  const aliasMatches = rooms.filter((r) =>
    r.aliases.some((a) => a.toLowerCase() === lower)
  );
  if (aliasMatches.length === 1) return aliasMatches[0];
  if (aliasMatches.length > 1) return aliasMatches;

  // 3. Substring match on directory name
  const substringMatches = rooms.filter((r) =>
    r.name.toLowerCase().includes(lower)
  );
  if (substringMatches.length === 1) return substringMatches[0];
  if (substringMatches.length > 1) return substringMatches;

  return null;
}

/**
 * Add a repo link to a room's CLAUDE.md ## Links section.
 *
 * Also creates:
 * - memsudo.yaml in the repo (pointing back to the palace room)
 * - Adds memsudo.yaml to the repo's .gitignore
 * - Creates .claude/hooks.json in the repo with session-start hook
 *
 * @param roomName - Name of the room to link
 * @param repoPath - Absolute or relative path to the repo
 * @param palaceRoot - Absolute path to the palace root
 * @throws If room not found or repo path doesn't exist
 */
export async function linkRepo(
  roomName: string,
  repoPath: string,
  palaceRoot: string
): Promise<void> {
  // Resolve repo path
  const absRepo = resolve(repoPath);
  if (!existsSync(absRepo)) {
    throw new Error(`Repo path does not exist: ${absRepo}`);
  }

  // Find the room
  const result = await findByName(roomName, palaceRoot);
  if (result === null) {
    throw new Error(`Room not found: "${roomName}"`);
  }
  if (Array.isArray(result)) {
    const names = result.map((r) => `  ${r.name} (${r.path})`).join("\n");
    throw new Error(
      `Ambiguous room name "${roomName}". Matches:\n${names}`
    );
  }

  const room = result;
  const repoName = basename(absRepo);

  // 1. Append repo link to CLAUDE.md ## Links section
  const claudePath = join(room.absPath, "CLAUDE.md");
  const content = await Bun.file(claudePath).text();
  const linksContent = findLinksSection(content);

  const linkLine = `- Repo: [${repoName}](${absRepo})`;

  let updatedContent: string;
  if (linksContent !== null) {
    // Find the end of the Links section and append before next section
    const linksHeaders = ["## Links", "## Reference", "## References"];
    let headerIdx = -1;
    for (const h of linksHeaders) {
      const idx = content.indexOf(h + "\n");
      if (idx !== -1) {
        headerIdx = idx;
        break;
      }
      // Also try header at end of file
      if (content.endsWith(h)) {
        headerIdx = content.indexOf(h);
        break;
      }
    }

    if (headerIdx !== -1) {
      // Find the end of the links section
      const afterHeader = content.indexOf("\n", headerIdx);
      const rest = content.slice(afterHeader + 1);
      const nextSection = rest.match(/^## [^#]/m);

      if (nextSection && nextSection.index !== undefined) {
        // Insert before the next section
        const insertAt = afterHeader + 1 + nextSection.index;
        updatedContent =
          content.slice(0, insertAt).trimEnd() +
          "\n" +
          linkLine +
          "\n\n" +
          content.slice(insertAt);
      } else {
        // Append at end of file
        updatedContent = content.trimEnd() + "\n" + linkLine + "\n";
      }
    } else {
      // No links header found — shouldn't happen, append at end
      updatedContent = content.trimEnd() + "\n\n## Links\n\n" + linkLine + "\n";
    }
  } else {
    // No links section at all — add one at end
    updatedContent = content.trimEnd() + "\n\n## Links\n\n" + linkLine + "\n";
  }

  await Bun.write(claudePath, updatedContent);

  // 2. Create/update links.yaml in the room directory (palace side)
  const linksYamlPath = join(room.absPath, "links.yaml");
  let linksYaml = "";

  if (existsSync(linksYamlPath)) {
    linksYaml = readFileSync(linksYamlPath, "utf-8");
  }

  // Check if this repo is already linked
  if (!linksYaml.includes(absRepo)) {
    const entry = linksYaml.length === 0
      ? `# links.yaml — machine-readable pointers to code and infrastructure\nrepos:\n  local: ${absRepo}\n`
      : linksYaml.trimEnd() + `\n  local: ${absRepo}\n`;
    await Bun.write(linksYamlPath, entry);
  }
}

/**
 * Read and parse a room's CLAUDE.md file.
 *
 * @param roomPath - Relative path from palace root (e.g. "areas/clients/betfair")
 *                   OR absolute path to the room directory
 * @param palaceRoot - Absolute path to the palace root (optional if roomPath is absolute)
 * @returns Parsed RoomInfo
 * @throws If CLAUDE.md not found or unreadable
 */
export async function readRoom(
  roomPath: string,
  palaceRoot?: string
): Promise<RoomInfo> {
  // Determine absolute path
  let absPath: string;
  let relPath: string;

  if (roomPath.startsWith("/")) {
    absPath = roomPath;
    // Try to derive relative path if palaceRoot provided
    relPath = palaceRoot ? relative(palaceRoot, roomPath) : roomPath;
  } else {
    if (!palaceRoot) {
      throw new Error("palaceRoot is required when roomPath is relative.");
    }
    absPath = join(palaceRoot, roomPath);
    relPath = roomPath;
  }

  const claudePath = join(absPath, "CLAUDE.md");
  const file = Bun.file(claudePath);

  if (!(await file.exists())) {
    throw new Error(`CLAUDE.md not found at ${claudePath}`);
  }

  const content = await file.text();

  const status = parseStatus(content);
  const now = parseNow(content, 60);
  const aliases = parseAliases(content);
  const name = basename(absPath);
  const category = deriveCategory(relPath);

  return {
    name,
    path: relPath,
    absPath,
    status,
    now,
    category,
    aliases,
  };
}
