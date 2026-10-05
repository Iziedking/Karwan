export function passportView(viewer: string | null, subject: string): 'owner' | 'visitor' {
  return viewer && viewer.toLowerCase() === subject.toLowerCase() ? 'owner' : 'visitor';
}
