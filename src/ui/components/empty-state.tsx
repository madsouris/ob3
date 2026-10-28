import type { ComponentType, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface EmptyStateProps {
  readonly icon: ComponentType<{ readonly className?: string; readonly 'aria-hidden'?: boolean }>;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <Card className="border-dashed bg-transparent shadow-none">
    <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </CardContent>
  </Card>
);
