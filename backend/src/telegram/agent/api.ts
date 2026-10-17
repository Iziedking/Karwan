import type { TelegramSend } from './render.js';

const API = 'https://api.telegram.org';

/// The few Bot API calls the agent makes. Every call returns a plain result
/// and never throws, so one failed send cannot stop the polling loop.
export function createTelegramApi(deps: { token: string; fetch: typeof fetch; maxFileBytes: number }) {
  const call = async (method: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    try {
      const res = await deps.fetch(`${API}/bot${deps.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; result?: Record<string, unknown> };
      return res.ok && json.ok ? (json.result ?? {}) : null;
    } catch {
      return null;
    }
  };

  async function sendMessage(chatId: number, message: TelegramSend): Promise<boolean> {
    return (await call('sendMessage', { chat_id: chatId, ...message })) !== null;
  }

  async function answerCallback(callbackId: string): Promise<void> {
    await call('answerCallbackQuery', { callback_query_id: callbackId });
  }

  /// A file a person sent, refused before download when Telegram says it is
  /// over the cap and again after download if it turns out to be.
  async function download(fileId: string): Promise<Uint8Array | null> {
    const file = await call('getFile', { file_id: fileId });
    const path = typeof file?.file_path === 'string' ? file.file_path : null;
    const size = typeof file?.file_size === 'number' ? file.file_size : 0;
    if (!path || size > deps.maxFileBytes) return null;
    try {
      const res = await deps.fetch(`${API}/file/bot${deps.token}/${path}`);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return bytes.byteLength > deps.maxFileBytes ? null : bytes;
    } catch {
      return null;
    }
  }

  async function deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    return (await call('deleteMessage', { chat_id: chatId, message_id: messageId })) !== null;
  }

  return { sendMessage, answerCallback, download, deleteMessage };
}
