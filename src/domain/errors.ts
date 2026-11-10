export type DomainErrorCode =
  | 'INVALID_USERNAME'
  | 'INVALID_DATE'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_EXPORT_FORMAT'
  | 'JOB_NOT_FOUND'
  | 'INVALID_JOB_TRANSITION';

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
