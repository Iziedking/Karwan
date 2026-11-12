interface Band {
  top: number;
  bottom: number;
}

interface Note extends Band {
  /// Distance from the screen's starting edge to the note's starting edge.
  start: number;
}

interface Launcher extends Band {
  /// Distance from the screen's starting edge to the launcher's nearer edge.
  start: number;
}

export interface Fit {
  /// The widest the note may be, or null to leave its own width alone.
  maxWidth: number | null;
  /// How far the note's bottom edge sits above the screen's, or null to leave it.
  bottom: number | null;
}

const GAP = 12;
/// Narrower than this and the line breaks into a column of single words.
const NARROWEST = 200;

/// Where the note fits when the Help button shares its row. On a phone both
/// sit just above the bottom bar, and the Help button's width changes with its
/// label and language, so the room is measured, never assumed. With room the
/// note narrows to stop short of the button; without it the note sits above.
export function besideLauncher(note: Note, launcher: Launcher | null, screenHeight: number): Fit {
  if (!launcher) return { maxWidth: null, bottom: null };
  const sameRow = launcher.top < note.bottom && note.top < launcher.bottom;
  if (!sameRow) return { maxWidth: null, bottom: null };
  const room = launcher.start - note.start - GAP;
  if (room >= NARROWEST) return { maxWidth: Math.floor(room), bottom: null };
  return { maxWidth: null, bottom: Math.ceil(screenHeight - launcher.top + GAP) };
}
