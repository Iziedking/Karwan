import type { ChatChannel } from './accounts.js';
import type { OutMessage } from './render.js';

interface ChannelPorts {
  /// Message an account by its Karwan address. False when this channel does
  /// not hold the account.
  toAddress: (address: string, message: OutMessage) => Promise<boolean>;
  /// One-time sign-in link to a page a chat account may open. Null when this
  /// channel does not hold the account.
  openLink: (address: string, path: string) => Promise<string | null>;
  /// Message a phone number with no account, such as an invited seller. Only
  /// a channel addressed by phone number has this.
  toNumber?: (number: string, message: OutMessage) => Promise<boolean>;
}

const channels = new Map<ChatChannel, ChannelPorts>();

/// Each channel installs its ports when it starts. Everything else reaches
/// chat through these and gets false or null when no channel holds the account.
export function installChannelPorts(channel: ChatChannel, ports: ChannelPorts): void {
  channels.set(channel, ports);
}

export async function tellAccount(address: string, message: OutMessage): Promise<boolean> {
  for (const ports of channels.values()) {
    if (await ports.toAddress(address, message)) return true;
  }
  return false;
}

export function messageNumber(number: string, message: OutMessage): Promise<boolean> {
  return channels.get('whatsapp')?.toNumber?.(number, message) ?? Promise.resolve(false);
}

export async function openLinkFor(address: string, path: string): Promise<string | null> {
  for (const ports of channels.values()) {
    const link = await ports.openLink(address, path);
    if (link) return link;
  }
  return null;
}
