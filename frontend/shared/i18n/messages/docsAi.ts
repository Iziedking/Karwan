/// The AI buttons under every docs title (view 48, batch 9j).
export interface DocsAiCopy {
  group: string;
  copy: string;
  copied: string;
  claude: string;
  claudeShort: string;
  chatgpt: string;
  chatgptShort: string;
  newTab: string;
  /// What the chat opens with. {url} is the docs page.
  prompt: string;
}

export const docsAiCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DocsAiCopy> = {
  en: {
    group: 'Read this page with AI',
    copy: 'Copy for AI',
    copied: 'Copied',
    claude: 'Ask Claude',
    claudeShort: 'Claude',
    chatgpt: 'Ask ChatGPT',
    chatgptShort: 'ChatGPT',
    newTab: 'opens in a new tab',
    prompt: 'Read {url} from the Karwan docs, then answer my questions about it.',
  },
  fr: {
    group: 'Lire cette page avec une IA',
    copy: 'Copier pour une IA',
    copied: 'Copié',
    claude: 'Demander à Claude',
    claudeShort: 'Claude',
    chatgpt: 'Demander à ChatGPT',
    chatgptShort: 'ChatGPT',
    newTab: "s'ouvre dans un nouvel onglet",
    prompt: 'Lis {url} dans la documentation de Karwan, puis réponds à mes questions à ce sujet.',
  },
  ar: {
    group: 'اقرأ هذه الصفحة مع الذكاء الاصطناعي',
    copy: 'نسخ للذكاء الاصطناعي',
    copied: 'تم النسخ',
    claude: 'اسأل Claude',
    claudeShort: 'Claude',
    chatgpt: 'اسأل ChatGPT',
    chatgptShort: 'ChatGPT',
    newTab: 'يفتح في علامة تبويب جديدة',
    prompt: 'اقرأ {url} من توثيق كاروان، ثم أجب عن أسئلتي حوله.',
  },
  hi: {
    group: 'इस पेज को AI के साथ पढ़ें',
    copy: 'AI के लिए कॉपी करें',
    copied: 'कॉपी हो गया',
    claude: 'Claude से पूछें',
    claudeShort: 'Claude',
    chatgpt: 'ChatGPT से पूछें',
    chatgptShort: 'ChatGPT',
    newTab: 'नए टैब में खुलता है',
    prompt: 'Karwan के डॉक्स से {url} पढ़ें, फिर उसके बारे में मेरे सवालों के जवाब दें।',
  },
  sw: {
    group: 'Soma ukurasa huu na AI',
    copy: 'Nakili kwa AI',
    copied: 'Imenakiliwa',
    claude: 'Uliza Claude',
    claudeShort: 'Claude',
    chatgpt: 'Uliza ChatGPT',
    chatgptShort: 'ChatGPT',
    newTab: 'inafunguka kwenye kichupo kipya',
    prompt: 'Soma {url} kwenye nyaraka za Karwan, kisha ujibu maswali yangu kuihusu.',
  },
};

const ASK_AT = { claude: 'https://claude.ai/new', chatgpt: 'https://chatgpt.com/' } as const;

/// The chat link, opened with the prompt already typed in.
export function askUrl(where: keyof typeof ASK_AT, prompt: string): string {
  const url = new URL(ASK_AT[where]);
  url.searchParams.set('q', prompt);
  return url.toString();
}
