import { useState } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { GitDialog } from '@/components/git-dialog';
import type { GitStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';

type BadgeState = 'loading' | 'no-repo' | 'syncing' | 'error' | 'dirty' | 'unpushed' | 'clean';

const stateOf = (git: GitStatus | null): BadgeState => {
  if (git === null) return 'loading';
  if (!git.initialized || git.repoOutsideWorkspace) return 'no-repo';
  if (git.syncState === 'running') return 'syncing';
  if (git.error !== null || git.conflict) return 'error';
  if (git.dirty) return 'dirty';
  if (git.unpushed) return 'unpushed';
  return 'clean';
};

const labelOf = (state: BadgeState, git: GitStatus | null): string => {
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

const DOT: Readonly<Record<BadgeState, string>> = {
  loading: 'bg-muted-foreground/30',
  'no-repo': 'bg-muted-foreground/30',
  syncing: 'bg-muted-foreground/50',
  error: 'bg-destructive',
  dirty: 'bg-accent ring-1 ring-accent-foreground/30',
  unpushed: 'bg-foreground',
  clean: 'bg-muted-foreground/40',
};

export const GitBadge = () => {
  const { git } = useWorkspace();
  const [open, setOpen] = useState(false);
  const state = stateOf(git);
  const label = labelOf(state, git);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Git status: ${label}`}
        className="gap-2"
      >
        {state === 'loading' || state === 'syncing' ? (
          <Spinner />
        ) : state === 'no-repo' ? (
          <GitBranchIcon aria-hidden />
        ) : (
          <span aria-hidden className={cn('size-2 rounded-full', DOT[state])} />
        )}
        <span className="hidden max-w-40 truncate sm:inline">{label}</span>
      </Button>

      <GitDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
