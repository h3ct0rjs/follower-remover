import { DomainError } from './errors.js';

/** Rango de fechas inclusivo; cualquiera de los extremos puede estar abierto. */
export class DateRange {
  private constructor(
    readonly from: Date | null,
    readonly to: Date | null,
  ) {}

  static open(): DateRange {
    return new DateRange(null, null);
  }

  static create(from?: Date | null, to?: Date | null): DateRange {
    const f = from ?? null;
    const t = to ?? null;
    if (f && Number.isNaN(f.getTime())) throw new DomainError('INVALID_DATE', 'Fecha "desde" inválida');
    if (t && Number.isNaN(t.getTime())) throw new DomainError('INVALID_DATE', 'Fecha "hasta" inválida');
    if (f && t && f.getTime() > t.getTime()) {
      throw new DomainError('INVALID_DATE_RANGE', 'La fecha "desde" no puede ser posterior a "hasta"');
    }
    return new DateRange(f, t);
  }

  get isOpen(): boolean {
    return this.from === null && this.to === null;
  }

  contains(date: Date): boolean {
    const ts = date.getTime();
    if (this.from && ts < this.from.getTime()) return false;
    if (this.to && ts > this.to.getTime()) return false;
    return true;
  }
}
