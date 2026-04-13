/**
 * migrate.ts — CLI command for migrating an existing palace/brain into memsudo.
 *
 * Scans a source directory for CLAUDE.md room files, copies them into
 * the current palace, creates stubs for missing files, detects sensitive
 * content, reports orphans, and rebuilds the index.
 *
 * Zero runtime dependencies — Bun fs/glob + memsudo lib only.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "fs";
import { join, relative, basename, dirname } from "path";
import { findRoot } from "../lib/palace";
import { rebuildIndex } from "../lib/indexer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigratedRoom {
  relPath: string;
  fileCount: number;
  stubs: string[];
}

interface MigrationReport {
  totalFound: number;
  validCount: number;
  skippedCount: number;
  rooms: MigratedRoom[];
  stubSessions: string[];
  stubChangelogs: string[];
  orphans: { path: string; fileCount: number }[];
  ipFiles: string[];
  credFiles: string[];
}

// ---------------------------------------------------------------------------
// Sensitive file / content patterns
// ---------------------------------------------------------------------------

const SENSITIVE_NAMES = /\.(env|key|pem)$|^credentials|^secrets/i;

const IP_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/;
const CRED_PATTERNS = [
  /password\s*[:=]\s*\S+/i,
  /api[_-]?key\s*[:=]\s*\S+/i,
  /secret[_-]?key\s*[:=]\s*\S+/i,
  /token\s*[:=]\s*['"][^'"]+['"]/i,
  /-----BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/,
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
 * Determine the target relative path inside the palace.
 *
 * Preserves areas/, lab/, incubate/ structure from the source.
 * Anything else is placed under areas/.
 */
function deriveTargetPath(sourceRelPath: string): string {
  const parts = sourceRelPath.split("/");
  // Strip the trailing filename dir — we want the room dir path
  if (parts[0] === "areas" || parts[0] === "lab" || parts[0] === "incubate") {
    return sourceRelPath;
  }
  return `areas/${sourceRelPath}`;
}

/**
 * Recursively scan a directory for all files, returning paths relative to root.
 */
async function scanAllFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const match of glob.scan({ cwd: dir, absolute: false, onlyFiles: true })) {
    results.push(match);
  }
  return results;
}

/**
 * Recursively find all CLAUDE.md files under a directory.
 */
async function findClaudeMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const glob = new Bun.Glob("**/CLAUDE.md");
  for await (const match of glob.scan({ cwd: dir, absolute: false, onlyFiles: true })) {
    results.push(match);
  }
  return results.sort();
}

/**
 * Find all directories under source that do NOT contain a CLAUDE.md.
 */
