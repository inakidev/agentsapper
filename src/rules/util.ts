/** Keeps evidence short; payloads can be long and the location points to the rest. */
export function clip(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
