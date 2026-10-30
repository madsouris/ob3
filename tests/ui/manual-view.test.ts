import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import manualSource from '../../docs/user-manual.md?raw';
import { parseManual } from '../../src/ui/lib/manual.js';
import { Manual } from '../../src/ui/views/manual.js';

const { sections } = parseManual(manualSource);

/**
 * Server-renders the view. This is the closest check to the real page that
 * runs without a browser: it catches a broken import, an unmounting render or
 * a section that lost its anchor.
 */
const html = renderToStaticMarkup(createElement(Manual, { section: null }));

describe('manual view', () => {
  it('renders one anchored section per parsed section', () => {
    for (const section of sections) {
      expect(html).toContain(`id="${section.id}"`);
      expect(html).toContain(section.title);
    }
    expect(html.match(/<section /g)?.length).toBe(sections.length);
  });

  it('renders the contents rail and the mobile trigger', () => {
    expect(html).toContain('aria-label="Manual sections"');
    expect(html).toContain('Contents');
    expect(html).toContain('User manual');
  });

  it('renders manual copy as text, not as unresolved links', () => {
    expect(html).toContain('Before you start');
    expect(html).not.toContain('](../');
  });
});
