/// Who may hold a Karwan-signed identity wallet. On mainnet people hold their
/// own keys. The one exception is a WhatsApp account, whose owner chose a
/// chat-only account that trades under the escrow caps, and only while
/// CHAT_CUSTODY_ENABLED is on.
export function identityWalletAllowed(input: {
  testnet: boolean;
  purpose: 'email' | 'chat';
  chatCustodyEnabled: boolean;
}): boolean {
  if (input.testnet) return true;
  return input.purpose === 'chat' && input.chatCustodyEnabled;
}
