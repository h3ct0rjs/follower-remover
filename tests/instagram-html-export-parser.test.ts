import { describe, expect, it } from 'vitest';
import { AutoDetectExportParser } from '../src/adapters/outbound/instagram-export/auto-detect-export-parser.js';
import { InstagramHtmlExportParser } from '../src/adapters/outbound/instagram-export/instagram-html-export-parser.js';

const HTML = `<html><body><main class="_a706" role="main">
<div class="pam"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/hvtalent">hvtalent</a></div><div>Oct 28, 2026 6:12 pm</div></div></div></div>
<div class="pam"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/darwinlab.co">darwinlab.co</a></div><div>Dec 09, 2025 10:33 am</div></div></div></div>
<div class="pam"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/media_noche">media_noche</a></div><div>Jan 01, 2026 12:05 am</div></div></div></div>
</main></body></html>`;

describe('InstagramHtmlExportParser', () => {
  it('extrae usuario, enlace y fecha de followers_1.html', () => {
    const list = new InstagramHtmlExportParser().parse(HTML);
    expect(list.map((f) => f.username)).toEqual(['hvtalent', 'darwinlab.co', 'media_noche']);
    expect(list[0].profileUrl).toBe('https://www.instagram.com/hvtalent');
    expect(list[0].followedAt).toEqual(new Date(2026, 9, 28, 18, 12));
    expect(list[1].followedAt).toEqual(new Date(2025, 11, 9, 10, 33));
    expect(list[2].followedAt).toEqual(new Date(2026, 0, 1, 0, 5));
  });

  it('entiende fechas en español', () => {
    expect(InstagramHtmlExportParser.parseDate('28 oct 2026, 18:12')).toEqual(new Date(2026, 9, 28, 18, 12));
    expect(InstagramHtmlExportParser.parseDate('9 de diciembre de 2025 10:33')).toEqual(new Date(2025, 11, 9, 10, 33));
    expect(InstagramHtmlExportParser.parseDate('basura')).toBeNull();
  });

  it('rechaza lo que no es HTML', () => {
    expect(() => new InstagramHtmlExportParser().parse('[]')).toThrow(/HTML/);
  });
});

describe('AutoDetectExportParser', () => {
  const parser = new AutoDetectExportParser();
  const json = [{ string_list_data: [{ href: 'https://www.instagram.com/ana', value: 'ana', timestamp: 1700000000 }] }];

  it('acepta objeto JSON, texto JSON y texto HTML', () => {
    expect(parser.parse(json)[0].username).toBe('ana');
    expect(parser.parse(JSON.stringify(json))[0].username).toBe('ana');
    expect(parser.parse(HTML)).toHaveLength(3);
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => parser.parse('hola')).toThrow(/Formato no reconocido/);
    expect(() => parser.parse('{no json')).toThrow(/no se pudo leer/);
  });
});
