import { DomainError } from './errors.js';

/**
 * Estado de un seguidor dentro de la aplicación:
 *  - active:  nos sigue y no hemos hecho nada con él.
 *  - queued:  está en la cola de eliminación (pendiente, en proceso o fallido).
 *  - removed: lo eliminamos como seguidor.
 */
export type FollowerStatus = 'active' | 'queued' | 'removed';
export const FOLLOWER_STATUSES: readonly FollowerStatus[] = ['active', 'queued', 'removed'];

export interface Follower {
  readonly username: string;
  readonly profileUrl: string;
  readonly followedAt: Date;
  readonly status: FollowerStatus;
  readonly removedAt: Date | null;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function profileUrlFor(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function createFollower(input: { username: string; profileUrl?: string | null; followedAt: Date }): Follower {
  const username = normalizeUsername(input.username);
  if (!username) throw new DomainError('INVALID_USERNAME', 'El nombre de usuario no puede estar vacío');
  if (!(input.followedAt instanceof Date) || Number.isNaN(input.followedAt.getTime())) {
    throw new DomainError('INVALID_DATE', `Fecha de seguimiento inválida para @${username}`);
  }
  return {
    username,
    profileUrl: input.profileUrl?.trim() || profileUrlFor(username),
    followedAt: input.followedAt,
    status: 'active',
    removedAt: null,
  };
}

/**
 * Reconcilia un seguidor existente con los datos de una exportación nueva.
 * Si lo habíamos eliminado y vuelve a aparecer con una fecha posterior,
 * significa que nos volvió a seguir: vuelve a estar activo.
 */
export function reconcileWithExport(existing: Follower, incoming: Follower): Follower {
  const refollowed =
    existing.status === 'removed' &&
    existing.removedAt !== null &&
    incoming.followedAt.getTime() > existing.removedAt.getTime();

  return {
    ...existing,
    profileUrl: incoming.profileUrl,
    followedAt: incoming.followedAt,
    status: refollowed ? 'active' : existing.status,
    removedAt: refollowed ? null : existing.removedAt,
  };
}
