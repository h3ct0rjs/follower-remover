import { z } from 'zod';
import { DateRange } from '../../../domain/date-range.js';
import type { FollowerFilter, FollowerSort } from '../../../domain/ports/follower-repository.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" se interpreta en hora local: inicio del día para "desde", fin del día para "hasta". */
export function parseDateParam(value: string | undefined, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59, 999);
  }
  return new Date(value);
}

export const followerQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  status: z.enum(['active', 'queued', 'removed', 'all']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  sort: z.enum(['newest', 'oldest', 'username']).optional(),
});

export type FollowerQuery = z.infer<typeof followerQuerySchema>;

export function toFilter(q: FollowerQuery): { filter: FollowerFilter; page?: number; pageSize?: number; sort?: FollowerSort } {
  return {
    filter: {
      range: DateRange.create(parseDateParam(q.from, 'start'), parseDateParam(q.to, 'end')),
      search: q.q,
      status: (q.status as FollowerFilter['status']) ?? 'all',
    },
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
  };
}
