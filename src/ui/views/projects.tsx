import { useState } from 'react';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProjectEditor } from '@/components/project-editor';
import { StatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { recordTitle, useWorkspace } from '@/lib/workspace';

export const Projects = () => {
  const { records } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  const taskCount = (projectId: string): number =>
    records.task.filter((task) => task.project_id === projectId).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Pick a project to see its board. Each row is a file in projects/."
        actions={
          <Button onClick={() => setCreating(true)} size="sm">
            <PlusIcon data-icon="inline-start" />
            New project
          </Button>
        }
      />

      {records.project.length === 0 ? (
        <EmptyState
          icon={FolderIcon}
          title="No projects yet"
          description="Create a project to group tasks, estimates and invoices around one engagement."
          action={
            <Button onClick={() => setCreating(true)} size="sm">
              <PlusIcon data-icon="inline-start" />
              New project
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="tabular hidden sm:table-cell">Tasks</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.project.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`projects/${project.id}`)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`projects/${project.id}`);
                      }}
                    >
                      {recordTitle(project)}
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {clients.get(project.client_id) ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="tabular hidden sm:table-cell">
                    {taskCount(project.id)}
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground lg:table-cell">
                    {formatDate(project.updated_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectEditor projectId={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
};
