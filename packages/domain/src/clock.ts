/**
 * Injectable clock. Domain code must call now() instead of new Date() so tests
 * (and the dev-only job runner) can move time forward deterministically.
 */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function setClock(fn: (() => Date) | null) {
  override = fn;
}

export function freezeClock(at: Date | string) {
  const fixed = new Date(at);
  override = () => new Date(fixed);
}
