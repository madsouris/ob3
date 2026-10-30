import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  BookOpenIcon,
  FileTextIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MenuIcon,
  MoonIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { BusinessLogo } from '@/components/business-logo';
import { CommandPalette } from '@/components/command-palette';
import { GitBadge } from '@/components/git-badge';
import { navigate, useRoute } from '@/lib/router';
import type { Route } from '@/lib/router';
import { useTheme } from '@/lib/theme';
import { useWorkspace } from '@/lib/workspace';
import { Billing } from '@/views/billing';
import { ContactDetail } from '@/views/contact-detail';
import { Contacts } from '@/views/contacts';
import { Dashboard } from '@/views/dashboard';
import { Documents } from '@/views/documents';
import { DocumentDetail } from '@/views/document-detail';
import { DocumentPrint } from '@/views/document-print';
import { Issues } from '@/views/issues';
import { Manual } from '@/views/manual';
import { PrintDocument } from '@/views/print-document';
import { ProjectWorkspace } from '@/views/project-workspace';
import { Projects } from '@/views/projects';
import { Settings } from '@/views/settings';
import { Tasks } from '@/views/tasks';

interface NavItem {
  readonly view: string;
  readonly label: string;
  readonly icon: ComponentType<{ readonly 'aria-hidden'?: boolean }>;
  readonly badge?: number;
  readonly alert?: boolean;
}

const NavButton = ({
  item,
  active,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly onNavigate: () => void;
}) => (
  <Button
    variant={active ? 'secondary' : 'ghost'}
    size="sm"
    className="w-full justify-start gap-2"
    onClick={onNavigate}
    aria-current={active ? 'page' : undefined}
  >
    <item.icon aria-hidden />
    <span className="truncate">{item.label}</span>
    {item.badge === undefined || item.badge === 0 ? null : (
      <Badge
        variant={item.alert === true ? 'destructive' : 'secondary'}
        className="ml-auto"
        aria-label={`${item.badge} items`}
      >
        {item.badge}
      </Badge>
    )}
  </Button>
);

const NotFound = ({ view }: { readonly view: string }) => (
  <Alert variant="destructive">
    <TriangleAlertIcon aria-hidden />
    <AlertTitle>Unknown view “{view}”</AlertTitle>
    <AlertDescription>
      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => navigate('dashboard')}>
        Go to the dashboard
      </Button>
    </AlertDescription>
  </Alert>
);

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const LoadingState = () => (
  <div className="flex flex-col gap-4">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-4 w-96" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-28 w-full" />
      ))}
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

const renderView = (route: Route): ReactNode => {
  switch (route.view) {
    case 'dashboard':
      return <Dashboard />;
    case 'contacts':
      return route.id === null ? <Contacts /> : <ContactDetail contactId={route.id} />;
    case 'projects':
      return route.id === null ? <Projects /> : <ProjectWorkspace projectId={route.id} />;
    case 'tasks':
      return <Tasks initialId={route.id} />;
    case 'estimates':
      return <Billing type="estimate" initialId={route.id} />;
    case 'invoices':
      return <Billing type="invoice" initialId={route.id} />;
    case 'documents':
      return route.id === null ? <Documents /> : <DocumentDetail documentId={route.id} />;
    case 'settings':
      return <Settings />;
    case 'issues':
      return <Issues />;
    case 'manual':
      return <Manual section={route.id} />;
    default:
      return <NotFound view={route.view} />;
  }
};

/** Print routes render without the app shell. */
const printTarget = (route: Route): 'invoice' | 'estimate' | null => {
  if (route.section !== 'print' || route.id === null) return null;
  if (route.view === 'invoices') return 'invoice';
  if (route.view === 'estimates') return 'estimate';
  return null;
};

const isDocumentPrint = (route: Route): boolean =>
  route.view === 'documents' && route.section === 'print' && route.id !== null;

