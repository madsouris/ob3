import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { TemplateVariableGroup } from '@/lib/template';

export interface VariableReferenceProps {
  readonly groups: readonly TemplateVariableGroup[];
  readonly className?: string;
}

/**
 * Collapsed-by-default cheat sheet for `{{placeholders}}`, rendered under a
 * Markdown editor that supports them. The list comes from `template.ts`, so it
 * cannot drift from the renderer (docs/13).
 */
export const VariableReference = ({ groups, className }: VariableReferenceProps) => (
  <Accordion type="single" collapsible className={className}>
    <AccordionItem value="variables" className="rounded-md border px-3">
      <AccordionTrigger className="py-2 text-xs hover:no-underline">
        Variable references
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="text-xs font-medium">{group.label}</p>
              {group.note === undefined ? null : (
                <p className="text-xs text-muted-foreground">{group.note}</p>
              )}
              <dl className="flex flex-col gap-1">
                {group.variables.map((variable) => (
                  <div
                    key={variable.token}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                  >
                    <dt className="font-mono text-[11px]">{`{{${variable.token}}}`}</dt>
                    <dd className="text-xs text-muted-foreground">{variable.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);
