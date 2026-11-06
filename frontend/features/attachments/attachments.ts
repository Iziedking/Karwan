import { publicApiUrl } from '@/core/api';
import { resizePhoto } from '@/features/listings/photos';

/// Photos and PDFs on a request or a direct deal (view 56). The limits match
/// the server's, so a file that would be refused is never sent.
export const MAX_ATTACHMENTS = 4;
export const MAX_PDF_BYTES = 4_000_000;
export const MAX_TOTAL_BYTES = 6_000_000;

export type PickedAttachment = { name: string; dataUrl: string; kind: 'photo' | 'pdf'; size: number };
export type AttachProblem = 'max' | 'tooLarge' | 'notAllowed';

/// Bytes a data URL carries, read from its base64 length.
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

/// Whether one more file of this size fits beside the ones already picked.
export function fits(current: readonly PickedAttachment[], size: number, kind: 'photo' | 'pdf'): AttachProblem | null {
  if (current.length >= MAX_ATTACHMENTS) return 'max';
  if (kind === 'pdf' && size > MAX_PDF_BYTES) return 'tooLarge';
  if (current.reduce((sum, a) => sum + a.size, 0) + size > MAX_TOTAL_BYTES) return 'tooLarge';
  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/// A picked file ready to send: a photo resized on the device, a PDF as it is.
export async function readAttachment(file: File): Promise<PickedAttachment | AttachProblem> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF_BYTES) return 'tooLarge';
    const dataUrl = await readAsDataUrl(file);
    return { name: file.name, dataUrl, kind: 'pdf', size: file.size };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return 'notAllowed';
  const dataUrl = await resizePhoto(file);
  return { name: file.name, dataUrl, kind: 'photo', size: dataUrlBytes(dataUrl) };
}

/// The link one attachment is read from, with the viewer's session.
export function attachmentHref(on: 'request' | 'deal', jobId: string, n: number): string {
  return on === 'request'
    ? publicApiUrl(`/api/jobs/${encodeURIComponent(jobId)}/attachments/${n}`)
    : publicApiUrl(`/api/deals/direct/${encodeURIComponent(jobId)}/attachments/${n}`);
}
