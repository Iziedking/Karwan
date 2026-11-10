/// The offer a report is about, read from the page the report was sent from
/// ("/listings/lst_..."), or null when the report is about something else.
export function reportedListingId(url: string | null | undefined): string | null {
  const found = /^\/listings\/(lst_[0-9a-f]{6,64})(?:[/?#]|$)/.exec(url ?? '');
  return found ? found[1]! : null;
}
