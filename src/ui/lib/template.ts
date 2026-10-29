export interface TemplateBusiness {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
}

export interface TemplateClient {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
}

export interface TemplateBilling {
  readonly number: string;
  readonly title: string;
}

export interface TemplateVariablesInput {
  readonly business: TemplateBusiness;
  readonly client: TemplateClient | null;
  readonly projectName?: string;
  readonly invoice?: TemplateBilling | null;
  readonly estimate?: TemplateBilling | null;
  readonly today: string;
}

/**
 * Flat map of the supported placeholders. Missing context (no client on a
 * global document) leaves the key out, so the placeholder stays visible in the
 * preview instead of silently becoming an empty line.
 */
export const buildTemplateVariables = (input: TemplateVariablesInput): Record<string, string> => {
  const vars: Record<string, string> = {
    'business.name': input.business.name,
    'business.email': input.business.email,
    'business.phone': input.business.phone,
    'business.address': input.business.address,
    today: input.today,
  };

  if (input.client !== null) {
    vars['client.name'] = input.client.name;
    vars['client.company'] = input.client.company;
    vars['client.email'] = input.client.email;
    vars['client.phone'] = input.client.phone;
    vars['client.website'] = input.client.website;
  }

  if (input.projectName !== undefined) vars['project.name'] = input.projectName;

  if (input.invoice !== null && input.invoice !== undefined) {
    vars['invoice.number'] = input.invoice.number;
    vars['invoice.title'] = input.invoice.title;
  }

  if (input.estimate !== null && input.estimate !== undefined) {
    vars['estimate.number'] = input.estimate.number;
    vars['estimate.title'] = input.estimate.title;
  }

  return vars;
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replaces `{{key}}` with a known value. Unknown placeholders are left exactly
 * as written — a template is never rewritten or guessed at.
 */
export const renderTemplate = (text: string, variables: Readonly<Record<string, string>>): string =>
  text.replace(PLACEHOLDER, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? (variables[key] ?? '') : match,
  );
