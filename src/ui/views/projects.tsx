import { useState } from 'react';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProjectEditor } from '@/components/project-editor';
import { StatusBadge } from '@/components/status-badge';
import { SortableHead, TableControls } from '@/components/table-controls';
import type { SortOption } from '@/components/table-controls';
import type { ApiRecordOf } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { navigate } from '@/lib/router';
import { matchesQuery, sortRows, useTableControls } from '@/lib/table';
import { recordTitle, useWorkspace } from '@/lib/workspace';

type ProjectSort = 'project' | 'client' | 'status' | 'tasks' | 'updated';

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'project', label: 'Project' },
  { value: 'client', label: 'Client' },
  { value: 'status', label: 'Status' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'updated', label: 'Updated' },
];

/** Lifecycle order, not the alphabet. Unknown values sort last. */
const STATUS_RANK: Readonly<Record<string, number>> = {
  active: 0,
  completed: 1,
  archived: 2,
};

export const Projects = () => {
  const { records } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const controls = useTableControls<ProjectSort>('project', { updated: 'desc' });
  const clients = new Map(
    records.contact.map((contact) => [contact.id, recordTitle(contact)] as const),
  );

  const taskCounts = new Map<string, number>();
  for (const task of records.task) {
    if (task.type !== 'task') continue;
    taskCounts.set(task.project_id, (taskCounts.get(task.project_id) ?? 0) + 1);
  }

  const all = records.project.filter(
    (record): record is ApiRecordOf<'project'> => record.type === 'project',
  );
  const compare = (left: ApiRecordOf<'project'>, right: ApiRecordOf<'project'>): number => {
    switch (controls.field) {
      case 'project':
        return recordTitle(left).localeCompare(recordTitle(right), undefined, {
          sensitivity: 'base',
        });
      case 'client':
        return (clients.get(left.client_id) ?? '').localeCompare(
          clients.get(right.client_id) ?? '',
          undefined,
          { sensitivity: 'base' },
        );
      case 'status':
        return (STATUS_RANK[left.status] ?? 9) - (STATUS_RANK[right.status] ?? 9);
      case 'tasks':
        return (taskCounts.get(left.id) ?? 0) - (taskCounts.get(right.id) ?? 0);
      case 'updated':
        return left.updated_at.localeCompare(right.updated_at);
    }
  };

  const rows = sortRows(
    all.filter((project) =>
      matchesQuery(controls.query, [recordTitle(project), clients.get(project.client_id) ?? '']),
    ),
    compare,
    controls.direction,
  );
  const filtering = controls.query.trim() !== '';

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

      {all.length === 0 ? (
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
        <div className="flex flex-col gap-3">
          <TableControls
            search={{
              value: controls.query,
              onChange: controls.setQuery,
              label: 'Search projects',
              placeholder: 'Search project or client',
              ...(filtering ? { count: `${rows.length} of ${all.length}` } : {}),
            }}
            sortOptions={SORT_OPTIONS}
            sortField={controls.field}
            onSortField={(value) => {
              if (
                value === 'project' ||
                value === 'client' ||
                value === 'status' ||
                value === 'tasks' ||
                value === 'updated'
              ) {
                controls.selectField(value);
              }
            }}
            direction={controls.direction}
            onToggleDirection={controls.toggleDirection}
          />

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Project"
                    active={controls.field === 'project'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('project')}
                  />
                  <SortableHead
                    label="Client"
                    className="hidden md:table-cell"
                    active={controls.field === 'client'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('client')}
                  />
                  <SortableHead
                    label="Status"
                    active={controls.field === 'status'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('status')}
                  />
                  <SortableHead
                    label="Tasks"
                    className="tabular hidden sm:table-cell"
                    active={controls.field === 'tasks'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('tasks')}
                  />
                  <SortableHead
                    label="Updated"
                    className="hidden lg:table-cell"
                    active={controls.field === 'updated'}
                    direction={controls.direction}
                    onSort={() => controls.selectField('updated')}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No projects match “{controls.query.trim()}”.
                      <Button
                        variant="link"
                        size="sm"
                        className="ml-1 h-auto px-0"
                        onClick={() => controls.setQuery('')}
                      >
                        Clear search
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((project) => (
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
                        {taskCounts.get(project.id) ?? 0}
                      </TableCell>
                      <TableCell className="tabular hidden text-xs text-muted-foreground lg:table-cell">
                        {formatDate(project.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ProjectEditor projectId={null} open={creating} onOpenChange={setCreating} />
    </div>
  );
};
