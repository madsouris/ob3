import { useState } from 'react';
import { CheckCircle2Icon, EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import type { IssuePreview } from '@/lib/api';
import type { Issue } from '../../model/issue.js';
import { useWorkspace } from '@/lib/workspace';

type ResolvableAction = 'assign-id' | 'adopt-path' | 'ignore';

const SEVERITY_VARIANT = { error: 'destructive', warning: 'secondary' } as const;

export const Issues = () => {
  const { issues, refresh } = useWorkspace();
  const [preview, setPreview] = useState<IssuePreview | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const openPreview = async (issue: Issue): Promise<void> => {
    setBusy(issue.key);
    try {
      const payload = await api.previewIssue(issue.key);
      setPreview(payload);
      setPreviewPath(issue.path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the file');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (
    issue: Issue,
    action: ResolvableAction,
    to?: 'todo' | 'doing' | 'done',
  ): Promise<void> => {
    setBusy(issue.key);
    try {
      await api.resolveIssue(issue.key, to === undefined ? { action } : { action, to });
      await refresh();
      toast.success(
        action === 'ignore'
          ? 'Issue hidden for this machine'
          : action === 'assign-id'
            ? 'Id assigned and file saved'
            : 'Task moved into a column',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not resolve the issue');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Needs attention"
        description="Files ob could not read cleanly. Nothing here is repaired or deleted automatically."
      />

      {issues.length === 0 ? (
        <EmptyState
          icon={CheckCircle2Icon}
          title="Nothing needs attention"
          description="Every record parsed and every reference resolves. If you edit a file outside ob and break it, it will appear here."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Severity</TableHead>
                <TableHead className="w-40">Issue</TableHead>
                <TableHead>File and message</TableHead>
                <TableHead className="w-64 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.key}>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[issue.severity]}>{issue.severity}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{issue.code}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {issue.path}
                      </span>
                      <span className="text-sm">{issue.message}</span>
                      {issue.detail === undefined ? null : (
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {issue.detail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy === issue.key}
                        onClick={() => void openPreview(issue)}
                      >
                        <EyeIcon data-icon="inline-start" />
                        Preview
                      </Button>
                      {issue.actions.includes('assign-id') ? (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={busy === issue.key}
                          onClick={() => void resolve(issue, 'assign-id')}
                        >
                          Assign id
                        </Button>
                      ) : null}
                      {issue.actions.includes('adopt-path') ? (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={busy === issue.key}
                          onClick={() => void resolve(issue, 'adopt-path', 'todo')}
                        >
                          Move to To do
                        </Button>
                      ) : null}
                      {issue.actions.includes('ignore') ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={busy === issue.key}
                          onClick={() => void resolve(issue, 'ignore')}
                        >
                          Ignore
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(next) => (next ? undefined : setPreview(null))}>
        <DialogContent className="max-h-[85vh] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{previewPath ?? ''}</DialogTitle>
            <DialogDescription>
              Read-only. Edit the file in your editor to fix it; ob never rewrites it here.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border">
            <pre className="p-3 font-mono text-xs whitespace-pre-wrap">
              {preview?.raw ??
                `The file could not be read${
                  preview?.reason === undefined ? '.' : `: ${preview.reason}.`
                }`}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
