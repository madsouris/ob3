import { useState } from 'react';
import { CalendarDaysIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { dateToIso, isoToDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

export interface DateFieldProps {
  readonly id: string;
  /** `YYYY-MM-DD`, or empty for "not set". */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

const EARLIEST = new Date(1990, 0, 1);
const LATEST = new Date(2100, 11, 31);

/** Date-only field backed by the shadcn calendar (no native browser picker). */
export const DateField = ({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
}: DateFieldProps) => {
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start gap-2 font-normal',
            value === '' && 'text-muted-foreground',
          )}
        >
          <CalendarDaysIcon data-icon="inline-start" />
          <span className="truncate">{value === '' ? placeholder : formatDate(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? new Date()}
          startMonth={EARLIEST}
          endMonth={LATEST}
          captionLayout="dropdown"
          autoFocus
          onSelect={(date) => {
            if (date === undefined) return;
            onChange(dateToIso(date));
            setOpen(false);
          }}
        />
        {value === '' ? null : (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
