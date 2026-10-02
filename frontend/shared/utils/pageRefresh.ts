/// Asks the current page to read its data again. A link to the page you are on
/// changes nothing, so a notification that points here sends this instead.
export const PAGE_REFRESH_EVENT = 'karwan:page-refresh';

export function requestPageRefresh(): void {
  window.dispatchEvent(new Event(PAGE_REFRESH_EVENT));
}
