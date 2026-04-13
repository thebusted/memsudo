/**
 * vault.ts — Manage .secrets/ directory for a memsudo palace.
 *
 * Secrets are stored as plain files under .secrets/{KEY}.
 * Sample templates live in .sample/{KEY}.example for safe committing.
 * Key names must be [A-Z0-9_] only.
 *
 * Zero runtime dependencies — Bun fs + path only.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  appendFileSync,
} from "fs";
import { chmod } from "fs/promises";
import { join } from "path";

/** Valid key name pattern: uppercase letters, digits, and underscores only. */
const KEY_RE = /^[A-Z0-9_]+$/;

/**
 * Validate a secret key name.
 * @throws Error if the key contains invalid characters
 */
function validateKey(key: string): void {
  if (!KEY_RE.test(key)) {
    throw new Error(
      `Invalid key "${key}": must match [A-Z0-9_] only (uppercase letters, digits, underscores).`
    );
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Verify that .gitignore in the palace root contains a .secrets/ entry.
 * If the entry is missing, append it.
 */
function ensureGitignore(palaceRoot: string): void {
  const gitignorePath = join(palaceRoot, ".gitignore");

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    // Check for .secrets/ on its own line (with or without trailing slash)
    if (/^\.secrets\/?$/m.test(content)) {
      return;
    }
    // Append the entry
    const separator = content.endsWith("\n") ? "" : "\n";
    appendFileSync(gitignorePath, `${separator}.secrets/\n`, "utf-8");
  } else {
    writeFileSync(gitignorePath, ".secrets/\n", "utf-8");
  }
}

/**
 * Set a secret value.
 *
 * Creates .secrets/{KEY} with value as content.
 * Also creates .sample/{KEY}.example with a placeholder.
 * Sets chmod 600 on the secret file.
 * Verifies .gitignore has a .secrets/ entry.
 *
 * @param key - Secret key name (must match [A-Z0-9_]+)
 * @param value - Secret value to store
 * @param palaceRoot - Absolute path to the palace root directory
 * @throws Error if key name is invalid
 */
export async function vaultSet(
  key: string,
  value: string,
  palaceRoot: string
): Promise<void> {
  validateKey(key);

  const secretsDir = join(palaceRoot, ".secrets");
  const sampleDir = join(palaceRoot, ".sample");

  ensureDir(secretsDir);
  ensureDir(sampleDir);

  // Write the secret file
  const secretPath = join(secretsDir, key);
  writeFileSync(secretPath, value, "utf-8");

  // Set restrictive permissions (owner read/write only)
  await chmod(secretPath, 0o600);

  // Write the sample/example file
  const samplePath = join(sampleDir, `${key}.example`);
  writeFileSync(
    samplePath,
    `# Replace with your actual value for ${key}\n`,
    "utf-8"
  );

  // Ensure .gitignore covers .secrets/
  ensureGitignore(palaceRoot);
}

/**
 * Get a secret value.
 *
 * Returns the file content of .secrets/{KEY}.
 *
 * @param key - Secret key name (must match [A-Z0-9_]+)
 * @param palaceRoot - Absolute path to the palace root directory
 * @returns The secret value as a string
 * @throws Error if key is invalid or secret file does not exist
 */
export async function vaultGet(
  key: string,
  palaceRoot: string
): Promise<string> {
  validateKey(key);

  const secretPath = join(palaceRoot, ".secrets", key);

  if (!existsSync(secretPath)) {
    throw new Error(`Secret "${key}" not found.`);
  }

  return readFileSync(secretPath, "utf-8");
}

/**
 * List all known secrets.
 *
 * Scans both .secrets/ and .sample/ to find all known keys.
 * A key is "set" if it exists in .secrets/, regardless of whether
 * a .sample/ entry exists.
 *
 * @param palaceRoot - Absolute path to the palace root directory
 * @returns Array of objects with key name and whether the value is set
 */
export async function vaultList(
  palaceRoot: string
): Promise<{ key: string; isSet: boolean }[]> {
  const secretsDir = join(palaceRoot, ".secrets");
  const sampleDir = join(palaceRoot, ".sample");

  const keys = new Set<string>();

  // Scan .secrets/ for set keys
  if (existsSync(secretsDir)) {
    for (const entry of readdirSync(secretsDir)) {
      // Skip hidden files and non-matching names
      if (KEY_RE.test(entry)) {
        keys.add(entry);
      }
    }
  }

  // Scan .sample/ for known keys (may include unset ones)
  if (existsSync(sampleDir)) {
    for (const entry of readdirSync(sampleDir)) {
      // Strip .example suffix to get the key name
      if (entry.endsWith(".example")) {
        const key = entry.slice(0, -".example".length);
        if (KEY_RE.test(key)) {
          keys.add(key);
        }
      }
    }
  }

  // Build result: check which keys have actual values set
  const setKeys = new Set<string>();
  if (existsSync(secretsDir)) {
    for (const entry of readdirSync(secretsDir)) {
      if (KEY_RE.test(entry)) {
        setKeys.add(entry);
      }
    }
  }

  return [...keys]
    .sort()
    .map((key) => ({ key, isSet: setKeys.has(key) }));
}
