export interface ParsedFollower {
  username: string;
  profileUrl: string | null;
  followedAt: Date;
}

/** Puerto de salida: convierte un documento de exportación (formato externo) en seguidores. */
export interface FollowerExportParser {
  /** Lanza DomainError('INVALID_EXPORT_FORMAT') si el documento no es reconocible. */
  parse(document: unknown): ParsedFollower[];
}
