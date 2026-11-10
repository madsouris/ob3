import { expect, test } from '@playwright/test';

/**
 * Smoke flow over the shipped bundle: the dashboard, a bill's preview page and
 * A4 print, and the document composer. Selectors use roles and labels, so a
 * rename in the UI fails loudly here instead of silently degrading the test.
 */

test('dashboard renders the seeded workspace with local dates', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Acme Digital Studio' })).toBeVisible();
  await expect(page.getByText('This month')).toBeVisible();
  await expect(page.getByText('Workspace is consistent')).toBeVisible();

  // Dates are rendered dd/MM/yyyy in the local calendar.
  await expect(page.locator('body')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
});

test('a bill opens as a preview, and print renders the A4 sheet', async ({ page }) => {
  await page.goto('/#/invoices');

  await page.getByRole('button', { name: 'INV-2026-001' }).first().click();

  // Preview first: the sheet is visible and no form is open.
  await expect(page.locator('.print-sheet--preview')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

  // Editing opens the sheet over the preview.
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Print / PDF' }).click();
  await expect(page).toHaveURL(/\/print$/);
  await expect(page.locator('.print-sheet')).toBeVisible();
  await expect(page.locator('.print-sheet')).toContainText('Invoice');
});

test('billing tables search and sort', async ({ page }) => {
  await page.goto('/#/invoices');

  // Status is the last column, and the default order is issued date, newest first.
  await expect(page.getByRole('columnheader')).toHaveText([
    'Invoice',
    'Client',
    'Total',
    'Issued',
    'Status',
  ]);
  await expect(page.locator('tbody tr').first()).toContainText('INV-2026-001');

  // Search by client, then by number.
  const search = page.getByLabel('Search invoices');
  await search.fill('Priya');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('2 of 3')).toBeVisible();

  await search.fill('INV-2026-002');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Jane Doe');

  await search.fill('');
  await expect(page.locator('tbody tr')).toHaveCount(3);

  // Clicking a header sorts; clicking it again flips the direction.
  const totalHeader = page.getByRole('columnheader', { name: 'Total' });
  await expect(totalHeader).toHaveAttribute('aria-sort', 'none');
  await totalHeader.getByRole('button').click();
  await expect(totalHeader).toHaveAttribute('aria-sort', 'ascending');
  await totalHeader.getByRole('button').click();
  await expect(totalHeader).toHaveAttribute('aria-sort', 'descending');
});

test('paying an invoice moves this month’s revenue', async ({ page }) => {
  // The demo's draft invoice (the file path is the seed for the fixture id).
  await page.goto('/#/invoices/inv_01J8X7400AQ4M2N8V3R5T7W9Y0');

  await page.getByRole('button', { name: 'Mark sent' }).click();
  await expect(page.getByRole('button', { name: 'Mark paid' })).toBeVisible();

  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByText(/Paid \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);

  await page.goto('/');
  const thisMonth = page.getByText('This month').locator('..');
  await expect(thisMonth).not.toContainText('0.00');
});

test('the contacts table searches and sorts', async ({ page }) => {
  await page.goto('/#/contacts');

  const search = page.getByLabel('Search contacts');
  await search.fill('acme');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('Priya');

  await search.fill('');
  await expect(page.locator('tbody tr')).toHaveCount(2);

  const name = page.getByRole('columnheader', { name: 'Name' });
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'descending');
});

test('the projects table searches by client', async ({ page }) => {
  await page.goto('/#/projects');

  await page.getByLabel('Search projects').fill('priya');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Website Redesign');
  await expect(page.getByText('1 of 2')).toBeVisible();
});

test('the documents table searches by title', async ({ page }) => {
  await page.goto('/#/documents');

  await page.getByLabel('Search documents').fill('scope');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Website Redesign — Scope');
  await expect(page.getByText('1 of 3')).toBeVisible();
});

test('task boards search title and body, and disable moving', async ({ page }) => {
  await page.goto('/#/tasks');

  const search = page.getByLabel('Search tasks');
  await search.fill('webhook');
  await expect(page.getByText('1 of 5')).toBeVisible();
  await expect(page.getByText('Moving is disabled while filtering.')).toBeVisible();
  await expect(page.locator('section[aria-label="Doing"]')).toContainText(
    'Integrate contact form API',
  );
  await expect(page.locator('section[aria-label="To do"]')).toContainText('No match.');

  await search.fill('zzz');
  await expect(page.getByText(/No tasks match/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('section[aria-label="To do"]')).toContainText(
    'Build homepage hero component',
  );
});

test('the manual renders the workflow diagram', async ({ page }) => {
  await page.goto('/#/manual/a-five-minute-tour');

  const diagram = page.locator('.pele-diagram svg.pele');
  await expect(diagram).toBeVisible();
  await expect(page.locator('.pele-diagram')).toContainText('Client page');
  await expect(page.locator('.pele-diagram')).toContainText('Invoice');
});

test('the git badge warns when the workspace has no repository', async ({ page }) => {
  await page.goto('/');

  const badge = page.getByRole('button', { name: 'Git status: No git' });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-variant', 'warning');

  await badge.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Git is not initialized');

  // Long status values must ellipsize instead of widening the dialog.
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Kept last: this test creates a document, so the document-list assertions above
// must see only the seeded three.
test('the document composer writes, previews and saves', async ({ page }) => {
  await page.goto('/#/documents');
  await page.getByRole('button', { name: 'New document' }).first().click();
  await expect(page).toHaveURL(/#\/documents\/new$/);

  await page.getByLabel('Document title').fill('E2E scope');
  await page.getByLabel('Document body').fill('## Scope\n\nA short engagement.');
  await page.getByRole('radio', { name: 'Split' }).click();

  await expect(page.locator('.markdown').filter({ hasText: 'A short engagement.' })).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/documents\/doc_/);
  await expect(page.getByRole('heading', { name: 'E2E scope' })).toBeVisible();
});
