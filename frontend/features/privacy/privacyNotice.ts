/// The privacy notice on /privacy (docs/architecture/39-start-to-home.md). It
/// is kept in English, which is the text that applies; other languages show a
/// line saying so. Every statement here must match what the product does: when
/// a store, a provider or a retention rule changes, this changes in the same
/// batch, with docs/terms-and-conditions.md section 8.

export const PRIVACY_UPDATED = '2026-10-29';

export interface PrivacySection {
  id: string;
  title: string;
  body?: string[];
  list?: Array<{ label: string; text: string }>;
}

export const PRIVACY_INTRO =
  'Karwan lets people trade with strangers and get paid safely, and builds a record of the deals they finish. This notice says what we keep about you to do that, why, who helps us run it, and what you can ask of us. It is written for the Nigeria Data Protection Act 2023 first, and for the same rights wherever you live.';

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'what-you-give',
    title: 'What you give us',
    list: [
      { label: 'To sign in', text: 'Your email address, or the address of the wallet you connect. Nothing else is needed to open an account.' },
      { label: 'Your tag', text: 'The Karwan tag you pick. It is public: clients find you and pay you by it.' },
      { label: 'What you tell your agent', text: 'What you do or sell, your usual price and delivery time, what you buy, your business name and the places you already work, whether you have clients, how we should reach you, and where you are. This sets up your agent and your public profile by itself. Only your country is ever shown to others.' },
      { label: 'What you add to deals', text: 'Requests, offers, messages, photos and files you add to listings, deliveries and disputes, and the ratings you give.' },
      { label: 'What you connect', text: 'Your Telegram account and your X handle, only if you connect them.' },
      { label: 'A business', text: 'The registration details you submit. A document you upload is hashed in your browser and only the hash reaches us.' },
    ],
  },
  {
    id: 'what-we-record',
    title: 'What we record as you use Karwan',
    list: [
      { label: 'Deals', text: 'Every deal, its amounts, its steps and who did each one. This is what your record is made of.' },
      { label: 'Your record', text: 'Settled deals, on-time deliveries, disputes and your deal guarantee. You see all of it. Others see your name, tag, tier and up to three plain reasons, never counts or amounts.' },
      { label: 'Conversations', text: 'What you say to the assistant and your agent, negotiation messages between agents, and support tickets, plus short notes the assistant keeps about what you discussed. You can delete those notes or switch them off in Settings.' },
      { label: 'Sign-in', text: 'A session cookie that keeps you signed in, and a cookie for your language. We use no advertising trackers.' },
    ],
  },
  {
    id: 'never',
    title: 'What we never keep',
    list: [
      { label: 'Wallet keys', text: 'Signing credentials for a wallet you connect never leave your device. For the wallet Karwan runs for you, signing is held in Circle’s infrastructure, not as a key anyone can copy out.' },
      { label: 'Cards and bank accounts', text: 'Where local currency access arrives, those details go to the licensed partner providing it, under its privacy notice.' },
    ],
  },
  {
    id: 'identity-checks',
    title: 'Identity checks',
    body: [
      'You never type your name, address or an ID number to use Karwan on testnet.',
      'On mainnet, some features need an identity check, for example local currency access. The check is run by a licensed partner at the moment you start that feature. The partner tells you what it needs and collects it under its own privacy notice. We keep the result of the check and only what the partner must share with us to meet the law.',
      'If you prove you are a person with World ID, we keep a one-way hash World ID gives us, never a photo or anything biometric.',
    ],
  },
  {
    id: 'on-chain',
    title: 'What is public on chain',
    body: [
      'Deals settle in USDC on Arc, a public blockchain. Wallet addresses, amounts and the time of each step are written there and anyone can read them. We cannot change or remove anything once it is on chain, and deleting your account does not remove it.',
    ],
  },
  {
    id: 'why',
    title: 'Why we use it',
    list: [
      { label: 'To run the deals you ask for', text: 'Holding money until a deal is done, paying it out, and showing both sides where it stands. This is the contract between us.' },
      { label: 'To build your record', text: 'Your record is the product you signed up for, so it is part of the same contract.' },
      { label: 'To keep people safe', text: 'Spotting fraud, settling disputes and keeping accounts secure. This is our legitimate interest, and yours.' },
      { label: 'Because the law says so', text: 'Identity checks where a feature needs them, and keeping records the law requires.' },
      { label: 'Only with your yes', text: 'Telegram and X, and news emails. You can turn each one off.' },
    ],
  },
  {
    id: 'who-helps',
    title: 'Who helps us run Karwan',
    body: ['These providers process data for us, only to do their part:'],
    list: [
      { label: 'Circle', text: 'Runs the wallet Karwan operates for you when you sign in with email.' },
      { label: 'Amazon Web Services', text: 'Our servers, the database and its encrypted backups, and some of the AI models.' },
      { label: 'Anthropic and OpenRouter', text: 'AI models that do your agent’s work, such as reading requests, writing offers and negotiating. What you say to the assistant goes only to Anthropic or to models on our own Amazon Web Services account.' },
      { label: 'Resend', text: 'Sends our emails.' },
      { label: 'Vercel', text: 'Serves the website.' },
      { label: 'Telegram, X and World', text: 'Only when you connect them or use them to prove something.' },
    ],
  },
  {
    id: 'how-long',
    title: 'How long we keep it',
    body: [
      'Until you delete your account. You can ask for that in Settings. It runs 7 days after you confirm, so a stolen phone cannot erase your record at once, and you can cancel in that time. It cannot run while you have an open deal, a live offer or request, or money in your balance.',
      'After deletion, the World ID hash is kept for one year so the same person cannot delete and return with a clean record. Anything on chain stays there.',
    ],
  },
  {
    id: 'your-rights',
    title: 'What you can ask of us',
    body: [
      'You can ask for a copy of what we hold about you, ask us to correct it, delete your account, object to a use, or take back a yes you gave. Ask through the assistant or at /feedback, or email the address listed on karwan.site under Contact. We answer within 30 days.',
      'If you are not happy with our answer, you can complain to the Nigeria Data Protection Commission, or to the data protection authority where you live.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes',
    body: ['When this notice changes in a way that matters, the date below changes and we tell you in the product before it applies.'],
  },
];
