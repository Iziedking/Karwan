import type { OutMessage } from '../channels/render.js';
import type { SavedAddress } from './store.js';

/// Chat buttons for the person's own money controls. Neither moves money, so
/// they are allowed in chat.
export const PAUSE_ID = 'mo:pause';
export const REMOVE_PREFIX = 'mo:rm:';
export const removeId = (addressId: string) => `${REMOVE_PREFIX}${addressId}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortAddress(address: string): string {
  const head = address.startsWith('0x') ? 6 : 4;
  return `${address.slice(0, head)}…${address.slice(-4)}`;
}

const chainName = (chain: string) => chain.charAt(0).toUpperCase() + chain.slice(1);

function utc(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

export function addressAddedMessage(saved: SavedAddress): OutMessage {
  return {
    kind: 'buttons',
    body:
      `You added ${shortAddress(saved.address)} on ${chainName(saved.chain)} as an address to send money to. ` +
      `It can receive money from ${utc(saved.opensAt)}.\n\n` +
      'Not you? Tap Remove, or pause every payment out of your account.',
    buttons: [
      { id: removeId(saved.id), title: 'Remove' },
      { id: PAUSE_ID, title: 'Pause my money' },
    ],
  };
}
