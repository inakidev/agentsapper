// Anything printed to a terminal may come from the scanned repo (file names,
// evidence). Escape C0/C1 controls so a hostile repo cannot inject terminal
// escape sequences, and escape invisible/bidi characters so what the user
// reads is what is actually in the file.
const UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  /[\u0000-\u001f\u007f-\u009f\u{ad}\u{61c}\u{180e}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2064}\u{2066}-\u{206f}\u{feff}\u{fff9}-\u{fffb}]|[\u{e0000}-\u{e007f}]/gu;

export function escapeForTerminal(text: string): string {
  return text.replace(UNSAFE_CHARS, (ch) => `\\u{${(ch.codePointAt(0) ?? 0).toString(16)}}`);
}
