/// The file a paste or a drop carries, when a message box should take it: the
/// first file of an accepted type. A paste that also carries text (a copy from
/// a document or a web page) pastes as text, so only a bare screenshot or a
/// copied file becomes an attachment.
export function pastedFile(
  data: { types: readonly string[]; files: ArrayLike<{ type: string }> } | null | undefined,
  accept: readonly string[],
  { preferText = true }: { preferText?: boolean } = {},
): number | null {
  if (!data) return null;
  if (preferText && data.types.includes('text/plain')) return null;
  for (let i = 0; i < data.files.length; i++) {
    if (accept.includes(data.files[i]!.type)) return i;
  }
  return null;
}
