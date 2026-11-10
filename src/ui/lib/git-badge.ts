import type { GitStatus } from '@/lib/api';

export type GitBadgeState =
  'loading' | 'no-repo' | 'syncing' | 'error' | 'dirty' | 'unpushed' | 'clean';

/** The header badge reuses the button variants; `warning` is the yellow no-repo state. */
export type GitBadgeVariant = 'outline' | 'destructive' | 'warning';

export const badgeStateOf = (git: GitStatus | null): GitBadgeState => {
  if (git === null) return 'loading';
  if (!git.initialized || git.repoOutsideWorkspace) return 'no-repo';
  if (git.syncState === 'running') return 'syncing';
  if (git.error !== null || git.conflict) return 'error';
  if (git.dirty) return 'dirty';
  if (git.unpushed) return 'unpushed';
  return 'clean';
};

/**
 * Uncommitted work and git errors are red; a workspace without a repository is
 * yellow (outline-shaped); everything else stays neutral (docs/08 §Git).
 */
export const badgeVariantOf = (state: GitBadgeState): GitBadgeVariant => {
  if (state === 'dirty' || state === 'error') return 'destructive';
  if (state === 'no-repo') return 'warning';
  return 'outline';
};

export const badgeLabelOf = (state: GitBadgeState, git: GitStatus | null): string => {
  switch (state) {
    case 'loading':
      return 'Git';
    case 'no-repo':
      return 'No git';
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return 'Git error';
    case 'dirty':
      return 'Uncommitted';
    case 'unpushed':
      return `${git?.ahead ?? 0} to push`;
    case 'clean':
      return git?.branch === undefined || git.branch === '' ? 'Clean' : git.branch;
  }
};

/** Dot colour on the outlined states; the filled variants inherit the text colour. */
export const BADGE_DOT: Readonly<Record<GitBadgeState, string>> = {
  loading: 'bg-muted-foreground/30',
  'no-repo': 'bg-muted-foreground/30',
  syncing: 'bg-muted-foreground/50',
  error: 'bg-current opacity-70',
  dirty: 'bg-current opacity-70',
  unpushed: 'bg-foreground',
  clean: 'bg-muted-foreground/40',
};
