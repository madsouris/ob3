import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/markdown';
import { cn } from '@/lib/utils';

export interface MarkdownFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly className?: string;
}

/** Markdown textarea with a live preview tab. The file body is always the source. */
export const MarkdownField = ({
  id,
  label,
  value,
  onChange,
  hint,
  rows = 8,
  placeholder,
  className,
}: MarkdownFieldProps) => {
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next === 'preview' ? 'preview' : 'write')}
        >
          <TabsList className="h-7" aria-label={`${label} mode`}>
            <TabsTrigger value="write" className="px-2 text-xs">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-2 text-xs">
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === 'write' ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          {...(placeholder === undefined ? {} : { placeholder })}
          className="font-mono text-xs"
        />
      ) : (
        <div className="min-h-32 rounded-md border bg-muted/20 p-3">
          <Markdown emptyText="Nothing to preview yet.">{value}</Markdown>
        </div>
      )}

      {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};
