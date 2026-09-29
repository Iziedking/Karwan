export type SignInFilm = { poster: string; webm: string; mp4: string };

// The panel and its Node tests share the same playback decision.
export function filmState({ film, reducedMotion, visible }: {
  film: boolean;
  reducedMotion: boolean;
  visible: boolean;
}): 'art' | 'poster' | 'play' | 'pause' {
  if (!film) return 'art';
  if (reducedMotion) return 'poster';
  return visible ? 'play' : 'pause';
}
