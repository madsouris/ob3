export interface ManualSection {
  /** Stable slug used by `#/manual/<slug>`. */
  readonly id: string;
  /** `1` for “1. Before you start”; empty when the heading is unnumbered. */
  readonly number: string;
  readonly title: string;
  readonly body: string;
}

export interface ManualDocument {
  readonly title: string;
  /** Markdown before the first `##`, already cleaned. */
  readonly intro: string;
  readonly sections: readonly ManualSection[];
}

/**
 * Repo-only links (`../brief.md`) become plain text: the SPA has no `docs/`
 * tree, and a dead link is worse than a citation. Used on every rendered chunk.
 */
const DOC_LINK = /\[([^\]]+)\]\(([^)\s]+\.md(?:#[^)]*)?)\)/g;

export const demoteDocLinks = (markdown: string): string => markdown.replace(DOC_LINK, '$1');

export const slugify = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Drops the `---` rules the manual uses between sections. */
const trimRules = (markdown: string): string =>
  markdown
    .replace(/^(?:[ \t]*---[ \t]*\n?)+/, '')
    .replace(/(?:\n[ \t]*---[ \t]*)+\n?$/, '')
    .trim();

const clean = (lines: readonly string[]): string => demoteDocLinks(trimRules(lines.join('\n')));

const H1 = /^#[ \t]+(.+?)[ \t]*$/;
const H2 = /^##[ \t]+(.+?)[ \t]*$/;
const NUMBERED = /^(\d+)\.[ \t]+(.+)$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Splits the shipped user manual into addressable sections. The manual file is
 * the only source: this runs once at module load, not on every render.
 */
export const parseManual = (source: string): ManualDocument => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  let title = '';
  const introLines: string[] = [];
  const blocks: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  /** Open code fence marker (` or ~); `##` inside one is sample text, not a heading. */
  let fence: string | null = null;

  const push = (line: string): void => {
    if (current === null) introLines.push(line);
    else current.lines.push(line);
  };

  for (const line of lines) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch !== null && fenceMatch[1] !== undefined) {
      const marker = fenceMatch[1][0] ?? '`';
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      push(line);
      continue;
    }

    if (fence !== null) {
      push(line);
      continue;
    }

    if (title === '' && H1.test(line)) {
      title = H1.exec(line)?.[1] ?? '';
      continue;
    }

    const heading = H2.exec(line);
    if (heading !== null && heading[1] !== undefined) {
      current = { heading: heading[1], lines: [] };
      blocks.push(current);
      continue;
    }

    push(line);
  }

  const used = new Map<string, number>();
  const sections = blocks.map((block, index) => {
    const numbered = NUMBERED.exec(block.heading);
    const number = numbered?.[1] ?? '';
    const rawTitle = (numbered?.[2] ?? block.heading).trim();
    const base = slugify(rawTitle) === '' ? `section-${index + 1}` : slugify(rawTitle);

    // Two sections with the same title still need distinct anchors.
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;

    return {
      id,
      number,
      // The heading is rendered as UI text, not Markdown: drop inline-code ticks.
      title: rawTitle.replace(/`/g, ''),
      body: clean(block.lines),
    };
  });

  return { title, intro: clean(introLines), sections };
};
