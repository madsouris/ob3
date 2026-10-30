import { useEffect, useRef, useState } from 'react';
import { ListIcon } from 'lucide-react';
import manualSource from '../../../docs/user-manual.md?raw';
import { Markdown } from '@/components/markdown';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { parseManual } from '@/lib/manual';
import { navigate } from '@/lib/router';
import { cn } from '@/lib/utils';

/** Parsed once: the manual is a build-time string, never data from the server. */
const MANUAL = parseManual(manualSource);
const FIRST_SECTION = MANUAL.sections[0]?.id ?? '';

const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollToSection = (id: string): void => {
  const target = document.getElementById(id);
  if (target === null) return;
  target.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
};

interface ContentsProps {
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}

const Contents = ({ activeId, onSelect }: ContentsProps) => (
  <nav aria-label="Manual sections" className="flex flex-col gap-0.5">
    {MANUAL.sections.map((section) => {
      const active = section.id === activeId;
      return (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.id)}
          aria-current={active ? 'location' : undefined}
          className={cn(
            'flex items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            active
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <span className="w-4 shrink-0 text-right text-[11px] tabular-nums">{section.number}</span>
          <span className="leading-snug">{section.title}</span>
        </button>
      );
    })}
  </nav>
);

export interface ManualProps {
  /** Section slug from `#/manual/<slug>`; null at `#/manual`. */
  readonly section: string | null;
}

/**
 * In-app user manual (Read surface). The document is the shipped
 * `docs/user-manual.md`, split into sections whose slugs are the deep-link
 * routes. Section links navigate the hash router, then scroll the `<main>`
 * container by hand: the URL hash is the router, so real `#anchor` links would
 * break navigation.
 */
export const Manual = ({ section }: ManualProps) => {
  const [activeId, setActiveId] = useState(section ?? FIRST_SECTION);
  const [contentsOpen, setContentsOpen] = useState(false);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (section !== null) scrollToSection(section);
  }, [section]);

  // Scroll spy: the last section whose top has passed the container's top edge.
  useEffect(() => {
    const container = article.current?.closest('main');
    if (!(container instanceof HTMLElement)) return;

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const top = container.getBoundingClientRect().top + 24;
      let current = FIRST_SECTION;
      for (const item of MANUAL.sections) {
        const element = document.getElementById(item.id);
        if (element !== null && element.getBoundingClientRect().top <= top) current = item.id;
      }
      setActiveId(current);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  const select = (id: string): void => {
    setContentsOpen(false);
    setActiveId(id);
    navigate(`manual/${id}`);
    scrollToSection(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="User manual"
        description="How to run a workspace, end to end. This is the same guide as docs/user-manual.md."
        actions={
          <Sheet open={contentsOpen} onOpenChange={setContentsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden">
                <ListIcon data-icon="inline-start" />
                Contents
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Contents</SheetTitle>
                <SheetDescription>{MANUAL.sections.length} sections</SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-2 pb-4">
                <Contents activeId={activeId} onSelect={select} />
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-0 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-4 pr-2">
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Contents</p>
            <Contents activeId={activeId} onSelect={select} />
          </div>
        </aside>

        <article ref={article} className="manual flex min-w-0 max-w-[68ch] flex-col gap-8">
          {MANUAL.intro === '' ? null : <Markdown>{MANUAL.intro}</Markdown>}
          {MANUAL.sections.map((item) => (
            <section
              key={item.id}
              id={item.id}
              className="scroll-mt-4 border-t border-border pt-8 first:border-t-0 first:pt-0"
            >
              <h2 className="mb-3 flex items-baseline gap-3 text-base font-semibold tracking-tight">
                {item.number === '' ? null : (
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">
                    {item.number}
                  </span>
                )}
                {item.title}
              </h2>
              <Markdown>{item.body}</Markdown>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
};
