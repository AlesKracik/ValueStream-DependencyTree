import fp from 'fastify-plugin';
import { FastifyError, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors';

type FetchCause = {
  code?: string;
  errno?: string | number;
  syscall?: string;
  hostname?: string;
  host?: string;
  address?: string;
  port?: number | string;
  name?: string;
  message?: string;
  cause?: unknown;
};

// Node's built-in fetch (undici) throws `TypeError: fetch failed` for any
// network-level failure (DNS, refused, TLS, timeout, socket hangup). The
// useful detail lives on `error.cause`. This walks one or two levels of the
// cause chain and assembles a human-readable description.
function describeFetchCause(cause: unknown): string | null {
  if (!cause || typeof cause !== 'object') return null;
  const c = cause as FetchCause;

  const parts: string[] = [];
  if (c.code) parts.push(c.code);

  const target = c.hostname || c.host || c.address;
  if (target) {
    parts.push(c.port ? `${target}:${c.port}` : String(target));
  }

  if (c.message && !parts.some((p) => c.message!.includes(p))) {
    parts.push(c.message);
  }

  // Some undici errors wrap the real cause one level deeper (e.g. ConnectTimeoutError).
  if (parts.length === 0 && c.cause) {
    return describeFetchCause(c.cause);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

function isFetchFailed(error: Error): boolean {
  return error.name === 'TypeError' && error.message === 'fetch failed';
}

export function enrichFetchError(error: Error, request: FastifyRequest): string {
  const cause = (error as Error & { cause?: unknown }).cause;
  const detail = describeFetchCause(cause);
  const base = detail ? `Outbound request failed: ${detail}` : 'Outbound request failed (no further detail available)';
  return `${base} (while handling ${request.method} ${request.url})`;
}

export default fp(async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    // Use statusCode from AppError, Fastify validation errors, or default to 500
    const statusCode = (error as AppError).statusCode || (error as FastifyError).statusCode || 500;

    const message = isFetchFailed(error as Error)
      ? enrichFetchError(error as Error, request)
      : (error.message || 'Internal Server Error');

    // Log server errors, skip expected client errors
    if (statusCode >= 500) {
      // Pino's err serializer preserves the full cause chain in logs,
      // so the raw error object gives the richest server-side trace.
      fastify.log.error(error);
    }

    return reply.code(statusCode).send({ success: false, error: message });
  });
});