export const App = () => {
  const route = useRoute();
  const { records, issues, config, loading, error } = useWorkspace();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const workspaceName =
    config?.business.name === undefined || config.business.name === ''
      ? 'Untitled workspace'
      : config.business.name;
  const printable = printTarget(route);

  const nav: readonly NavItem[] = [
    { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
    { view: 'contacts', label: 'Contacts', icon: UsersIcon, badge: records.contact.length },
    { view: 'projects', label: 'Projects', icon: FolderIcon, badge: records.project.length },
    {
      view: 'tasks',
      label: 'All tasks',
      icon: ListTodoIcon,
      badge: records.task.filter((task) => task.status !== 'done').length,
    },
    { view: 'estimates', label: 'Estimates', icon: FileTextIcon, badge: records.estimate.length },
    { view: 'invoices', label: 'Invoices', icon: ReceiptIcon, badge: records.invoice.length },
    { view: 'documents', label: 'Documents', icon: FileTextIcon, badge: records.document.length },
    {
      view: 'issues',
      label: 'Needs attention',
      icon: TriangleAlertIcon,
      badge: issues.length,
      alert: true,
    },
    { view: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  useEffect(() => {
    document.title = `ob — ${workspaceName}`;
  }, [workspaceName]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      // Shift+D toggles the theme. It must not fire while typing an uppercase D.
      if (
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'd' &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const navList = (onNavigate?: () => void): ReactNode => (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {nav.map((item) => (
        <NavButton
          key={item.view}
          item={item}
          active={route.view === item.view}
          onNavigate={() => {
            navigate(item.view);
            onNavigate?.();
          }}
        />
      ))}
    </nav>
  );

  if (isDocumentPrint(route) && route.id !== null) {
    return <DocumentPrint documentId={route.id} />;
  }

  if (printable !== null && route.id !== null) {
    return <PrintDocument type={printable} id={route.id} />;
  }

  const totalRecords =
    records.contact.length +
    records.project.length +
    records.task.length +
    records.estimate.length +
    records.invoice.length +
    records.document.length;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BusinessLogo
            name={workspaceName}
            logo={config?.business.logo ?? ''}
            className="size-7 rounded-md border bg-muted/30 p-0.5"
          />
          <span className="truncate text-sm font-medium">{workspaceName}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{navList()}</div>
        <div className="border-t px-3 py-3">
          <Button
            variant={route.view === 'manual' ? 'secondary' : 'ghost'}
            size="sm"
            className="mb-2 w-full justify-start gap-2"
            onClick={() => navigate('manual')}
            aria-current={route.view === 'manual' ? 'page' : undefined}
          >
            <BookOpenIcon aria-hidden />
            User manual
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {totalRecords} records in {records.contact.length === 0 ? 'an empty' : 'this'} workspace.
            Files are the database.
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">ob</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle className="truncate">{workspaceName}</SheetTitle>
                <SheetDescription className="font-mono">ob</SheetDescription>
              </SheetHeader>
              <div className="p-2">
                {navList()}
                <div className="mt-2 border-t pt-2">
                  <Button
                    variant={route.view === 'manual' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => navigate('manual')}
                    aria-current={route.view === 'manual' ? 'page' : undefined}
                  >
                    <BookOpenIcon aria-hidden />
                    User manual
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden min-w-0 flex-col md:flex">
            <span className="truncate text-sm font-medium">{workspaceName}</span>
            <span className="text-[11px] text-muted-foreground">
              {totalRecords} records · local only
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <GitBadge />
            <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
              <SearchIcon data-icon="inline-start" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="ml-1 rounded border px-1 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              title="Toggle theme (Shift+D)"
              aria-label={
                theme === 'dark' ? 'Switch to light theme (Shift+D)' : 'Switch to dark theme (Shift+D)'
              }
            >
              {theme === 'dark' ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
            {error === null ? null : (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden />
                <AlertTitle>Cannot reach the workspace</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {loading && config === null ? <LoadingState /> : renderView(route)}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
};
