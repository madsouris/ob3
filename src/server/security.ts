import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { ApiError } from './errors.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface SecurityOptions {
  readonly token: string;
  /** `Host` header values a browser could legitimately use for this server. */
  readonly allowedHosts: readonly string[];
  /** Full origins (`http://127.0.0.1:19731`) that may issue mutating requests. */
  readonly allowedOrigins: readonly string[];
}

const tokensMatch = (expected: string, provided: string): boolean => {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(provided, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Loopback hardening (ADR-08). A browser always sends `Host`, so a missing one
 * only means a non-browser client (curl, tests) and is allowed. `Origin` and
 * `Sec-Fetch-Site` are enforced whenever present.
 */
export const createSecurityMiddleware = (options: SecurityOptions): MiddlewareHandler => {
  return async (c, next) => {
    const host = c.req.header('host');
    if (host !== undefined && !options.allowedHosts.includes(host)) {
      throw new ApiError(403, 'host_not_allowed', 'Host header is not allowed');
    }

    const site = c.req.header('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      throw new ApiError(403, 'cross_origin', 'Cross-origin requests are rejected');
    }

    const origin = c.req.header('origin');
    if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
      throw new ApiError(403, 'cross_origin', 'Origin is not allowed');
    }

    if (MUTATING_METHODS.has(c.req.method.toUpperCase())) {
      const token = c.req.header('x-ob-token');
      if (token === undefined || !tokensMatch(options.token, token)) {
        throw new ApiError(401, 'invalid_token', 'Missing or invalid X-OB-Token header');
      }
    }

    await next();
  };
};

export const allowedHostsFor = (port: number): readonly string[] => [
  `127.0.0.1:${port}`,
  `localhost:${port}`,
  '127.0.0.1',
  'localhost',
];

export const allowedOriginsFor = (port: number): readonly string[] => [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
];
