import { describe, expect, test } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import { parseGistProof, proofMessage, proofProblem } from './gist.js';

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const NOW = Date.parse('2026-10-15T00:00:00Z') / 1000;

async function gist(over: Partial<{ wallet: string; login: string; issued: string }> = {}) {
  const message = proofMessage(account.address, over.login ?? 'ada', over.issued ?? '2026-10-10');
  const signature = await account.signMessage({ message });
  const text = `${proofMessage((over.wallet ?? account.address) as `0x${string}`, over.login ?? 'ada', over.issued ?? '2026-10-10')}\nsignature: ${signature}\n`;
  return { text, signature };
}

describe('gist proof', () => {
  test('the message is fixed text with the wallet in lowercase', () => {
    expect(proofMessage(account.address, 'ada', '2026-10-10')).toBe(
      `karwan work proof\nwallet: ${account.address.toLowerCase()}\nlogin: ada\nissued: 2026-10-10`,
    );
  });

  test('parses a well-formed gist', async () => {
    const { text, signature } = await gist();
    expect(parseGistProof(text)).toEqual({ wallet: account.address.toLowerCase(), login: 'ada', issued: '2026-10-10', signature });
  });

  test('refuses extra or reordered lines', async () => {
    const { text } = await gist();
    expect(parseGistProof(`note\n${text}`)).toBeNull();
    expect(parseGistProof(text.replace('login: ada\n', 'login:  ada\n'))).toBeNull();
  });

  test('a proof for another login, another wallet, or older than 30 days is refused', async () => {
    const parsed = parseGistProof((await gist()).text)!;
    expect(proofProblem(parsed, { wallet: account.address, login: 'ada', gistOwner: 'ada', now: NOW })).toBeNull();
    expect(proofProblem(parsed, { wallet: account.address, login: 'ada', gistOwner: 'eve', now: NOW })).toBe('GIST_OWNER_MISMATCH');
    expect(proofProblem(parsed, { wallet: account.address, login: 'bob', gistOwner: 'bob', now: NOW })).toBe('LOGIN_MISMATCH');
    expect(proofProblem(parsed, { wallet: '0x0000000000000000000000000000000000000001', login: 'ada', gistOwner: 'ada', now: NOW })).toBe('WALLET_MISMATCH');
    const old = parseGistProof((await gist({ issued: '2026-09-14' })).text)!;
    expect(proofProblem(old, { wallet: account.address, login: 'ada', gistOwner: 'ada', now: NOW })).toBe('PROOF_EXPIRED');
  });
});
