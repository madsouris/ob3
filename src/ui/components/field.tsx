import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly hint?: string;
  readonly children: ReactNode;
}

/** A labelled control row. `FieldGroup` from the registry is not installed in this build. */
export const Field = ({ label, htmlFor, hint, children }: FieldProps) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const FieldGrid = ({ children }: { readonly children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2">{children}</div>
);
