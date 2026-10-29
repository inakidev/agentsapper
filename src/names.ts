// Names are compared the way a case-insensitive filesystem compares them (Windows,
// and macOS by default): opening .claude/settings.json there also opens
// .Claude/SETTINGS.json. This holds on every platform, because a repository
// scanned on a case-sensitive system is often opened on one that is not.

/**
 * Approximates the filesystem's comparison: Unicode normalization (macOS treats
 * composed and decomposed forms as one name) plus case folding, including
 * non-ASCII letters that fold to ASCII ones, such as the long s.
 */
export function foldName(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC');
}

/** True when a case-insensitive filesystem treats `a` and `b` as the same name. */
export function sameName(a: string, b: string): boolean {
  return a === b || foldName(a) === foldName(b);
}
