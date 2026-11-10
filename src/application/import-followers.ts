import { createFollower, reconcileWithExport, type Follower } from '../domain/follower.js';
import type { FollowerExportParser } from '../domain/ports/follower-export-parser.js';
import type { FollowerRepository } from '../domain/ports/follower-repository.js';

export interface ImportFollowersResult {
  parsed: number;
  inserted: number;
  updated: number;
  documents: number;
}

/** Importa uno o varios documentos `followers_N.json` de la exportación de Instagram. */
export class ImportFollowers {
  constructor(
    private readonly parser: FollowerExportParser,
    private readonly followers: FollowerRepository,
  ) {}

  async execute(documents: unknown[]): Promise<ImportFollowersResult> {
    const incoming = new Map<string, Follower>();
    for (const doc of documents) {
      for (const parsed of this.parser.parse(doc)) {
        const follower = createFollower(parsed);
        incoming.set(follower.username, follower); // si se repite, gana el último
      }
    }

    const usernames = [...incoming.keys()];
    const existing = new Map((await this.followers.findByUsernames(usernames)).map((f) => [f.username, f]));

    const toPersist = usernames.map((u) => {
      const next = incoming.get(u)!;
      const prev = existing.get(u);
      return prev ? reconcileWithExport(prev, next) : next;
    });

    const { inserted, updated } = await this.followers.upsertMany(toPersist);
    return { parsed: incoming.size, inserted, updated, documents: documents.length };
  }
}
