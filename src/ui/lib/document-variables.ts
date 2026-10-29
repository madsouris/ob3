import type { ApiRecordOf } from '@/lib/api';
import { recordTitle } from '@/lib/workspace';
import type { ObConfig } from '../../workspace/config.js';
import { buildTemplateVariables } from '@/lib/template';

export interface TemplateContextInput {
  readonly config: ObConfig | null;
  readonly client: ApiRecordOf<'contact'> | null;
  readonly project?: ApiRecordOf<'project'> | null;
  readonly invoice?: ApiRecordOf<'invoice'> | null;
  readonly estimate?: ApiRecordOf<'estimate'> | null;
  readonly today?: string;
}

/**
 * Builds the flat placeholder map from the live records. Global documents
 * viewed without a client leave `{{client.*}}` visible instead of guessing.
 */
export const templateVariablesFor = (input: TemplateContextInput): Record<string, string> => {
  const client =
    input.client === null
      ? null
      : {
          name: recordTitle(input.client),
          company: input.client.company,
          email: input.client.email,
          phone: input.client.phone_number,
          website: input.client.website,
        };

  return buildTemplateVariables({
    business: {
      name: input.config?.business.name ?? '',
      email: input.config?.business.email ?? '',
      phone: input.config?.business.phone ?? '',
      address: input.config?.business.address ?? '',
    },
    client,
    today: input.today ?? new Date().toISOString().slice(0, 10),
    ...(input.project === null || input.project === undefined
      ? {}
      : { projectName: recordTitle(input.project) }),
    invoice:
      input.invoice === null || input.invoice === undefined
        ? null
        : { number: input.invoice.invoice_number, title: input.invoice.title },
    estimate:
      input.estimate === null || input.estimate === undefined
        ? null
        : { number: input.estimate.estimate_number, title: input.estimate.title },
  });
};
