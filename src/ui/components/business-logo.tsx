import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const monogram = (name: string): string => {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  if (words.length === 0) return 'ob';
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
};

export interface BusinessLogoProps {
  readonly name: string;
  /** Workspace path from config; empty means the monogram fallback. */
  readonly logo: string;
  readonly className?: string;
  /** Bump to defeat the browser cache after an upload. */
  readonly version?: number | string;
}

/**
 * The business mark used by Settings and printed documents. With no uploaded
 * logo it renders a typographic monogram, so every workspace has an identity
 * out of the box.
 */
export const BusinessLogo = ({ name, logo, className, version }: BusinessLogoProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logo, version]);

  const query = version === undefined ? '' : `?v=${encodeURIComponent(String(version))}`;

  return (
    <span
      className={cn('business-logo inline-flex shrink-0 items-center justify-center', className)}
    >
      {logo === '' || failed ? (
        <span
          aria-hidden
          className="flex h-full w-full items-center justify-center rounded-[inherit] border font-mono text-xs font-semibold tracking-tight"
        >
          {monogram(name)}
        </span>
      ) : (
        <img
          src={`/api/logo${query}`}
          alt={`${name.trim() === '' ? 'Business' : name} logo`}
          className="h-full w-auto max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
};
