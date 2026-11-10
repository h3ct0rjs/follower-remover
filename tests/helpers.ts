import { buildUseCases, type UseCases } from '../src/application/index.js';
import { InstagramExportParser } from '../src/adapters/outbound/instagram-export/instagram-export-parser.js';
import { InMemoryFollowerRepository } from '../src/adapters/outbound/persistence/in-memory/in-memory-follower-repository.js';
import { InMemoryRemovalQueueRepository } from '../src/adapters/outbound/persistence/in-memory/in-memory-removal-queue-repository.js';
import type { Clock } from '../src/domain/ports/clock.js';

export class FakeClock implements Clock {
  constructor(public current = new Date('2026-11-10T12:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface Harness {
  uc: UseCases;
  followers: InMemoryFollowerRepository;
  queue: InMemoryRemovalQueueRepository;
  clock: FakeClock;
}

export function harness(): Harness {
  const followers = new InMemoryFollowerRepository();
  const queue = new InMemoryRemovalQueueRepository();
  const clock = new FakeClock();
  const uc = buildUseCases({ followers, queue, parser: new InstagramExportParser(), clock });
  return { uc, followers, queue, clock };
}

export function exportDoc(entries: { username: string; timestamp: number }[]): unknown {
  return entries.map((e) => ({
    title: '',
    media_list_data: [],
    string_list_data: [{ href: `https://www.instagram.com/${e.username}`, value: e.username, timestamp: e.timestamp }],
  }));
}
