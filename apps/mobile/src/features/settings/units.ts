/** Units the student can pick in Settings; sent with each page so explanations fit the course. */
export const UNITS = [
  'Limits and continuity',
  'Derivatives',
  'Applications of derivatives',
  'Integrals',
  'Applications of integrals',
  'Techniques of integration',
  'Sequences and series',
  'Differential equations',
] as const;

export const UNIT_KEY = 'current_unit';

/** A stored value is only trusted if it is still one of the known units. */
export function parseUnit(value: string | null): string | null {
  return value && (UNITS as readonly string[]).includes(value) ? value : null;
}
