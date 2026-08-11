'use client';
import { useEffect, useState } from 'react';
import { api, type ChatMessage } from '@/core/api';

export function FinancingChatPanel({ kind, positionId }: { kind: 'factoring' | 'po'; positionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [writable, setWritable] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => { api.listFinancingMessages(kind, positionId).then(r => { setMessages(r.messages); setWritable(r.writable); }).catch(() => {}); }, [kind, positionId]);
  async function send() { const body = draft.trim(); if (!body) return; const r = await api.sendFinancingMessage(kind, positionId, body); setMessages(v => [...v, r.message]); setDraft(''); }
  return <section><h2>Financing conversation</h2>{messages.map(m => <p key={m.id}>{m.body}</p>)}{writable ? <div><input value={draft} onChange={e => setDraft(e.target.value)} /><button type={'button'} onClick={send}>Send</button></div> : <p>This conversation is closed. The record remains available to both parties.</p>}</section>;
}
