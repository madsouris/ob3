import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { lineTotalCents, parseMoney, roundHalfUp } from '../../model/money.js';

export interface LineItemDraft {
  description: string;
  quantity: string;
  unit: string;
}

export const emptyLine = (): LineItemDraft => ({ description: '', quantity: '1', unit: '' });

export const draftsFrom = (
  lines: readonly { description: string; quantity: number; unit_price_cents: number }[],
): LineItemDraft[] =>
  lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    unit: (line.unit_price_cents / 100).toFixed(2),
  }));

export interface Totals {
  readonly lines: readonly number[];
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly taxRateBps: number;
}

/** Mirrors the server: line totals round individually, tax rounds once. */
export const computeTotals = (items: readonly LineItemDraft[], taxPercent: string): Totals => {
  const lines = items.map((item) =>
    lineTotalCents(Number(item.quantity) || 0, parseMoney(item.unit) ?? 0),
  );
  const subtotalCents = lines.reduce((sum, value) => sum + value, 0);
  const taxRateBps = Math.round((Number(taxPercent) || 0) * 100);
  const taxCents = roundHalfUp((subtotalCents * taxRateBps) / 10_000);
  return { lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, taxRateBps };
};

export interface LineItemsEditorProps {
  readonly items: readonly LineItemDraft[];
  readonly currency: string;
  readonly taxPercent: string;
  readonly onChange: (items: LineItemDraft[]) => void;
}

export const LineItemsEditor = ({
  items,
  currency,
  taxPercent,
  onChange,
}: LineItemsEditorProps) => {
  const totals = computeTotals(items, taxPercent);

  const update = (index: number, patch: Partial<LineItemDraft>): void => {
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number): void => {
    onChange(items.filter((_, position) => position !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border">
        <div className="grid min-w-[30rem] grid-cols-[1fr_5rem_7rem_7rem_2.5rem] items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit price</span>
          <span className="text-right">Total</span>
          <span />
        </div>

        {items.map((item, index) => (
          <div
            key={`line-${index}`}
            className="grid min-w-[30rem] grid-cols-[1fr_5rem_7rem_7rem_2.5rem] items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
          >
            <Input
              value={item.description}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="Description"
              aria-label={`Line ${index + 1} description`}
              className="h-8"
            />
            <Input
              value={item.quantity}
              onChange={(event) => update(index, { quantity: event.target.value })}
              inputMode="decimal"
              aria-label={`Line ${index + 1} quantity`}
              className="tabular h-8 text-right"
            />
            <Input
              value={item.unit}
              onChange={(event) => update(index, { unit: event.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Line ${index + 1} unit price`}
              className="tabular h-8 text-right"
            />
            <span className="tabular truncate text-right text-sm">
              {formatMoney(totals.lines[index] ?? 0, currency)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => remove(index)}
              aria-label={`Remove line ${index + 1}`}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </div>
        ))}

        {items.length === 0 ? (
          <p className="min-w-[30rem] px-3 py-4 text-sm text-muted-foreground">
            No line items yet.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyLine()])}
        >
          <PlusIcon data-icon="inline-start" />
          Add line
        </Button>

        <div className="flex min-w-52 flex-col gap-1 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular">{formatMoney(totals.subtotalCents, currency)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">
              Tax ({(totals.taxRateBps / 100).toFixed(2)}%)
            </span>
            <span className="tabular">{formatMoney(totals.taxCents, currency)}</span>
          </div>
          <div className="flex justify-between gap-6 border-t pt-1 font-medium">
            <span>Total</span>
            <span className="tabular">{formatMoney(totals.totalCents, currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
