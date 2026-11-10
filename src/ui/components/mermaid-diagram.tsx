import { useEffect, useRef, useState } from 'react';
import { mount, register } from 'pele/core';
import type { Mounted } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import { cn } from '@/lib/utils';

/** Only the flowchart grammar is registered: the manual needs no other type. */
let registered = false;
const ensureRegistered = (): void => {
  if (registered) return;
  register(flowchart);
  registered = true;
};

export interface MermaidDiagramProps {
  readonly source: string;
  readonly label?: string;
  readonly className?: string;
}

/**
 * A Mermaid fenced block rendered with Pele (Mermaid syntax, ~230 kB gzip and
 * zero dependencies versus Mermaid.js at ~1.6 MB). Rendering happens in the
 * browser because `mount` measures the diagram and adapts its layout to the
 * container width; if the source cannot be parsed, the block itself is shown
 * instead of an empty hole.
 */
export const MermaidDiagram = ({ source, label = 'Diagram', className }: MermaidDiagramProps) => {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ensureRegistered();
    const element = container.current;
    if (element === null) return;

    let mounted: Mounted | null = null;
    const fail = (): void => setFailed(true);

    try {
      mounted = mount(element, source, { onError: fail });
      if (mounted.error !== undefined && mounted.error !== null) fail();
    } catch {
      fail();
    }

    return () => {
      mounted?.destroy();
    };
  }, [source]);

  if (failed) {
    return (
      <pre className="my-3 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
        {source}
      </pre>
    );
  }

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      className={cn(
        'pele-diagram my-4 overflow-x-auto rounded-md border bg-muted/20 p-3',
        className,
      )}
    />
  );
};