async function findOrphans(
  sourceRoot: string,
  roomDirs: Set<string>
): Promise<{ path: string; fileCount: number }[]> {
  const orphans: { path: string; fileCount: number }[] = [];
  const allFiles = await scanAllFiles(sourceRoot);

  // Group files by their immediate parent directory
  const dirFiles = new Map<string, number>();
  for (const f of allFiles) {
    const dir = dirname(f);
    if (dir === ".") continue;
    // Get the top-level directory segment (depth 1-2)
    const parts = dir.split("/");
    const topDir = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
    dirFiles.set(topDir, (dirFiles.get(topDir) ?? 0) + 1);
  }

  for (const [dir, count] of dirFiles) {
    // Skip if this dir (or a parent) is a known room
    let isRoom = false;
    for (const roomDir of roomDirs) {
      if (dir === roomDir || dir.startsWith(roomDir + "/") || roomDir.startsWith(dir + "/")) {
        isRoom = true;
        break;
      }
    }
    if (!isRoom) {
      orphans.push({ path: dir, fileCount: count });
    }
  }

  return orphans.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Check file content for IP addresses and credential patterns.
 */
function scanForSensitiveContent(
  content: string
): { hasIP: boolean; hasCreds: boolean } {
  const hasIP = IP_PATTERN.test(content);
  const hasCreds = CRED_PATTERNS.some((p) => p.test(content));
  return { hasIP, hasCreds };
}

/**
 * Create a changelog stub for a room.
 */
function changelogStub(roomName: string): string {
  const title = titleCase(roomName);
  return `# Changelog \u2014 ${title}

${today()} \ud83d\udce5 Migrated into memsudo palace
`;
}

/**
 * Create a sessions stub for a room.
 */
function sessionsStub(roomName: string): string {
  const title = titleCase(roomName);
  return `# Sessions \u2014 ${title}

<!-- Migrated room. Append session narratives below. Newest at bottom. -->
`;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * Migrate an existing directory structure into a memsudo palace.
 *
 * @param args - CLI arguments after "migrate". First arg = source path.
 */
export async function migrateCommand(args: string[]): Promise<void> {
  const sourcePath = args[0];

  if (!sourcePath) {
    console.error("Usage: memsudo migrate <source-path>");
    process.exit(1);
  }

  // Resolve source path
  const absSource = sourcePath.startsWith("/")
    ? sourcePath
    : join(process.cwd(), sourcePath);

  // 1. Validate source path exists
  if (!existsSync(absSource)) {
    console.error(`\u2717 Source path does not exist: ${absSource}`);
    process.exit(1);
  }

  // 2. Find palace root (throws if not in a palace)
  let palaceRoot: string;
  try {
    palaceRoot = findRoot();
  } catch {
    console.error("\u2717 Not in a memsudo palace. Run 'memsudo init' first.");
    process.exit(1);
    return; // unreachable, satisfies TS
  }

  console.log(`memsudo migrate ${sourcePath}\n`);
  console.log("Scanning...");

  // 3. Find all CLAUDE.md files in source
  const claudeFiles = await findClaudeMdFiles(absSource);
  const totalFound = claudeFiles.length;

  const report: MigrationReport = {
    totalFound,
    validCount: 0,
    skippedCount: 0,
    rooms: [],
    stubSessions: [],
    stubChangelogs: [],
    orphans: [],
    ipFiles: [],
    credFiles: [],
  };

  const roomDirs = new Set<string>();

  // 4. Process each CLAUDE.md
  for (const claudeRelPath of claudeFiles) {
    const roomRelDir = dirname(claudeRelPath);
    const absClaudeMd = join(absSource, claudeRelPath);

    let content: string;
    try {
      content = readFileSync(absClaudeMd, "utf-8");
    } catch {
      report.skippedCount++;
      continue;
    }

    // Skip if no **Status**: line (not a room)
    if (!content.includes("**Status**:")) {
      report.skippedCount++;
      continue;
    }

    roomDirs.add(roomRelDir);
    report.validCount++;

    // Determine target path
    const targetRel = deriveTargetPath(roomRelDir);
    const targetAbs = join(palaceRoot, targetRel);
    const roomName = basename(roomRelDir);

    // Create target directory
    mkdirSync(targetAbs, { recursive: true });

    // Copy CLAUDE.md
    let fileCount = 0;
    const stubs: string[] = [];

    // Get all files in the source room directory
    const sourceRoomAbs = join(absSource, roomRelDir);
    const roomFiles = await scanAllFiles(sourceRoomAbs);

    // Copy CLAUDE.md first
    const targetClaudeMd = join(targetAbs, "CLAUDE.md");
    writeFileSync(targetClaudeMd, content, "utf-8");
    fileCount++;

    // Check CLAUDE.md for sensitive content
    const claudeScan = scanForSensitiveContent(content);
    if (claudeScan.hasIP) report.ipFiles.push(`${targetRel}/CLAUDE.md`);
    if (claudeScan.hasCreds) report.credFiles.push(`${targetRel}/CLAUDE.md`);

    // Copy changelog.md if exists, else create stub
    const sourceChangelog = join(sourceRoomAbs, "changelog.md");
    const targetChangelog = join(targetAbs, "changelog.md");
    if (existsSync(sourceChangelog)) {
      const changelogContent = readFileSync(sourceChangelog, "utf-8");
      writeFileSync(targetChangelog, changelogContent, "utf-8");
      fileCount++;

      const clScan = scanForSensitiveContent(changelogContent);
      if (clScan.hasIP) report.ipFiles.push(`${targetRel}/changelog.md`);
      if (clScan.hasCreds) report.credFiles.push(`${targetRel}/changelog.md`);
    } else {
      writeFileSync(targetChangelog, changelogStub(roomName), "utf-8");
      stubs.push("changelog.md");
      report.stubChangelogs.push(targetRel);
    }

    // Copy sessions.md if exists, else create stub
    const sourceSessions = join(sourceRoomAbs, "sessions.md");
    const targetSessions = join(targetAbs, "sessions.md");
    if (existsSync(sourceSessions)) {
      const sessionsContent = readFileSync(sourceSessions, "utf-8");
      writeFileSync(targetSessions, sessionsContent, "utf-8");
      fileCount++;

      const sScan = scanForSensitiveContent(sessionsContent);
      if (sScan.hasIP) report.ipFiles.push(`${targetRel}/sessions.md`);
      if (sScan.hasCreds) report.credFiles.push(`${targetRel}/sessions.md`);
    } else {
      writeFileSync(targetSessions, sessionsStub(roomName), "utf-8");
      stubs.push("sessions.md");
      report.stubSessions.push(targetRel);
    }

    // Copy other non-sensitive files in the room directory
    for (const file of roomFiles) {
      // Skip files we already handled
      if (file === "CLAUDE.md" || file === "changelog.md" || file === "sessions.md") {
        continue;
      }

      // Skip sensitive files
      if (SENSITIVE_NAMES.test(basename(file))) {
        continue;
      }

      // Skip subdirectories' files (only copy direct room files)
      if (file.includes("/")) continue;

      const sourceFile = join(sourceRoomAbs, file);
      const targetFile = join(targetAbs, file);
      try {
        copyFileSync(sourceFile, targetFile);
        fileCount++;

        // Scan text files for sensitive content
        if (/\.(md|txt|yaml|yml|json|toml|cfg|conf|ini)$/i.test(file)) {
          const fileContent = readFileSync(targetFile, "utf-8");
          const fScan = scanForSensitiveContent(fileContent);
          if (fScan.hasIP) report.ipFiles.push(`${targetRel}/${file}`);
          if (fScan.hasCreds) report.credFiles.push(`${targetRel}/${file}`);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const stubNote = stubs.length > 0 ? ` + ${stubs.length} stub` : "";
    report.rooms.push({ relPath: targetRel, fileCount, stubs });
  }

  // 7. Find orphan directories
  report.orphans = await findOrphans(absSource, roomDirs);

  // Print total found
  console.log(
    `  Found: ${totalFound} rooms (${report.validCount} valid, ${report.skippedCount} skipped)\n`
  );

  // Print imported rooms
  if (report.rooms.length > 0) {
    console.log("Rooms imported:");
    for (const room of report.rooms) {
      const stubNote =
        room.stubs.length > 0 ? ` + ${room.stubs.length} stub` : "";
      console.log(`  \u2713 ${room.relPath}/ (${room.fileCount} files${stubNote})`);
    }
    console.log();
  }

  // Print stubs created
  const totalStubs = report.stubSessions.length + report.stubChangelogs.length;
  if (totalStubs > 0) {
    console.log(`Stubs created: ${totalStubs}`);
    if (report.stubSessions.length > 0) {
      console.log(`  sessions.md: ${report.stubSessions.join(", ")}`);
    }
    if (report.stubChangelogs.length > 0) {
      console.log(`  changelog.md: ${report.stubChangelogs.join(", ")}`);
    }
    console.log();
  }

  // Print orphans
  if (report.orphans.length > 0) {
    console.log(`Orphan directories: ${report.orphans.length}`);
    for (const orphan of report.orphans) {
      console.log(`  ${orphan.path}/ (${orphan.fileCount} files)`);
    }
    console.log();
  }

  // Print warnings
  if (report.ipFiles.length > 0 || report.credFiles.length > 0) {
    console.log("Warnings:");
    if (report.ipFiles.length > 0) {
      const uniqueFiles = [...new Set(report.ipFiles)];
      console.log(`  \u26a0 IP addresses found in ${uniqueFiles.length} files`);
    }
    if (report.credFiles.length > 0) {
      const uniqueFiles = [...new Set(report.credFiles)];
      console.log(
        `  \u26a0 Credential patterns in ${uniqueFiles.length} files`
      );
    }
    console.log();
  }

  // 8. Rebuild index
  const { roomCount, categoryCount } = await rebuildIndex(palaceRoot);

  console.log(`\u2713 Migration complete: ${report.rooms.length} rooms imported`);
  console.log(`\u2713 INDEX.md rebuilt`);
}
