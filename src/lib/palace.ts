/**
 * palace.ts — Find and validate a memsudo palace root directory.
 *
 * Walks up from cwd looking for INDEX.md with the memsudo signature,
 * or memsudo.yaml with a palace: field pointing elsewhere.
 *
 * Zero runtime dependencies — Bun fs + path only.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";

const SIGNATURE = "memsudo index rebuild";

/**
 * Expand a leading `~` to the user's home directory.
 * Prefers Bun.env.HOME, falls back to process.env.HOME.
 */
function expandTilde(p: string): string {
  if (!p.startsWith("~")) return p;
  const home =
    (typeof Bun !== "undefined" ? Bun.env.HOME : undefined) ??
    process.env.HOME;
  if (!home) return p;
  // ~/foo → /home/user/foo   ~/ → /home/user/   ~ → /home/user
  return join(home, p.slice(1));
}

/**
 * Read a simple YAML value from `memsudo.yaml`.
 * Only handles `palace: <value>` — no full YAML parser.
 */
function readPalaceFromYaml(yamlPath: string): string | null {
  try {
    const content = readFileSync(yamlPath, "utf-8");
    const match = content.match(/^palace:\s*(.+)$/m);
    if (!match) return null;
    const raw = match[1].trim().replace(/^["']|["']$/g, "");
    return raw.length > 0 ? expandTilde(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Check whether `dir` contains an INDEX.md with the memsudo signature.
 */
function hasSignatureIndex(dir: string): boolean {
  const indexPath = join(dir, "INDEX.md");
  try {
    const content = readFileSync(indexPath, "utf-8");
    return content.includes(SIGNATURE);
  } catch {
    return false;
  }
}

/**
 * Walk up directories looking for a memsudo palace root.
 *
 * Detection order at each directory level:
 * 1. INDEX.md exists AND contains "memsudo index rebuild"  → return that dir
 * 2. memsudo.yaml exists → read `palace:` field → expand tilde → return that path
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Absolute path to the palace root
 * @throws Error if no palace is found before reaching filesystem root
 */
export function findRoot(startDir?: string): string {
  let current = resolve(startDir ?? process.cwd());

  while (true) {
    // Check 1: INDEX.md with memsudo signature
    if (hasSignatureIndex(current)) {
      return current;
    }

    // Check 2: memsudo.yaml with palace: field
    const yamlPath = join(current, "memsudo.yaml");
    if (existsSync(yamlPath)) {
      const palacePath = readPalaceFromYaml(yamlPath);
      if (palacePath) {
        const resolved = resolve(current, palacePath);
        return resolved;
      }
    }

    // Move up one level
    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  // Check 3: Global config (~/.config/memsudo/config.yaml)
  const home =
    (typeof Bun !== "undefined" ? Bun.env.HOME : undefined) ??
    process.env.HOME;
  if (home) {
    const globalConfig = join(home, ".config", "memsudo", "config.yaml");
    if (existsSync(globalConfig)) {
      try {
        const content = readFileSync(globalConfig, "utf-8");
        const match = content.match(/^default_palace:\s*(.+)$/m);
        if (match) {
          const raw = match[1].trim().replace(/^["']|["']$/g, "");
          const resolved = expandTilde(raw);
          if (hasSignatureIndex(resolved)) {
            return resolved;
          }
        }
      } catch {
        // ignore read errors
      }
    }
  }

  throw new Error("Not in a memsudo palace. Run 'memsudo init' first.");
}

/**
 * Validate that a palace root has the required structure.
 *
 * Required files:
 * - INDEX.md
 * - CLAUDE.md
 *
 * @param root - Absolute path to the palace root
 * @returns true if both required files exist
 */
export function validate(root: string): boolean {
  const indexExists = existsSync(join(root, "INDEX.md"));
  const claudeExists = existsSync(join(root, "CLAUDE.md"));
  return indexExists && claudeExists;
}
