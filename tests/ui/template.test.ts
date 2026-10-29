import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_VARIABLE_GROUPS,
  buildTemplateVariables,
  renderTemplate,
} from '../../src/ui/lib/template.js';

const business = { name: 'Acme', email: 'hi@acme.test', phone: '+1', address: 'Lane 1' };
const client = {
  name: 'Jane Doe',
  company: 'Northwind',
  email: 'jane@northwind.test',
  phone: '+2',
  website: 'northwind.test',
};

describe('renderTemplate', () => {
  it('replaces known placeholders and trims inner whitespace', () => {
    const vars = buildTemplateVariables({
      business,
      client,
      projectName: 'Redesign',
      invoice: { number: 'INV-2026-001', title: 'Deposit' },
      estimate: null,
      today: '2026-10-29',
    });

    expect(
      renderTemplate(
        '{{business.name}} / {{ client.name }} / {{project.name}} / {{invoice.number}} / {{today}}',
        vars,
      ),
    ).toBe('Acme / Jane Doe / Redesign / INV-2026-001 / 2026-10-29');
  });

  it('leaves unknown placeholders literal', () => {
    expect(
      renderTemplate('Hello {{ client.name }}, {{unknown.field}}', { 'client.name': 'Jane' }),
    ).toBe('Hello Jane, {{unknown.field}}');
  });

  it('replaces a known-but-empty value with nothing', () => {
    expect(renderTemplate('[{{client.company}}]', { 'client.company': '' })).toBe('[]');
  });

  it('omits client keys when there is no client context', () => {
    const vars = buildTemplateVariables({ business, client: null, today: '2026-10-29' });
    expect(renderTemplate('{{client.name}}', vars)).toBe('{{client.name}}');
    expect(renderTemplate('{{business.name}}', vars)).toBe('Acme');
  });

  it('does not touch text without placeholders', () => {
    expect(renderTemplate('Plain text', {})).toBe('Plain text');
  });
});

describe('variable reference', () => {
  it('documents exactly the placeholders the renderer can fill', () => {
    const variables = buildTemplateVariables({
      business,
      client,
      projectName: 'Redesign',
      invoice: { number: 'INV-2026-001', title: 'Deposit' },
      estimate: { number: 'EST-2026-001', title: 'Scope' },
      today: '2026-10-29',
    });

    const documented = TEMPLATE_VARIABLE_GROUPS.flatMap((group) =>
      group.variables.map((variable) => variable.token),
    );

    expect([...documented].sort()).toEqual(Object.keys(variables).sort());
    expect(new Set(documented).size).toBe(documented.length);
  });

  it('labels the company and client groups first', () => {
    expect(TEMPLATE_VARIABLE_GROUPS.slice(0, 2).map((group) => group.label)).toEqual([
      'Company',
      'Client',
    ]);
  });
});
