/// Exactly one of three states. `pending` comes from the query's status, which
/// is the same on the server and the first client render; `isLoading` is not
/// (it also needs a fetch in flight, which never happens during SSR), and
/// branching on it rendered the skeleton and "unavailable" together.
export type RequestViewState = 'loading' | 'unavailable' | 'ready';

export function requestViewState(query: { isPending: boolean; isError: boolean; hasRequest: boolean }): RequestViewState {
  if (query.isError) return 'unavailable';
  if (query.isPending) return 'loading';
  return query.hasRequest ? 'ready' : 'unavailable';
}
