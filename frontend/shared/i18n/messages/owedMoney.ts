/// Money owed to you, on the Money page (view 66). No contract or network is
/// named: a payment to the person could not be delivered, and it is kept for
/// them until they collect it.
export interface OwedMoneyCopy {
  title: string;
  amount: string;
  why: string;
  collect: string;
  sheet: { title: string; body: string; to: string; toValue: string; confirm: string };
  done: string;
  partly: string;
  failed: string;
  unreadable: string;
}

export const owedMoneyCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', OwedMoneyCopy> = {
  en: {
    title: 'Money owed to you',
    amount: '{amount} is waiting for you',
    why: 'A payment to you could not be delivered at the time. It is kept for you until you collect it.',
    collect: 'Collect',
    sheet: {
      title: 'Collect money owed to you',
      body: '{amount} goes to the wallet it was owed to.',
      to: 'To',
      toValue: 'The wallet it was owed to',
      confirm: 'Collect {amount}',
    },
    done: 'Collected. It is in your balance.',
    partly: 'Some of it was collected. Try again for the rest.',
    failed: 'It could not be collected right now. Nothing was lost. Try again in a minute.',
    unreadable: 'Part of what is owed to you could not be read just now.',
  },
  fr: {
    title: 'Argent qui vous est dû',
    amount: '{amount} vous attend',
    why: 'Un paiement à votre nom n’a pas pu être livré sur le moment. Il est gardé pour vous jusqu’à ce que vous le récupériez.',
    collect: 'Récupérer',
    sheet: {
      title: 'Récupérer l’argent qui vous est dû',
      body: '{amount} va au portefeuille auquel il était dû.',
      to: 'Vers',
      toValue: 'Le portefeuille auquel il était dû',
      confirm: 'Récupérer {amount}',
    },
    done: 'Récupéré. C’est dans votre solde.',
    partly: 'Une partie a été récupérée. Réessayez pour le reste.',
    failed: 'Impossible de le récupérer pour le moment. Rien n’est perdu. Réessayez dans une minute.',
    unreadable: 'Une partie de ce qui vous est dû n’a pas pu être lue pour le moment.',
  },
  ar: {
    title: 'أموال مستحقة لك',
    amount: '{amount} بانتظارك',
    why: 'تعذّر تسليم دفعة لك في حينها. وهي محفوظة لك حتى تستلمها.',
    collect: 'استلام',
    sheet: {
      title: 'استلام الأموال المستحقة لك',
      body: 'يذهب {amount} إلى المحفظة المستحقة له.',
      to: 'إلى',
      toValue: 'المحفظة المستحقة له',
      confirm: 'استلام {amount}',
    },
    done: 'تم الاستلام. المبلغ في رصيدك.',
    partly: 'تم استلام جزء منه. حاول مرة أخرى لاستلام الباقي.',
    failed: 'تعذّر الاستلام الآن. لم يضع شيء. حاول مرة أخرى بعد دقيقة.',
    unreadable: 'تعذّرت قراءة جزء مما هو مستحق لك الآن.',
  },
  hi: {
    title: 'आपको मिलने वाला पैसा',
    amount: '{amount} आपका इंतज़ार कर रहा है',
    why: 'आपको भेजा गया एक भुगतान उस समय पहुँच नहीं सका। यह आपके लिए तब तक रखा है जब तक आप इसे ले नहीं लेते।',
    collect: 'लें',
    sheet: {
      title: 'आपको मिलने वाला पैसा लें',
      body: '{amount} उसी वॉलेट में जाता है जिसके नाम यह था।',
      to: 'किसे',
      toValue: 'वह वॉलेट जिसके नाम यह था',
      confirm: '{amount} लें',
    },
    done: 'ले लिया गया। यह आपके बैलेंस में है।',
    partly: 'इसका कुछ हिस्सा लिया गया। बाकी के लिए फिर कोशिश करें।',
    failed: 'अभी यह नहीं लिया जा सका। कुछ भी खोया नहीं। एक मिनट में फिर कोशिश करें।',
    unreadable: 'आपको मिलने वाले पैसे का एक हिस्सा अभी पढ़ा नहीं जा सका।',
  },
  sw: {
    title: 'Pesa unazodaiwa',
    amount: '{amount} zinakusubiri',
    why: 'Malipo kwako hayakuweza kufika wakati huo. Yanahifadhiwa kwa ajili yako hadi uyachukue.',
    collect: 'Chukua',
    sheet: {
      title: 'Chukua pesa unazodaiwa',
      body: '{amount} zinaenda kwenye pochi iliyokuwa ikidaiwa.',
      to: 'Kwa',
      toValue: 'Pochi iliyokuwa ikidaiwa',
      confirm: 'Chukua {amount}',
    },
    done: 'Imechukuliwa. Iko kwenye salio lako.',
    partly: 'Sehemu imechukuliwa. Jaribu tena kwa iliyobaki.',
    failed: 'Haikuweza kuchukuliwa sasa hivi. Hakuna kilichopotea. Jaribu tena baada ya dakika moja.',
    unreadable: 'Sehemu ya unachodaiwa haikuweza kusomwa sasa hivi.',
  },
};
