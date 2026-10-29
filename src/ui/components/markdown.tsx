import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Markdown renderer. Raw HTML is never rendered (CSP and file content are not
 * trusted); GFM adds tables, task lists and strikethrough.
 */
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-2 text-lg font-semibold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 text-base font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="mt-4 mb-1 text-sm font-medium first:mt-0">{children}</h4>,
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-muted-foreground [&:not(:first-child)]:mt-3">
      {children}
    </p>
  ),
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      readOnly
      disabled
      className="mr-2 size-3.5 align-middle accent-primary"
    />
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-4 text-sm text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-border" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const block = className?.startsWith('language-') === true;
    return block ? (
      <code className={cn('font-mono', className)}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    );
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} loading="lazy" className="my-3 max-w-full rounded-md border" />
  ),
};

export interface MarkdownProps {
  readonly children: string;
  readonly className?: string;
  readonly emptyText?: string;
}

export const Markdown = ({
  children,
  className,
  emptyText = 'Nothing written yet.',
}: MarkdownProps) =>
  children.trim() === '' ? (
    <p className="text-sm text-muted-foreground">{emptyText}</p>
  ) : (
    <div className={cn('markdown text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
