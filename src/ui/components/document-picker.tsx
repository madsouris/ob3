import { useState } from 'react';
import { CheckIcon, FileTextIcon, PlusIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ApiRecordOf } from '@/lib/api';
import { cn } from '@/lib/utils';
import { recordTitle } from '@/lib/workspace';

export interface DocumentPickerProps {
  readonly id?: string;
  readonly documents: readonly ApiRecordOf<'document'>[];
  readonly value: readonly string[];
  readonly onChange: (ids: string[]) => void;
  readonly disabled?: boolean;
}

/**
 * Multi-select for document attachments. Values are document ids (stable
 * across renames); unknown ids stay visible so a deleted file is obvious.
 */
export const DocumentPicker = ({
  id,
  documents,
  value,
  onChange,
  disabled = false,
}: DocumentPickerProps) => {
  const [open, setOpen] = useState(false);
  const byId = new Map(documents.map((document) => [document.id, document] as const));
  const sorted = [...documents].sort((left, right) =>
    recordTitle(left).localeCompare(recordTitle(right)),
  );

  const toggle = (documentId: string): void => {
    onChange(
      value.includes(documentId)
        ? value.filter((entry) => entry !== documentId)
        : [...value, documentId],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between gap-2 font-normal"
          >
            <span className="flex items-center gap-2 truncate text-muted-foreground">
              <FileTextIcon data-icon="inline-start" />
              {value.length === 0 ? 'Select documents' : `${value.length} attached`}
            </span>
            <PlusIcon data-icon="inline-end" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[min(30rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search documents…" />
            <CommandList>
              <CommandEmpty>No documents match.</CommandEmpty>
              <CommandGroup heading="Documents">
                {sorted.map((document) => {
                  const selected = value.includes(document.id);
                  return (
                    <CommandItem
                      key={document.id}
                      value={`${recordTitle(document)} ${document.path}`}
                      onSelect={() => toggle(document.id)}
                    >
                      <CheckIcon
                        aria-hidden
                        className={cn('mr-2 size-4', selected ? 'opacity-100' : 'opacity-0')}
                      />
                      <span className="truncate">{recordTitle(document)}</span>
                      <Badge variant="outline" className="ml-auto">
                        {document.scope === 'client' ? 'Client' : 'Global'}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length === 0 ? null : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((documentId) => {
            const document = byId.get(documentId);
            const label = document === undefined ? `Unknown ${documentId}` : recordTitle(document);
            return (
              <Badge
                key={documentId}
                variant={document === undefined ? 'destructive' : 'secondary'}
                className="max-w-full gap-1"
              >
                <FileTextIcon aria-hidden />
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background/60"
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                  onClick={() => toggle(documentId)}
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};
