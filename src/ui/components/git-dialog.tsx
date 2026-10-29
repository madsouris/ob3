import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CheckCircle2Icon,
  GitBranchIcon,
  MinusIcon,
  RefreshCwIcon,
  UploadIcon,
  XCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { GitStep } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

const StatusRow = ({ label, value }: { readonly label: string; readonly value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 truncate text-right font-mono text-xs">{value}</span>
  </div>
);

const StepRow = ({ step }: { readonly step: GitStep }) => (
  <div className="flex items-center gap-2 text-xs">
    {step.skipped === true ? (
      <MinusIcon aria-hidden className="text-muted-foreground" />
    ) : step.ok ? (
      <CheckCircle2Icon aria-hidden className="text-muted-foreground" />
    ) : (
      <XCircleIcon aria-hidden className="text-destructive" />
    )}
    <span className="font-mono">git {step.name}</span>
    <span className="truncate text-muted-foreground">
      {step.skipped === true ? 'nothing to do' : step.ok ? 'ok' : 'failed'}
    </span>
  </div>
);

export interface GitDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const GitDialog = ({ open, onOpenChange }: GitDialogProps) => {
  const { git, gitSteps, refreshGit, syncNow, initGit, recoverGit, setGitRemote } = useWorkspace();
  const [remoteUrl, setRemoteUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setRemoteUrl(git?.remote ?? '');
  }, [open, git?.remote]);

  const syncing = git?.syncState === 'running' || busy === 'sync';

  const runInit = async (): Promise<void> => {
    setBusy('init');
    try {
      const report = await initGit();
      if (report.ok) {
        toast.success('Git initialized with an initial commit');
        if (report.warning !== null) toast.warning(report.warning);
      } else {
        toast.error(report.error?.message ?? 'Could not initialize git');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not initialize git');
    } finally {
      setBusy(null);
    }
  };

  const runSync = async (): Promise<void> => {
    setBusy('sync');
    try {
      const report = await syncNow();
      if (report.ok) toast.success('Synced with the remote');
      else toast.error(report.error?.message ?? 'Sync failed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  };

  const runRecovery = async (action: 'abort-sync' | 'set-upstream'): Promise<void> => {
    setBusy(action);
    try {
      const report = await recoverGit(action);
      if (report.ok) {
        toast.success(action === 'abort-sync' ? 'Rebase aborted' : 'Upstream set and pushed');
      } else {
        toast.error(report.error?.message ?? 'Recovery failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Recovery failed');
    } finally {
      setBusy(null);
    }
  };

  const saveRemote = async (push: boolean): Promise<void> => {
    setBusy(push ? 'remote-push' : 'remote');
    try {
      const report = await setGitRemote(remoteUrl, push);
      if (report.ok) toast.success(push ? 'Remote saved and pushed' : 'Remote saved');
      else toast.error(report.error?.message ?? 'Could not save the remote');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the remote');
    } finally {
      setBusy(null);
    }
  };

  const initialized = git?.initialized === true && git.repoOutsideWorkspace !== true;
  const canSync = initialized && !syncing && busy === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranchIcon aria-hidden />
            Git
          </DialogTitle>
          <DialogDescription>
            Saves are committed locally. Sync pulls, then pushes to your remote.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {git === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Checking the repository…
            </div>
          ) : null}

          {git !== null && !git.initialized ? (
            <Alert>
              <GitBranchIcon aria-hidden />
              <AlertTitle>Git is not initialized</AlertTitle>
              <AlertDescription>
                Saves still work; they stay local until a repository exists.
              </AlertDescription>
            </Alert>
          ) : null}

          {git?.repoOutsideWorkspace === true ? (
            <Alert variant="destructive">
              <AlertTitle>This workspace is inside another repository</AlertTitle>
              <AlertDescription>
                ob refuses to add files to a parent repository. Give the workspace its own repo, or
                run <code className="font-mono">ob sync --allow-parent-repo</code> in a terminal.
              </AlertDescription>
            </Alert>
          ) : null}

          {git?.detached === true ? (
            <Alert variant="destructive">
              <AlertTitle>Detached HEAD</AlertTitle>
              <AlertDescription>
                Check out a branch before syncing:{' '}
                <code className="font-mono">git switch -c main</code>
              </AlertDescription>
            </Alert>
          ) : null}

          {git !== null && git.initialized && !git.repoOutsideWorkspace ? (
            <div className="flex flex-col gap-2">
              <StatusRow label="Branch" value={git.branch === '' ? 'detached' : git.branch} />
              <StatusRow label="Remote" value={git.remote === '' ? 'not set' : git.remote} />
              <StatusRow
                label="Upstream"
                value={
                  git.hasUpstream
                    ? `${git.ahead} to push · ${git.behind} to pull`
                    : 'not configured'
                }
              />
              <StatusRow label="Changed files" value={String(git.changedFiles)} />
              <StatusRow
                label="Last commit"
                value={git.lastCommit === '' ? 'none' : git.lastCommit.replace(/\t/g, ' · ')}
              />
            </div>
          ) : null}

          {git?.error != null ? (
            <>
              <Separator />
              <Alert variant="destructive">
                <AlertTitle className="font-mono text-xs">{git.error.code}</AlertTitle>
                <AlertDescription>{git.error.message}</AlertDescription>
              </Alert>
              {git.error.output === undefined || git.error.output === '' ? null : (
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
                  {git.error.output}
                </pre>
              )}
              {git.conflictPaths.length === 0 ? null : (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Conflicted files</span>
                  <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
                    {git.conflictPaths.map((path) => (
                      <li key={path} className="truncate">
                        {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}

          {git?.conflict === true || git?.error?.code === 'rebase_conflict' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void runRecovery('abort-sync')}
            >
              {busy === 'abort-sync' ? <Spinner data-icon="inline-start" /> : null}
              Abort sync
            </Button>
          ) : null}

          {git?.error?.code === 'no_upstream' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void runRecovery('set-upstream')}
            >
              {busy === 'set-upstream' ? <Spinner data-icon="inline-start" /> : null}
              <UploadIcon data-icon="inline-start" />
              Set upstream & push
            </Button>
          ) : null}

          {gitSteps.length === 0 ? null : (
            <>
              <Separator />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Last sync</span>
                {gitSteps.map((step, index) => (
                  <StepRow key={`${step.name}-${index}`} step={step} />
                ))}
              </div>
            </>
          )}

          {initialized ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Remote</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={remoteUrl}
                    onChange={(event) => setRemoteUrl(event.target.value)}
                    placeholder="git@github.com:you/crm.git"
                    aria-label="Git remote URL"
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void saveRemote(false)}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void saveRemote(true)}
                    >
                      Save & push
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Point this at an existing empty repository. ob never creates one for you.
                </p>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void refreshGit(true)}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>

          <div className="flex items-center gap-2">
            {git !== null && !git.initialized ? (
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void runInit()}
              >
                {busy === 'init' ? <Spinner data-icon="inline-start" /> : null}
                Initialize git
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={!canSync} onClick={() => void runSync()}>
                {syncing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <UploadIcon data-icon="inline-start" />
                )}
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
