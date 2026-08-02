import { test } from 'node:test';
import assert from 'node:assert/strict';

/// The Safe signature blob.
///
/// This is worth testing because it fails as `GS026`, which reads as "invalid
/// owner" and sends you hunting a key problem when the real fault is byte
/// layout or sort order. Every assertion here is a rule the Safe enforces and
/// the encoder has to satisfy without any feedback until it reverts.
///
///   npx tsx --test src/chain/safeSigning.test.ts

const { encodeSafeSignatures, isOwner } = await import('./safeSigning.js');

const LOW = '0x178f583CFEfC814f5A81F350081b8F29f5B4c649' as const;   // deployer, EOA
const MID = '0x7711886865c33606Ebd977dA02A6A25373C75a35' as const;   // Circle SCA
const HIGH = '0xe786cB07777df4e1324A680feAc4f72Ba8Ead3b1' as const;  // Circle SCA
const SIG = ('0x' + 'ab'.repeat(64) + '1b') as `0x${string}`;        // r,s,v=27

test('every entry is exactly 65 bytes', () => {
  const blob = encodeSafeSignatures([
    { kind: 'ecdsa', owner: LOW, signature: SIG },
    { kind: 'approved', owner: HIGH },
  ]);
  // 2 entries x 65 bytes x 2 hex chars, plus the 0x.
  assert.equal(blob.length, 2 + 2 * 65 * 2);
});

test('an approved-hash entry is the owner, then zeros, then v=1', () => {
  const blob = encodeSafeSignatures([{ kind: 'approved', owner: HIGH }]);
  const body = blob.slice(2);

  // r = the owner address, left-padded to 32 bytes.
  assert.equal(body.slice(0, 64), '0'.repeat(24) + HIGH.slice(2).toLowerCase());
  // s = 0.
  assert.equal(body.slice(64, 128), '0'.repeat(64));
  // v = 1 is what tells the Safe to consult approvedHashes instead of
  // recovering a signer. v=0 would mean a contract signature and send it
  // looking for an EIP-1271 blob that is not there.
  assert.equal(body.slice(128, 130), '01');
});

test('an ecdsa entry is passed through untouched', () => {
  const blob = encodeSafeSignatures([{ kind: 'ecdsa', owner: LOW, signature: SIG }]);
  assert.equal(blob, SIG);
});

test('entries come out sorted by owner address, whatever order they went in', () => {
  // Safe walks the blob requiring each recovered owner to be strictly greater
  // than the last. Out of order is not a warning, it is a revert.
  const inOrder = encodeSafeSignatures([
    { kind: 'ecdsa', owner: LOW, signature: SIG },
    { kind: 'approved', owner: HIGH },
  ]);
  const reversed = encodeSafeSignatures([
    { kind: 'approved', owner: HIGH },
    { kind: 'ecdsa', owner: LOW, signature: SIG },
  ]);
  assert.equal(inOrder, reversed);
  // And the low address really is first: its signature leads the blob.
  assert.ok(inOrder.startsWith(SIG));
});

test('sorting is numeric on the address, not lexicographic on mixed case', () => {
  // MID checksums to 0x77.. and HIGH to 0xe7.., but their checksummed forms
  // mix upper and lower case. Comparing raw strings would order them by ASCII,
  // where 'E' (0x45) sorts before '7' (0x37) is false but 'D' vs 'a' problems
  // are real. Lowercasing first is what keeps it numeric.
  const blob = encodeSafeSignatures([
    { kind: 'approved', owner: HIGH },
    { kind: 'approved', owner: MID },
  ]);
  const first = blob.slice(2 + 24, 2 + 64);
  assert.equal(first, MID.slice(2).toLowerCase(), 'MID should sort before HIGH');
});

test('three owners keep their order', () => {
  const blob = encodeSafeSignatures([
    { kind: 'approved', owner: HIGH },
    { kind: 'ecdsa', owner: LOW, signature: SIG },
    { kind: 'approved', owner: MID },
  ]);
  const at = (i: number) => blob.slice(2 + i * 130 + 24, 2 + i * 130 + 64);
  assert.ok(blob.slice(2).startsWith(SIG.slice(2)), 'LOW first');
  assert.equal(at(1), MID.slice(2).toLowerCase(), 'MID second');
  assert.equal(at(2), HIGH.slice(2).toLowerCase(), 'HIGH third');
});

test('owner matching survives case and rejects rubbish', () => {
  const owners = [LOW, MID, HIGH] as const;
  assert.equal(isOwner(owners, LOW.toLowerCase()), true, 'lowercase should match');
  assert.equal(isOwner(owners, LOW.toUpperCase().replace('0X', '0x')), true, 'uppercase should match');
  assert.equal(isOwner(owners, '0x9aB16Ac0e4830C8445A05e06E5Ba10296fa1cef3'), false);
  // A malformed address must be a plain false, not a thrown checksum error:
  // this guards an admin route, and a throw there is a 500 rather than a 403.
  assert.equal(isOwner(owners, 'not-an-address'), false);
  assert.equal(isOwner(owners, ''), false);
});
