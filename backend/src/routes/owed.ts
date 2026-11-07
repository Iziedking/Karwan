import { Hono } from 'hono';
import { z } from 'zod';
import { encodeFunctionData, formatUnits, parseAbi, type Hex } from 'viem';
import type { Context } from 'hono';
import type { SessionPayload } from '../auth/session.js';
import { owedOperationKey, type OwedContract, type OwedLine, type OwedSource } from '../money/owed.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Money owed to you (view 66). A wallet Karwan holds is collected here; the
/// person's own wallet gets the one call to sign and comes back to prove it.
/// Nothing here can pay anyone but the owed wallet itself.

export interface OwedDeps {
  session: (c: Context) => SessionPayload | null;
  usdc: string;
  sources: () => OwedSource[];
  lines: (address: string) => Promise<{ lines: OwedLine[]; totalMicros: bigint; unread: number }>;
  collectHeld: (line: OwedLine, requestId: string) => Promise<{ reference: string; txHash: string | null }>;
  prepareOwn: (line: OwedLine, requestId: string) => Promise<{ reference: string }>;
  completeOwn: (line: OwedLine, requestId: string, txHash: string) => Promise<{ reference: string }>;
  findIntent: (operationKey: string) => Promise<{ reference: string; amountMicros: string } | null>;
  activity: (entry: { address: string; lineId: string; amountMicros: bigint; txHash: string | null; reference: string }) => void;
}

const FROM: Record<OwedContract, 'deal' | 'guarantee' | 'check'> = { agreement: 'deal', jobs: 'deal', time: 'deal', vault: 'guarantee', cre: 'check' };
const withdrawAbi = parseAbi(['function withdrawOwed(address asset)', 'function withdrawOwed()']);
const usdc = (micros: bigint) => formatUnits(micros, 6);
const requestId = z.string().min(1).max(100);
const lineId = z.string().regex(/^(agreement|jobs|time|vault|cre):0x[0-9a-f]{40}$/);
const intentSchema = z.object({ id: lineId, requestId });
const completeSchema = intentSchema.extend({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export function createOwedRoutes(deps: OwedDeps): Hono {
  const app = new Hono();
  const collecting = new Set<string>();

  app.get('/', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const read = await deps.lines(session.address);
    return c.json({
      totalUsdc: usdc(read.totalMicros),
      unreadable: read.unread > 0,
      lines: read.lines.map((l) => ({ id: l.id, amountUsdc: usdc(l.amountMicros), signs: l.walletId ? 'karwan' : 'you', from: FROM[l.contract] })),
    });
  });

  app.post('/collect', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    let body: { requestId: string };
    try {
      body = z.object({ requestId }).parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const who = session.address.toLowerCase();
    if (collecting.has(who)) return c.json({ code: 'already_collecting', error: 'Already collecting. This takes a few seconds.' }, 409);
    collecting.add(who);
    try {
      const { lines } = await deps.lines(who);
      if (lines.length === 0) return c.json({ code: 'nothing_owed', error: 'Nothing is owed to you.' }, 409);
      const heldLines = lines.filter((l) => l.walletId);
      const yoursToSign = lines.filter((l) => !l.walletId).map((l) => l.id);
      if (heldLines.length === 0) return c.json({ code: 'sign_in_wallet', error: 'Collect this in your own wallet.', yoursToSign }, 409);
      const collected: Array<{ id: string; amountUsdc: string; reference: string; txHash: string | null }> = [];
      const failed: string[] = [];
      for (const line of heldLines) {
        try {
          const out = await deps.collectHeld(line, body.requestId);
          collected.push({ id: line.id, amountUsdc: usdc(line.amountMicros), reference: out.reference, txHash: out.txHash });
          deps.activity({ address: who, lineId: line.id, amountMicros: line.amountMicros, txHash: out.txHash, reference: out.reference });
        } catch {
          failed.push(line.id);
        }
      }
      if (collected.length === 0) return c.json({ code: 'collect_failed', error: 'It could not be collected right now. Nothing was lost.', failed }, 502);
      return c.json({ collected, failed, yoursToSign });
    } finally {
      collecting.delete(who);
    }
  });

  /// An own-wallet line of the signed-in person, as the contract it is on knows it.
  function ownLine(session: SessionPayload, id: string, amountMicros: bigint): OwedLine | null {
    const [contract, wallet] = id.split(':') as [OwedContract, string];
    if (wallet !== session.address.toLowerCase()) return null;
    const source = deps.sources().find((s) => s.contract === contract);
    if (!source) return null;
    return { id, contract, contractAddress: source.address, wallet, walletId: null, perAsset: source.perAsset, amountMicros };
  }

  app.post('/intent', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    let body: z.infer<typeof intentSchema>;
    try {
      body = intentSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const line = (await deps.lines(session.address)).lines.find((l) => l.id === body.id);
    if (!line) return c.json({ code: 'nothing_owed', error: 'Nothing is owed there.' }, 404);
    if (line.walletId) return c.json({ code: 'karwan_signs', error: 'Karwan collects this for you.' }, 409);
    if (!ownLine(session, line.id, line.amountMicros)) return c.json({ code: 'nothing_owed', error: 'Nothing is owed there.' }, 404);
    const prepared = await deps.prepareOwn(line, body.requestId);
    const data = line.perAsset
      ? encodeFunctionData({ abi: withdrawAbi, functionName: 'withdrawOwed', args: [deps.usdc as Hex] })
      : encodeFunctionData({ abi: withdrawAbi, functionName: 'withdrawOwed', args: [] });
    return c.json({ reference: prepared.reference, to: line.contractAddress, data, amountMicros: line.amountMicros.toString(), amountUsdc: usdc(line.amountMicros) });
  });

  app.post('/complete', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    let body: z.infer<typeof completeSchema>;
    try {
      body = completeSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const intent = await deps.findIntent(owedOperationKey(body.id, body.requestId));
    const line = intent ? ownLine(session, body.id, BigInt(intent.amountMicros)) : null;
    if (!intent || !line) return c.json({ code: 'intent_not_found', error: 'Start again before signing.' }, 409);
    try {
      const out = await deps.completeOwn(line, body.requestId, body.txHash);
      deps.activity({ address: line.wallet, lineId: line.id, amountMicros: line.amountMicros, txHash: body.txHash, reference: out.reference });
      return c.json({ ok: true, reference: out.reference, txHash: body.txHash, amountUsdc: usdc(line.amountMicros) });
    } catch (err) {
      return c.json({ error: 'The collection could not be proved.', detail: (err as Error).message }, 409);
    }
  });

  return app;
}
