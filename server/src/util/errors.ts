import type { ErrorCode } from '../../../shared/protocol';

/** Expected, user-facing failure. Anything else is treated as INTERNAL. */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const forbidden = (msg = "You don't have permission to do that.") => new DomainError('FORBIDDEN', msg);
export const badRequest = (msg = 'Invalid request.') => new DomainError('BAD_REQUEST', msg);
export const notFound = (msg = 'Not found.') => new DomainError('NOT_FOUND', msg);
