import { describe, expect, it } from 'vitest';
import { InstagramExportParser } from '../src/adapters/outbound/instagram-export/instagram-export-parser.js';
import { DomainError } from '../src/domain/errors.js';

const parser = new InstagramExportParser();

describe('InstagramExportParser', () => {
  it('lee el formato followers_1.json (array de entradas con string_list_data)', () => {
    const doc = [
      { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/ana', value: 'ana', timestamp: 1700000000 }] },
    ];
    const [f] = parser.parse(doc);
    expect(f.username).toBe('ana');
    expect(f.profileUrl).toBe('https://www.instagram.com/ana');
    expect(f.followedAt.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });

  it('acepta el formato envuelto en objeto (relationships_followers)', () => {
    const doc = { relationships_followers: [{ string_list_data: [{ value: 'bob', timestamp: 1700000000 }] }] };
    expect(parser.parse(doc).map((f) => f.username)).toEqual(['bob']);
  });

  it('deduce el usuario desde href cuando falta value', () => {
    const doc = [{ string_list_data: [{ href: 'https://www.instagram.com/carla/', timestamp: 1700000000 }] }];
    expect(parser.parse(doc)[0].username).toBe('carla');
  });

  it('ignora entradas sin datos y rechaza documentos irreconocibles', () => {
    expect(parser.parse([{ foo: 1 }, null])).toEqual([]);
    expect(() => parser.parse('texto')).toThrow(DomainError);
  });
});
