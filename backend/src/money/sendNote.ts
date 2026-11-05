/// The longest note a send carries (view 50), the same as a payment link's "For".
export const NOTE_MAX = 120;

/// A send's note as the other person will read it: plain text on one line,
/// without control or direction-override characters, at most NOTE_MAX long.
/// Nothing left means no note.
export function cleanNote(text: string | null | undefined): string | null {
  if (!text) return null;
  const plain = text
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX)
    .trim();
  return plain || null;
}
