import type { OutMessage } from './render.js';

interface ChatPorts {
  /// Message an account by its Karwan address. False when it has no number.
  toAddress: (address: string, message: OutMessage) => Promise<boolean>;
  /// Message any WhatsApp number, such as a past client with no account.
  toNumber: (number: string, message: OutMessage) => Promise<boolean>;
  /// One-time sign-in link to a page a chat account may open.
  openLink: (address: string, path: string) => Promise<string | null>;
}

let ports: ChatPorts | null = null;

/// The WhatsApp agent installs these when it starts. Everything else reaches
/// chat through them and gets false or null when the agent is off.
export function installChatPorts(p: ChatPorts): void {
  ports = p;
}

export function tellAccount(address: string, message: OutMessage): Promise<boolean> {
  return ports ? ports.toAddress(address, message) : Promise.resolve(false);
}

export function messageNumber(number: string, message: OutMessage): Promise<boolean> {
  return ports ? ports.toNumber(number, message) : Promise.resolve(false);
}

export function openLinkFor(address: string, path: string): Promise<string | null> {
  return ports ? ports.openLink(address, path) : Promise.resolve(null);
}
