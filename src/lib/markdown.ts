/**
 * markdown.ts — Parse CLAUDE.md files for memsudo rooms.
 *
 * Extracts status, current focus, links, aliases, and sections
 * from the standardised CLAUDE.md format used across 57+ real rooms.
 *
 * Zero runtime dependencies — pure string/regex operations.
 */

/**
 * Unicode emoji regex (simplified but covers common emoji ranges).
 * Matches a single leading emoji character including skin-tone modifiers
 * and variation selectors.
 */
const EMOJI_RE =
  /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA9F}\u{1FAA0}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;

/**
 * Extract **Status**: line from CLAUDE.md content.
 *
 * Takes the first occurrence only. If the value starts with an emoji,
 * that emoji is extracted separately; otherwise emoji is null and text
 * is the first word.
 *
 * @param content - Raw CLAUDE.md content
 * @returns Object with emoji (or null) and text
 */
export function parseStatus(content: string): {
  emoji: string | null;
  text: string;
} {
  const match = content.match(/^\*\*Status\*\*:\s*(.+)$/m);
  if (!match) {
    return { emoji: null, text: "" };
  }

  const raw = match[1].trim();

  // Check if it starts with an emoji
  const emojiMatch = raw.match(EMOJI_RE);
  if (emojiMatch) {
    const emoji = emojiMatch[0];
    const rest = raw.slice(emoji.length).trim();
    return { emoji, text: rest || raw };
  }

  // No emoji — text is the full value, first word is the effective label
  return { emoji: null, text: raw };
}

/**
 * Extract the current focus from the ## Now section.
 *
 * Finds the ## Now header, then returns the first non-empty line
 * that does NOT start with `###`. Strips leading `- `, strips
 * markdown bold (`**...**`), and truncates to maxLen.
 *
 * @param content - Raw CLAUDE.md content
 * @param maxLen - Maximum length before truncation (default 80)
 * @returns The now-focus string, or empty string if not found
 */
export function parseNow(content: string, maxLen: number = 80): string {
  const lines = content.split("\n");
  let inNow = false;

  for (const line of lines) {
    if (!inNow) {
      if (/^## Now\b/i.test(line)) {
        inNow = true;
      }
      continue;
    }

    // Stop at the next ## section (but not ###)
    if (/^## [^#]/.test(line)) {
      break;
    }

    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed.length === 0) continue;

    // Skip ### sub-headers
    if (trimmed.startsWith("###")) continue;

    // Found our line — clean it up
    let result = trimmed;

    // Strip leading "- "
    if (result.startsWith("- ")) {
      result = result.slice(2);
    }

    // Strip markdown bold **text** → text
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1");

    // Truncate
    if (result.length > maxLen) {
      result = result.slice(0, maxLen - 1) + "\u2026";
    }

    return result;
  }

  return "";
}

/**
 * Find the Links / Reference / References section content.
 *
 * Tries `## Links`, then `## Reference`, then `## References`.
 * Returns everything between the matched header and the next `## ` header
 * (or end of file).
 *
 * @param content - Raw CLAUDE.md content
 * @returns Section content as string, or null if not found
 */
export function findLinksSection(content: string): string | null {
  const headers = ["## Links", "## Reference", "## References"];

  for (const header of headers) {
    const idx = content.indexOf(header + "\n");
    // Also try header at end of file (no trailing newline)
    const idxEnd = content.endsWith(header) ? content.indexOf(header) : -1;
    const start = idx !== -1 ? idx : idxEnd;
    if (start === -1) continue;

    // Skip the header line itself
    const afterHeader = content.indexOf("\n", start);
    if (afterHeader === -1) return "";

    const rest = content.slice(afterHeader + 1);

    // Find the next ## section (but not ###)
    const nextSection = rest.match(/^## [^#]/m);
    if (nextSection && nextSection.index !== undefined) {
      return rest.slice(0, nextSection.index).trimEnd();
    }

    return rest.trimEnd();
  }

  return null;
}

/**
 * Extract **Aliases**: field value as an array.
 *
 * Splits by comma, trims each entry, filters out empties.
 *
 * @param content - Raw CLAUDE.md content
 * @returns Array of alias strings, or empty array
 */
export function parseAliases(content: string): string[] {
  const match = content.match(/^\*\*Aliases\*\*:\s*(.+)$/m);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

/**
 * Extract all ## sections from the content.
 *
 * Each section includes the header name (without `## `) and all content
 * up to the next `## ` header or end of file. Sub-headers (`###`, etc.)
 * are included in the section content.
 *
 * @param content - Raw CLAUDE.md content
 * @returns Array of { name, content } objects
 */
export function parseSections(
  content: string
): { name: string; content: string }[] {
  const sections: { name: string; content: string }[] = [];
  const lines = content.split("\n");
  let currentName: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Match ## headers but not ### or deeper
    const headerMatch = line.match(/^## ([^#].*)$/);
    if (headerMatch) {
      // Save previous section
      if (currentName !== null) {
        sections.push({
          name: currentName,
          content: currentLines.join("\n").trim(),
        });
      }
      currentName = headerMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentName !== null) {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentName !== null) {
    sections.push({
      name: currentName,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections;
}
