import { DomainError } from '../../../domain/errors.js';
import type { FollowerExportParser, ParsedFollower } from '../../../domain/ports/follower-export-parser.js';
import { InstagramExportParser } from './instagram-export-parser.js';
import { InstagramHtmlExportParser } from './instagram-html-export-parser.js';

/**
 * Elige el parser según el contenido:
 *  - objeto/array ya parseado → JSON
 *  - string que empieza por "<"  → HTML
 *  - string que empieza por "[" o "{" → JSON (texto sin parsear)
 */
export class AutoDetectExportParser implements FollowerExportParser {
  constructor(
    private readonly json: FollowerExportParser = new InstagramExportParser(),
    private readonly html: FollowerExportParser = new InstagramHtmlExportParser(),
  ) {}

  parse(document: unknown): ParsedFollower[] {
    if (typeof document !== 'string') return this.json.parse(document);
    const head = document.trimStart().slice(0, 1);
    if (head === '<') return this.html.parse(document);
    if (head === '[' || head === '{') {
      try {
        return this.json.parse(JSON.parse(document));
      } catch (err) {
        if (err instanceof DomainError) throw err;
        throw new DomainError('INVALID_EXPORT_FORMAT', 'El archivo JSON no se pudo leer');
      }
    }
    throw new DomainError('INVALID_EXPORT_FORMAT', 'Formato no reconocido: se esperaba followers_N.json o followers_N.html');
  }
}
