/**
 * index-rebuild.ts — memsudo index rebuild command.
 *
 * Finds the palace root and regenerates INDEX.md from all rooms.
 *
 * Zero runtime dependencies — uses lib/palace + lib/indexer only.
 */

import { findRoot } from "../lib/palace";
import { rebuildIndex } from "../lib/indexer";

/**
 * Rebuild the palace INDEX.md by scanning all rooms.
 *
 * Usage: memsudo index rebuild
 *
 * @param args - CLI arguments (unused)
 */
export async function indexRebuildCommand(args: string[]): Promise<void> {
  const root = findRoot();
  const { roomCount, categoryCount } = await rebuildIndex(root);

  const roomWord = roomCount === 1 ? "room" : "rooms";
  const catWord = categoryCount === 1 ? "category" : "categories";

  console.log(
    `✓ INDEX.md rebuilt (${roomCount} ${roomWord}, ${categoryCount} ${catWord})`
  );
}
