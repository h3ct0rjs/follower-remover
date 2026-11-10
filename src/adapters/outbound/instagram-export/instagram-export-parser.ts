import { DomainError } from '../../../domain/errors.js';
import type { FollowerExportParser, ParsedFollower } from '../../../domain/ports/follower-export-parser.js';

/**
 * Parser del formato JSON de "Descargar tu información" de Instagram.
 *
 * followers_1.json (y followers_2.json, ...) es un array de entradas:
 *   { "title": "", "media_list_data": [], "string_list_data": [
 *       { "href": "https://www.instagram.com/usuario", "value": "usuario", "timestamp": 1699999999 } ] }
 *
 * Algunas exportaciones envuelven el array en un objeto, p. ej. { "relationships_followers": [...] }.
 * Los timestamps vienen en segundos UNIX.
 */
export class InstagramExportParser implements FollowerExportParser {
  parse(document: unknown): ParsedFollower[] {
    const entries = this.unwrap(document);
    const out: ParsedFollower[] = [];
    for (const entry of entries) {
      const parsed = this.parseEntry(entry);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  private unwrap(document: unknown): unknown[] {
    if (Array.isArray(document)) return document;
    if (document && typeof document === 'object') {
      for (const value of Object.values(document as Record<string, unknown>)) {
        if (Array.isArray(value)) return value;
      }
    }
    throw new DomainError(
      'INVALID_EXPORT_FORMAT',
      'El archivo no parece una exportación de seguidores de Instagram (se esperaba un array de entradas con "string_list_data")',
    );
  }

  private parseEntry(entry: unknown): ParsedFollower | null {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    const list = Array.isArray(e.string_list_data) ? (e.string_list_data as unknown[]) : [];
    const item = list.find((i) => i && typeof i === 'object') as Record<string, unknown> | undefined;
    if (!item) return null;

    const href = typeof item.href === 'string' ? item.href : null;
    const value = typeof item.value === 'string' ? item.value : '';
    const username = value || (typeof e.title === 'string' ? e.title : '') || this.usernameFromHref(href);
    if (!username) return null;

    const ts = typeof item.timestamp === 'number' ? item.timestamp : Number(item.timestamp);
    if (!Number.isFinite(ts)) return null;
    // Segundos UNIX; si alguien ya los pasó a milisegundos, lo detectamos por magnitud.
    const ms = ts > 1e12 ? ts : ts * 1000;

    return { username, profileUrl: href, followedAt: new Date(ms) };
  }

  private usernameFromHref(href: string | null): string {
    if (!href) return '';
    try {
      const path = new URL(href).pathname.replace(/\/+$/, '');
      return path.split('/').pop() ?? '';
    } catch {
      return '';
    }
  }
}
