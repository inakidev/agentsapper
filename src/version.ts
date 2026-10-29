import { readFileSync } from 'node:fs';

/** Reads the version from package.json, which sits one level above both src/ and dist/. */
export function readVersion(): string {
  const pkg: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (typeof pkg === 'object' && pkg !== null && 'version' in pkg) {
    return String(pkg.version);
  }
  return 'unknown';
}
