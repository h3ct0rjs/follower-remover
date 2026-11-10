import { DomainError } from '../../../domain/errors.js';
import type { FollowerExportParser, ParsedFollower } from '../../../domain/ports/follower-export-parser.js';

/**
 * Parser del formato HTML de "Descargar tu información" (followers_1.html).
 * Cada seguidor aparece como:
 *   <a target="_blank" href="https://www.instagram.com/usuario">usuario</a></div><div>Oct 28, 2026 6:12 pm</div>
 * Las fechas vienen en texto, en el idioma de la cuenta; soportamos inglés y español.
 */
export class InstagramHtmlExportParser implements FollowerExportParser {
  private static readonly ENTRY =
    /<a[^>]*href="https?:\/\/(?:www\.)?instagram\.com\/([^"\/?#]+)\/?"[^>]*>([^<]*)<\/a>\s*<\/div>\s*<div>([^<]+)<\/div>/g;

  private static readonly MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    ene: 0, abr: 3, ago: 7, dic: 11,
  };

  parse(document: unknown): ParsedFollower[] {
    if (typeof document !== 'string' || !/<html|<body|<main/i.test(document)) {
      throw new DomainError('INVALID_EXPORT_FORMAT', 'El documento no es un archivo HTML de exportación de Instagram');
    }
    const out: ParsedFollower[] = [];
    for (const m of document.matchAll(InstagramHtmlExportParser.ENTRY)) {
      const [, slug, text, dateText] = m;
      const username = decodeEntities(text.trim()) || decodeURIComponent(slug);
      const followedAt = InstagramHtmlExportParser.parseDate(decodeEntities(dateText));
      if (!username || !followedAt) continue;
      out.push({ username, profileUrl: `https://www.instagram.com/${slug}`, followedAt });
    }
    return out;
  }

  /** "Oct 28, 2026 6:12 pm" · "Dec 09, 2025 10:33 am" · "28 oct 2026, 18:12" */
  static parseDate(text: string): Date | null {
    const t = text.trim().toLowerCase().replace(/\./g, '').replace(/,/g, ' ').replace(/\s+/g, ' ');

    let m = t.match(/^([a-záéíóú]+) (\d{1,2}) (\d{4})(?: (\d{1,2}):(\d{2})(?: ?([ap])m)?)?$/);
    let day: number, year: number, monthKey: string;
    if (m) {
      [monthKey, day, year] = [m[1], Number(m[2]), Number(m[3])];
    } else {
      m = t.match(/^(\d{1,2}) (?:de )?([a-záéíóú]+)(?: de)? (\d{4})(?: (\d{1,2}):(\d{2})(?: ?([ap])m)?)?$/);
      if (!m) return null;
      [day, monthKey, year] = [Number(m[1]), m[2], Number(m[3])];
    }
    const month = InstagramHtmlExportParser.MONTHS[monthKey.slice(0, 4)] ?? InstagramHtmlExportParser.MONTHS[monthKey.slice(0, 3)];
    if (month === undefined) return null;

    let hour = m[4] ? Number(m[4]) : 0;
    const minute = m[5] ? Number(m[5]) : 0;
    if (m[6] === 'p' && hour < 12) hour += 12;
    if (m[6] === 'a' && hour === 12) hour = 0;

    const date = new Date(year, month, day, hour, minute);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
