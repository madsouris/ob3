import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description === undefined ? null : (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
    </div>
    {actions === undefined ? null : <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
