/**
 * vault.ts — CLI command for memsudo vault operations.
 *
 * Routes subcommands: set, get, list.
 * Delegates to lib/vault.ts for actual secret management.
 *
 * Zero runtime dependencies — Bun + memsudo lib only.
 */

import { findRoot } from "../lib/palace";
import { vaultSet, vaultGet, vaultList } from "../lib/vault";

const USAGE = `Usage:
  memsudo vault set KEY value   Store a secret
  memsudo vault get KEY         Retrieve a secret (pipe-friendly)
  memsudo vault list            List all known keys`;

/**
 * Route vault subcommands: set, get, list.
 *
 * @param args - Arguments after "vault" (e.g. ["set", "API_KEY", "abc123"])
 */
export async function vaultCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || !["set", "get", "list"].includes(sub)) {
    console.log(USAGE);
    return;
  }

  const palaceRoot = findRoot();

  switch (sub) {
    case "set": {
      const key = args[1];
      const value = args.slice(2).join(" ");

      if (!key || value.length === 0) {
        console.error("Usage: memsudo vault set KEY value");
        process.exit(1);
      }

      await vaultSet(key, value, palaceRoot);
      console.log(`\u2713 Secret '${key}' saved (.secrets/${key}, chmod 600)`);
      break;
    }

    case "get": {
      const key = args[1];

      if (!key) {
        console.error("Usage: memsudo vault get KEY");
        process.exit(1);
      }

      try {
        const value = await vaultGet(key, palaceRoot);
        process.stdout.write(value);
      } catch {
        process.stderr.write(`\u2717 Key '${key}' not found\n`);
        process.exit(1);
      }
      break;
    }

    case "list": {
      const entries = await vaultList(palaceRoot);

      if (entries.length === 0) {
        console.log("No secrets found.");
        return;
      }

      for (const entry of entries) {
        const label = entry.isSet ? "(set)" : "(not set \u2014 see .sample/)";
        console.log(`${entry.key}  ${label}`);
      }
      break;
    }
  }
}
