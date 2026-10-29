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

export interface TemplateVariable {
  readonly token: string;
  readonly description: string;
}

export interface TemplateVariableGroup {
  readonly label: string;
  readonly note?: string;
  readonly variables: readonly TemplateVariable[];
}

/**
 * The documented placeholder surface, shown in the editor's reference panel.
 * `buildTemplateVariables` is the runtime source of truth; a test asserts the
 * two agree so the panel cannot drift from what the renderer fills.
 */
export const TEMPLATE_VARIABLE_GROUPS: readonly TemplateVariableGroup[] = [
  {
    label: 'Company',
    note: 'From business settings.',
    variables: [
      { token: 'business.name', description: 'Trading name' },
      { token: 'business.email', description: 'Contact email' },
      { token: 'business.phone', description: 'Phone number' },
      { token: 'business.address', description: 'Postal address' },
    ],
  },
  {
    label: 'Client',
    note: 'Filled from the client on this document.',
    variables: [
      { token: 'client.name', description: 'Full name' },
      { token: 'client.company', description: 'Company' },
      { token: 'client.email', description: 'Email' },
      { token: 'client.phone', description: 'Phone' },
      { token: 'client.website', description: 'Website' },
    ],
  },
  {
    label: 'Project',
    note: 'Only when the document is attached to an invoice or estimate.',
    variables: [{ token: 'project.name', description: 'Project name' }],
  },
  {
    label: 'Billing',
    note: 'Only when the document is attached to an invoice or estimate.',
    variables: [
      { token: 'invoice.number', description: 'Invoice number' },
      { token: 'invoice.title', description: 'Invoice title' },
      { token: 'estimate.number', description: 'Estimate number' },
      { token: 'estimate.title', description: 'Estimate title' },
    ],
  },
  {
    label: 'Date',
    variables: [{ token: 'today', description: 'Today, YYYY-MM-DD' }],
  },
];

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replaces `{{key}}` with a known value. Unknown placeholders are left exactly
 * as written — a template is never rewritten or guessed at.
 */
export const renderTemplate = (text: string, variables: Readonly<Record<string, string>>): string =>
  text.replace(PLACEHOLDER, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? (variables[key] ?? '') : match,
  );
