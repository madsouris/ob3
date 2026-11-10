import { useState } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { GitDialog } from '@/components/git-dialog';
import { BADGE_DOT, badgeLabelOf, badgeStateOf, badgeVariantOf } from '@/lib/git-badge';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace';

export const GitBadge = () => {
  const { git } = useWorkspace();
  const [open, setOpen] = useState(false);
  const state = badgeStateOf(git);
  const label = badgeLabelOf(state, git);

  return (
    <>
      <Button
        variant={badgeVariantOf(state)}
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
          <span aria-hidden className={cn('size-2 rounded-full', BADGE_DOT[state])} />
        )}
        <span className="hidden max-w-40 truncate sm:inline">{label}</span>
      </Button>

      <GitDialog open={open} onOpenChange={setOpen} />
    </>
  );
};
