/** Filename slugs are a human convenience; the frontmatter `id` is identity (ADR-05). */
export const slugify = (input: string, maxLength = 60): string => {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (base === '') return 'untitled';
  return base.slice(0, maxLength).replace(/-+$/g, '') || 'untitled';
};

/** `{prefix}_{slug}.md` — used at creation time only. */
export const recordFileName = (prefix: string, title: string): string => `${prefix}_${slugify(title)}.md`;
