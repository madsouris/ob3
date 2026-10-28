import { useDeferredValue, useEffect, useState, useTransition } from 'react';
import {
  FileTextIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import type { ApiRecord, RecordType } from '@/lib/api';
import { PLURAL, api } from '@/lib/api';
import { navigate } from '@/lib/router';
import { recordTitle } from '@/lib/workspace';

const NAV_ITEMS: ReadonlyArray<{ label: string; view: string; icon: typeof UsersIcon }> = [
  { label: 'Dashboard', view: 'dashboard', icon: LayoutDashboardIcon },
  { label: 'Contacts', view: 'contacts', icon: UsersIcon },
  { label: 'Projects', view: 'projects', icon: FolderIcon },
  { label: 'Tasks', view: 'tasks', icon: ListTodoIcon },
  { label: 'Estimates', view: 'estimates', icon: FileTextIcon },
  { label: 'Invoices', view: 'invoices', icon: ReceiptIcon },
  { label: 'Documents', view: 'documents', icon: FileTextIcon },
  { label: 'Needs attention', view: 'issues', icon: TriangleAlertIcon },
  { label: 'Settings', view: 'settings', icon: SettingsIcon },
];

const TYPE_LABEL: Readonly<Record<RecordType, string>> = {
  contact: 'Contacts',
  project: 'Projects',
  task: 'Tasks',
  estimate: 'Estimates',
  invoice: 'Invoices',
  document: 'Documents',
};

const SEARCH_TYPES: readonly RecordType[] = [
  'contact',
  'project',
  'task',
  'estimate',
  'invoice',
  'document',
];

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<readonly ApiRecord[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const needle = deferredQuery.trim();
    if (needle.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all(
        SEARCH_TYPES.map((type) => api.list(PLURAL[type], `q=${encodeURIComponent(needle)}`)),
      )
        .then((lists) => {
          if (cancelled) return;
          startTransition(() => {
            setResults(lists.flatMap((list) => list.records).slice(0, 12));
          });
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredQuery]);

  const go = (path: string): void => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search and navigate"
      description="Find a record or jump to a view"
    >
      <CommandInput
        placeholder="Search records or jump to…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isPending ? 'Searching…' : 'No matches. Try a client name, company or invoice number.'}
        </CommandEmpty>

        {query.trim().length < 2 ? null : (
          <CommandGroup heading="Records">
            {results.map((record) => (
              <CommandItem
                key={record.id}
                value={`${record.id} ${recordTitle(record)}`}
                onSelect={() => go(`${PLURAL[record.type]}/${record.id}`)}
              >
                <SearchIcon aria-hidden />
                <span className="truncate">{recordTitle(record)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {TYPE_LABEL[record.type]}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.view} value={`go ${item.label}`} onSelect={() => go(item.view)}>
              <item.icon aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
