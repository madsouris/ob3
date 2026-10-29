import type { ReactNode } from 'react';

/**
 * Horizontal gutter for sheet content. `SheetHeader`/`SheetFooter` carry their
 * own `p-4`; fields between them need the same left/right inset.
 */
export const SheetBody = ({ children }: { readonly children: ReactNode }) => (
  <div className="flex flex-col gap-5 px-4">{children}</div>
);
