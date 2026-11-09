import type { UserLocale } from '../db/profiles.js';

/// Tiny translation table for the highest-traffic Telegram event copy. Falls
/// back to English when the user has no locale set or when a key is missing
/// from the chosen locale. This is intentionally a thin slice; the full Phase
/// 2 i18n pass extends every notifier branch to read from this table.
///
/// To add a key: extend the English block with the new copy, then add the
/// translated string to each non-English locale.

type TgKey =
  | 'cancelProposedFromOther.mutual'
  | 'cancelProposedFromOther.platform'
  | 'cancelProposedFromSelf'
  | 'cancelDeclinedToProposer'
  | 'cancelDeclinedBySelf'
  | 'milestoneReleasedToSeller.first'
  | 'milestoneReleasedToSeller.final'
  | 'milestoneReleasedToBuyer.first'
  | 'milestoneReleasedToBuyer.final'
  | 'bidAcceptedToSeller'
  | 'bidAcceptedToBuyer'
  | 'reputationRecordedSuccessSeller'
  | 'reputationRecordedSuccessBuyer'
  | 'dealCancelled'
  | 'dealDeliveredToBuyer'
  | 'dealDeliveredToSeller'
  | 'openInKarwan'
  | 'researchFailed'
  | 'researchFailedPaid'
  | 'insight.testnetBudget'
  | 'insight.missedByPrice'
  | 'insight.budgetBelowBand'
  | 'insight.cheaperBetterSellers'
  | 'insight.slowRequest'
  | 'insight.heading'
  | 'insight.questions'
  | 'mandate.sellWork'
  | 'mandate.sellGoods'
  | 'mandate.sellDeposit'
  | 'mandate.sellHourly'
  | 'mandate.sellMonthly'
  | 'mandate.sellNone'
  | 'mandate.buy'
  | 'mandate.alone.offers'
  | 'mandate.alone.ask'
  | 'mandate.alone.agree'
  | 'mandate.weeklyLimit'
  | 'mandate.watchesOne'
  | 'mandate.watches'
  | 'mandate.goals'
  | 'mandate.brief'
  | 'mandate.briefOff'
  | 'mandate.quiet'
  | 'mandate.quietOff'
  | 'mandate.refuse.noWay'
  | 'mandate.refuse.price'
  | 'mandate.refuse.lowestAboveUsual'
  | 'mandate.refuse.mode'
  | 'mandate.refuse.limit'
  | 'mandate.refuse.goals'
  | 'mandate.refuse.goalText'
  | 'mandate.refuse.noGoal'
  | 'mandate.refuse.hour'
  | 'mandate.refuse.timeZone'
  | 'effect.reopens'
  | 'effect.reopensOne'
  | 'effect.buyMostAboveOne'
  | 'effect.newLowest'
  | 'effect.limitUp'
  | 'effect.limitZero'
  | 'effect.limitDown'
  | 'effect.buyMost'
  | 'effect.buyMostAbove'
  | 'effect.goalAdd'
  | 'effect.goalRemove'
  | 'effect.briefOff'
  | 'effect.briefToday'
  | 'effect.briefTomorrow'
  | 'effect.quiet'
  | 'effect.quietOff'
  | 'replan.done'
  | 'replan.reopened'
  | 'replan.reopenedOne'
  | 'replan.reopenedNone'
  | 'replan.askClosed'
  | 'replan.failed'
  | 'brief.heading'
  | 'brief.offers'
  | 'brief.offersOne'
  | 'brief.questions'
  | 'brief.questionsOne'
  | 'brief.questionsWaiting'
  | 'brief.goalBuy'
  | 'brief.goalBuyOne'
  | 'brief.goalBuyNone'
  | 'brief.goalSell'
  | 'brief.goalSellOne'
  | 'brief.goalWatch'
  | 'brief.goalWatchOne'
  | 'brief.goalExpired'
  | 'brief.goalNothing'
  | 'brief.dealsWaiting'
  | 'brief.dealsWaitingOne'
  | 'brief.open'
  | 'note.heading'
  | 'alert.headingNear'
  | 'alert.heading'
  | 'alert.reminderNear'
  | 'alert.reminder'
  | 'alert.budget'
  | 'alert.by'
  | 'alert.nearby'
  | 'alert.km'
  | 'alert.city'
  | 'alert.open'
  | 'alert.thanks';

const en: Record<TgKey, string> = {
  'cancelProposedFromOther.mutual':
    '*The {role} is proposing to cancel this deal* (mutual). Open the deal to accept or decline.',
  'cancelProposedFromOther.platform':
    '*The {role} flagged this deal as a platform misroute*. Open the deal to accept or decline.',
  'cancelProposedFromSelf':
    '*Cancellation proposed*. Waiting on the other party to accept or decline.',
  'cancelDeclinedToProposer':
    '*Your cancellation proposal was declined*. The deal continues as normal.',
  'cancelDeclinedBySelf':
    '*You declined the cancellation proposal*. The deal continues as normal.',
  'milestoneReleasedToSeller.first':
    '*First milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToSeller.final':
    '*Final milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToBuyer.first': '*First milestone released* to the seller.',
  'milestoneReleasedToBuyer.final': '*Final milestone released* to the seller.',
  'bidAcceptedToSeller':
    "*Your bid was accepted*. Escrow funds next; you'll get another note when it lands.",
  'bidAcceptedToBuyer': '*Bid accepted*. Escrow is being funded.',
  'reputationRecordedSuccessSeller':
    '*Reputation updated on chain* for a successful settlement. View your passport for the new score.',
  'reputationRecordedSuccessBuyer':
    '*Reputation recorded on chain* for a successful settlement.',
  'dealCancelled': '*Deal cancelled*.',
  'dealDeliveredToBuyer':
    '*Seller marked the work delivered*. Open the deal to verify and release.',
  'dealDeliveredToSeller':
    '*You marked the deal delivered*. The buyer review window is open.',
  'openInKarwan': 'Open in Karwan',
  'insight.questions': "Your agent asked you {asked} questions: you answered {answered}, and {byDefault} went its stated way with no answer.",
  'insight.testnetBudget': "*{title}*: this is the test network, where deals settled at {low} to {high} USDC. Lower your budget from {budget} to {suggested} USDC to land a deal faster.",
  'insight.missedByPrice': "You missed {count} requests this week because your lowest price, {lowest} USDC, was above what buyers offered. They offered around {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: deals like this settled at {low} to {high} USDC. Your budget is {budget} USDC; {low} USDC would reach more sellers.",
  'insight.cheaperBetterSellers': "*{title}*: {count} sellers with a record as good as this one charge less than {price} USDC, from {lowest} USDC.",
  'insight.slowRequest': "*{title}* has had no offer for a day. Sellers on similar requests asked for about {usualDays} days; yours allows {days}.",
  'insight.heading': "*What your agent sees:*",
  'researchFailed': "*Research for {title} didn't finish.* Your agent carried on with Karwan's own prices.",
  'researchFailedPaid': "*Research for {title} didn't finish*, and {amount} USDC was spent on it. Your agent carried on with Karwan's own prices.",
  'mandate.sellWork': 'Your agent sells work from {lowest} USDC (usually {usual}), in {min} to {max} days.',
  'mandate.sellGoods': 'Your agent sells {what} from {lowest} USDC (usually {usual}).',
  'mandate.sellDeposit': 'Your agent rents out {what} for a {lowest} USDC deposit.',
  'mandate.sellHourly': 'Your agent takes hourly work from {lowest} USDC an hour (usually {usual}), up to {hours} hours.',
  'mandate.sellMonthly': 'Your agent takes monthly work from {lowest} USDC a month (usually {usual}).',
  'mandate.sellNone': 'Your agent is not selling anything yet.',
  'mandate.buy': 'When you buy, it spends up to {most} USDC a request.',
  'mandate.alone.offers': 'It makes offers on its own and asks you before any deal.',
  'mandate.alone.ask': 'It asks you about every fitting request first.',
  'mandate.alone.agree': "It may agree to a buyer's price inside your limits on its own.",
  'mandate.weeklyLimit': 'It may spend up to {usdc} USDC a week on record checks and research.',
  'mandate.watchesOne': 'It watches {count} market for you.',
  'mandate.watches': 'It watches {count} markets for you.',
  'mandate.goals': 'Your goals: {list}.',
  'mandate.brief': 'Your brief comes at {hour}:00, {zone} time.',
  'mandate.briefOff': 'Your daily brief is off.',
  'mandate.quiet': 'Quiet hours: {from}:00 to {to}:00.',
  'mandate.quietOff': 'Quiet hours are off.',
  'mandate.refuse.noWay': "You don't sell that way yet. Add it in your setup first.",
  'mandate.refuse.price': 'Use a price above 0 USDC.',
  'mandate.refuse.lowestAboveUsual': "Your lowest price can't be above your usual price.",
  'mandate.refuse.mode': 'Pick make offers, ask first, or agree for me.',
  'mandate.refuse.limit': 'The weekly limit can be 0 to 5 USDC.',
  'mandate.refuse.goals': 'Your agent can pursue up to five goals. Remove one first.',
  'mandate.refuse.goalText': 'Say the goal in a few words, and up to a year ahead.',
  'mandate.refuse.noGoal': 'That goal is not on your list.',
  'mandate.refuse.hour': 'Pick hours from 0 to 23, and two different ones for quiet hours.',
  'mandate.refuse.timeZone': "I don't know that time zone. Try a city, like Africa/Lagos.",
  'effect.reopens': 'Lowering your lowest to {lowest} USDC re-opens {count} requests you passed on this week.',
  'effect.reopensOne': 'Lowering your lowest to {lowest} USDC re-opens 1 request you passed on this week.',
  'effect.buyMostAboveOne': 'New requests will spend up to {most} USDC. 1 of your open requests asks for more; its budget stays until you post it again.',
  'effect.newLowest': 'Your agent will take {lowest} USDC as your lowest price from now on.',
  'effect.limitUp': 'Raising your weekly limit lets your agent check about {count} more records a week.',
  'effect.limitZero': 'Your agent will make no paid checks.',
  'effect.limitDown': 'Your agent will stop paid checks once it has spent {usdc} USDC in a week.',
  'effect.buyMost': 'New requests will spend up to {most} USDC.',
  'effect.buyMostAbove': 'New requests will spend up to {most} USDC. {above} of your open requests ask for more; their budget stays until you post them again.',
  'effect.goalAdd': 'Your agent will report on this goal in every brief: {text}.',
  'effect.goalRemove': 'Your agent will stop pursuing that goal.',
  'effect.briefOff': 'Your agent will not send a daily brief.',
  'effect.briefToday': 'Your next brief comes today at {hour}:00, {zone} time.',
  'effect.briefTomorrow': 'Your next brief comes tomorrow at {hour}:00, {zone} time.',
  'effect.quiet': 'From {from}:00 to {to}:00 your agent holds its notes for the morning brief.',
  'effect.quietOff': 'Your agent may send notes at any hour.',
  'replan.done': 'Done. Your agent works this way from now on.',
  'replan.reopened': 'Done. Your agent looked again at {judged} of the requests you passed on, now at {lowest} USDC, and {offered} became offers.',
  'replan.reopenedOne': 'Done. Your agent looked again at {judged} of the requests you passed on, now at {lowest} USDC, and 1 became an offer.',
  'replan.reopenedNone': 'Done. Your agent looked again at {judged} of the requests you passed on, now at {lowest} USDC. None became an offer yet.',
  'replan.askClosed': 'Done. Your agent closed the questions it no longer needs ({count}) and is looking at those requests again.',
  'replan.failed': 'Saved. Your agent is still re-checking your requests and finishes on its next sweep.',
  'brief.heading': 'Your morning brief',
  'brief.offers': '{title}: {count} new offers, the best {best} USDC.',
  'brief.offersOne': '{title}: 1 new offer, {best} USDC.',
  'brief.questions': '{count} questions are waiting on you; the first decides itself at {time}.',
  'brief.questionsOne': '1 question is waiting on you; it decides itself at {time}.',
  'brief.questionsWaiting': 'Questions waiting on you: {count}.',
  'brief.goalBuy': 'Your goal, {text}: {offers} offers in, the best {best} USDC, due {date}.',
  'brief.goalBuyOne': 'Your goal, {text}: 1 offer in, {best} USDC, due {date}.',
  'brief.goalBuyNone': 'Your goal, {text}: no offers yet, due {date}.',
  'brief.goalSell': 'Your goal, {text}: {fits} requests fit, and your agent offered on {offered}.',
  'brief.goalSellOne': 'Your goal, {text}: 1 request fits, and your agent offered on {offered}.',
  'brief.goalWatch': 'Your goal, {text}: {count} new requests in the markets you watch.',
  'brief.goalWatchOne': 'Your goal, {text}: 1 new request in the markets you watch.',
  'brief.goalExpired': 'Your goal, {text}, reached its end date and is closed.',
  'brief.goalNothing': 'Your goal, {text}: no fitting requests yet.',
  'brief.dealsWaiting': '{count} deals are waiting on you.',
  'brief.dealsWaitingOne': '1 deal is waiting on you.',
  'brief.open': 'Open Karwan',
  'note.heading': 'Your agent noticed',
  'alert.headingNear': 'Someone near you needs your work',
  'alert.heading': 'Someone needs your work',
  'alert.reminderNear': 'Reminder: someone near you needs your work',
  'alert.reminder': 'Reminder: someone needs your work',
  'alert.budget': 'Budget about {amount}',
  'alert.by': 'By {day}',
  'alert.nearby': 'Very close to you',
  'alert.km': 'About {km} km from you',
  'alert.city': 'In {city}',
  'alert.open': 'Open it to send your price, or say no thanks.',
  'alert.thanks': 'Thanks. They have found someone. We will tell you about the next one.',
};

const ar: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} يقترح إلغاء هذه الصفقة* (بالتراضي). افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromOther.platform':
    '*{role} أبلغ عن هذه الصفقة كخطأ توجيه من المنصة*. افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromSelf':
    '*تم اقتراح الإلغاء*. في انتظار الطرف الآخر للقبول أو الرفض.',
  'cancelDeclinedToProposer':
    '*تم رفض اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'cancelDeclinedBySelf':
    '*لقد رفضت اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'milestoneReleasedToSeller.first':
    '*تم الإفراج عن المرحلة الأولى*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToSeller.final':
    '*تم الإفراج عن المرحلة النهائية*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToBuyer.first': '*تم الإفراج عن المرحلة الأولى* إلى البائع.',
  'milestoneReleasedToBuyer.final': '*تم الإفراج عن المرحلة النهائية* إلى البائع.',
  'bidAcceptedToSeller':
    '*تم قبول عرضك*. تمويل الضمان قادم؛ ستصلك ملاحظة أخرى عند اكتماله.',
  'bidAcceptedToBuyer': '*تم قبول العرض*. يتم تمويل الضمان الآن.',
  'reputationRecordedSuccessSeller':
    '*تم تحديث السمعة على السلسلة* لتسوية ناجحة. اطّلع على جواز السمعة للنتيجة الجديدة.',
  'reputationRecordedSuccessBuyer':
    '*تم تسجيل السمعة على السلسلة* لتسوية ناجحة.',
  'dealCancelled': '*تم إلغاء الصفقة*.',
  'dealDeliveredToBuyer':
    '*وضع البائع علامة تم التسليم*. افتح الصفقة للتحقق والإفراج.',
  'dealDeliveredToSeller':
    '*لقد علّمت الصفقة كتم التسليم*. نافذة مراجعة المشتري مفتوحة.',
  'openInKarwan': 'افتح في كروان',
  'insight.questions': "طرح عليك وكيلك {asked} أسئلة: أجبت عن {answered}، و{byDefault} مضت كما أُعلن دون إجابة.",
  'insight.testnetBudget': "*{title}*: هذه شبكة الاختبار، وقد أُبرمت الصفقات فيها بين {low} و{high} USDC. خفّض ميزانيتك من {budget} إلى {suggested} USDC لتُبرم صفقة أسرع.",
  'insight.missedByPrice': "فاتتك {count} طلبات هذا الأسبوع لأن أدنى سعر لديك، {lowest} USDC، كان أعلى مما عرضه المشترون. عرضوا نحو {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: أُبرمت صفقات مثل هذه بين {low} و{high} USDC. ميزانيتك {budget} USDC؛ و{low} USDC ستصل إلى بائعين أكثر.",
  'insight.cheaperBetterSellers': "*{title}*: {count} بائعين بسجل لا يقل عن هذا يطلبون أقل من {price} USDC، بدءًا من {lowest} USDC.",
  'insight.slowRequest': "*{title}* لم يتلقَّ أي عرض منذ يوم. طلب البائعون في طلبات مشابهة نحو {usualDays} أيام؛ وطلبك يسمح بـ{days}.",
  'insight.heading': "*ما يراه وكيلك:*",
  'researchFailed': "*لم يكتمل البحث عن {title}.* واصل وكيلك بأسعار كروان نفسها.",
  'researchFailedPaid': "*لم يكتمل البحث عن {title}*، وأُنفق عليه {amount} USDC. واصل وكيلك بأسعار كروان نفسها.",
  'mandate.sellWork': 'يبيع وكيلك العمل بدءًا من {lowest} USDC (عادةً {usual})، خلال {min} إلى {max} أيام.',
  'mandate.sellGoods': 'يبيع وكيلك {what} بدءًا من {lowest} USDC (عادةً {usual}).',
  'mandate.sellDeposit': 'يؤجّر وكيلك {what} مقابل تأمين قدره {lowest} USDC.',
  'mandate.sellHourly': 'يقبل وكيلك عملًا بالساعة بدءًا من {lowest} USDC للساعة (عادةً {usual})، حتى {hours} ساعات.',
  'mandate.sellMonthly': 'يقبل وكيلك عملًا شهريًا بدءًا من {lowest} USDC للشهر (عادةً {usual}).',
  'mandate.sellNone': 'لا يبيع وكيلك شيئًا بعد.',
  'mandate.buy': 'عندما تشتري، ينفق حتى {most} USDC للطلب الواحد.',
  'mandate.alone.offers': 'يقدّم العروض وحده ويسألك قبل أي صفقة.',
  'mandate.alone.ask': 'يسألك أولًا عن كل طلب مناسب.',
  'mandate.alone.agree': 'يمكنه الموافقة على سعر المشتري ضمن حدودك وحده.',
  'mandate.weeklyLimit': 'يمكنه إنفاق حتى {usdc} USDC أسبوعيًا على فحص السجلات والبحث.',
  'mandate.watchesOne': 'يراقب لك {count} سوقًا.',
  'mandate.watches': 'يراقب لك {count} أسواق.',
  'mandate.goals': 'أهدافك: {list}.',
  'mandate.brief': 'يصلك ملخصك الساعة {hour}:00 بتوقيت {zone}.',
  'mandate.briefOff': 'ملخصك اليومي متوقف.',
  'mandate.quiet': 'ساعات الهدوء: من {from}:00 إلى {to}:00.',
  'mandate.quietOff': 'ساعات الهدوء متوقفة.',
  'mandate.refuse.noWay': 'أنت لا تبيع بهذه الطريقة بعد. أضفها في الإعداد أولًا.',
  'mandate.refuse.price': 'استخدم سعرًا أعلى من 0 USDC.',
  'mandate.refuse.lowestAboveUsual': 'لا يمكن أن يكون أدنى سعر لديك أعلى من سعرك المعتاد.',
  'mandate.refuse.mode': 'اختر: يقدّم العروض، أو يسأل أولًا، أو يوافق عني.',
  'mandate.refuse.limit': 'يمكن أن يكون الحد الأسبوعي من 0 إلى 5 USDC.',
  'mandate.refuse.goals': 'يمكن لوكيلك متابعة خمسة أهداف كحد أقصى. احذف واحدًا أولًا.',
  'mandate.refuse.goalText': 'اذكر الهدف في كلمات قليلة، ولمدة لا تتجاوز سنة.',
  'mandate.refuse.noGoal': 'هذا الهدف ليس في قائمتك.',
  'mandate.refuse.hour': 'اختر ساعات من 0 إلى 23، وساعتين مختلفتين لساعات الهدوء.',
  'mandate.refuse.timeZone': 'لا أعرف هذه المنطقة الزمنية. جرّب مدينة، مثل Africa/Lagos.',
  'effect.reopens': 'خفض أدنى سعر لديك إلى {lowest} USDC يعيد فتح {count} طلبات تجاوزتها هذا الأسبوع.',
  'effect.reopensOne': 'خفض أدنى سعر لديك إلى {lowest} USDC يعيد فتح طلب واحد تجاوزته هذا الأسبوع.',
  'effect.buyMostAboveOne': 'ستنفق الطلبات الجديدة حتى {most} USDC. أحد طلباتك المفتوحة يطلب أكثر؛ تبقى ميزانيته حتى تنشره من جديد.',
  'effect.newLowest': 'سيعتمد وكيلك {lowest} USDC أدنى سعر لك من الآن.',
  'effect.limitUp': 'رفع حدك الأسبوعي يتيح لوكيلك فحص نحو {count} سجلًا إضافيًا في الأسبوع.',
  'effect.limitZero': 'لن يجري وكيلك أي فحص مدفوع.',
  'effect.limitDown': 'سيتوقف وكيلك عن الفحوص المدفوعة بعد إنفاق {usdc} USDC في الأسبوع.',
  'effect.buyMost': 'ستنفق الطلبات الجديدة حتى {most} USDC.',
  'effect.buyMostAbove': 'ستنفق الطلبات الجديدة حتى {most} USDC. {above} من طلباتك المفتوحة تطلب أكثر؛ تبقى ميزانيتها حتى تنشرها من جديد.',
  'effect.goalAdd': 'سيخبرك وكيلك عن هذا الهدف في كل ملخص: {text}.',
  'effect.goalRemove': 'سيتوقف وكيلك عن متابعة هذا الهدف.',
  'effect.briefOff': 'لن يرسل وكيلك ملخصًا يوميًا.',
  'effect.briefToday': 'يصلك ملخصك التالي اليوم الساعة {hour}:00 بتوقيت {zone}.',
  'effect.briefTomorrow': 'يصلك ملخصك التالي غدًا الساعة {hour}:00 بتوقيت {zone}.',
  'effect.quiet': 'من {from}:00 إلى {to}:00 يحتفظ وكيلك بملاحظاته لملخص الصباح.',
  'effect.quietOff': 'يمكن لوكيلك إرسال الملاحظات في أي ساعة.',
  'replan.done': 'تم. يعمل وكيلك بهذه الطريقة من الآن.',
  'replan.reopened': 'تم. أعاد وكيلك النظر في {judged} من الطلبات التي تجاوزتها، الآن بسعر {lowest} USDC، وصار {offered} منها عروضًا.',
  'replan.reopenedOne': 'تم. أعاد وكيلك النظر في {judged} من الطلبات التي تجاوزتها، الآن بسعر {lowest} USDC، وصار واحد منها عرضًا.',
  'replan.reopenedNone': 'تم. أعاد وكيلك النظر في {judged} من الطلبات التي تجاوزتها، الآن بسعر {lowest} USDC. لم يصر أي منها عرضًا بعد.',
  'replan.askClosed': 'تم. أغلق وكيلك الأسئلة التي لم يعد يحتاجها ({count}) ويعيد النظر في تلك الطلبات.',
  'replan.failed': 'تم الحفظ. ما زال وكيلك يعيد فحص طلباتك وينتهي في جولته التالية.',
  'brief.heading': 'ملخصك الصباحي',
  'brief.offers': '{title}: {count} عروض جديدة، أفضلها {best} USDC.',
  'brief.offersOne': '{title}: عرض جديد واحد، {best} USDC.',
  'brief.questions': '{count} أسئلة بانتظارك؛ أولها يُحسم وحده الساعة {time}.',
  'brief.questionsOne': 'سؤال واحد بانتظارك؛ يُحسم وحده الساعة {time}.',
  'brief.questionsWaiting': 'أسئلة بانتظارك: {count}.',
  'brief.goalBuy': 'هدفك، {text}: وصلت {offers} عروض، أفضلها {best} USDC، الموعد {date}.',
  'brief.goalBuyOne': 'هدفك، {text}: وصل عرض واحد، {best} USDC، الموعد {date}.',
  'brief.goalBuyNone': 'هدفك، {text}: لا عروض بعد، الموعد {date}.',
  'brief.goalSell': 'هدفك، {text}: {fits} طلبات مناسبة، وقدّم وكيلك عرضًا على {offered}.',
  'brief.goalSellOne': 'هدفك، {text}: طلب واحد مناسب، وقدّم وكيلك عرضًا على {offered}.',
  'brief.goalWatch': 'هدفك، {text}: {count} طلبات جديدة في الأسواق التي تراقبها.',
  'brief.goalWatchOne': 'هدفك، {text}: طلب جديد واحد في الأسواق التي تراقبها.',
  'brief.goalExpired': 'هدفك، {text}، بلغ موعد نهايته وأُغلق.',
  'brief.goalNothing': 'هدفك، {text}: لا طلبات مناسبة بعد.',
  'brief.dealsWaiting': '{count} صفقات بانتظارك.',
  'brief.dealsWaitingOne': 'صفقة واحدة بانتظارك.',
  'brief.open': 'افتح كروان',
  'note.heading': 'لاحظ وكيلك',
  'alert.headingNear': 'شخص قريب منك يحتاج إلى عملك',
  'alert.heading': 'شخص يحتاج إلى عملك',
  'alert.reminderNear': 'تذكير: شخص قريب منك يحتاج إلى عملك',
  'alert.reminder': 'تذكير: شخص يحتاج إلى عملك',
  'alert.budget': 'الميزانية حوالي {amount}',
  'alert.by': 'بحلول {day}',
  'alert.nearby': 'قريب جدًا منك',
  'alert.km': 'على بعد حوالي {km} كم منك',
  'alert.city': 'في {city}',
  'alert.open': 'افتحه لترسل سعرك، أو قل لا شكرًا.',
  'alert.thanks': 'شكرًا. وجد هذا الشخص من يساعده. سنخبرك بالطلب التالي.',
};

const fr: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*Le/la {role} propose d'annuler cette transaction* (mutuel). Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromOther.platform':
    "*Le/la {role} a signalé cette transaction comme une erreur de la plateforme*. Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromSelf':
    "*Annulation proposée*. En attente de la décision de l'autre partie.",
  'cancelDeclinedToProposer':
    "*Votre proposition d'annulation a été refusée*. La transaction se poursuit normalement.",
  'cancelDeclinedBySelf':
    "*Vous avez refusé la proposition d'annulation*. La transaction se poursuit normalement.",
  'milestoneReleasedToSeller.first':
    '*Première étape libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToSeller.final':
    '*Étape finale libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToBuyer.first': '*Première étape libérée* au vendeur.',
  'milestoneReleasedToBuyer.final': '*Étape finale libérée* au vendeur.',
  'bidAcceptedToSeller':
    "*Votre offre a été acceptée*. Le séquestre se finance ensuite; vous recevrez un autre message.",
  'bidAcceptedToBuyer': "*Offre acceptée*. Le séquestre est en cours de financement.",
  'reputationRecordedSuccessSeller':
    '*Réputation mise à jour on-chain* pour un règlement réussi. Consultez votre passeport.',
  'reputationRecordedSuccessBuyer':
    '*Réputation enregistrée on-chain* pour un règlement réussi.',
  'dealCancelled': '*Transaction annulée*.',
  'dealDeliveredToBuyer':
    "*Le vendeur a marqué le travail comme livré*. Ouvrez la transaction pour vérifier et libérer.",
  'dealDeliveredToSeller':
    "*Vous avez marqué la transaction comme livrée*. La fenêtre d'examen acheteur est ouverte.",
  'openInKarwan': 'Ouvrir dans Karwan',
  'insight.questions': "Votre agent vous a posé {asked} questions : vous avez répondu à {answered}, et {byDefault} ont suivi la réponse annoncée faute de réponse.",
  'insight.testnetBudget': "*{title}* : c'est le réseau de test, où les transactions se sont conclues entre {low} et {high} USDC. Baissez votre budget de {budget} à {suggested} USDC pour conclure plus vite.",
  'insight.missedByPrice': "Vous avez manqué {count} demandes cette semaine car votre prix le plus bas, {lowest} USDC, dépassait ce que les acheteurs proposaient. Ils proposaient environ {median} USDC.",
  'insight.budgetBelowBand': "*{title}* : les transactions de ce type se sont conclues entre {low} et {high} USDC. Votre budget est de {budget} USDC ; {low} USDC toucherait plus de vendeurs.",
  'insight.cheaperBetterSellers': "*{title}* : {count} vendeurs avec un historique aussi bon demandent moins de {price} USDC, à partir de {lowest} USDC.",
  'insight.slowRequest': "*{title}* n'a reçu aucune offre depuis un jour. Pour des demandes similaires, les vendeurs ont demandé environ {usualDays} jours ; la vôtre en laisse {days}.",
  'insight.heading': "*Ce que voit votre agent :*",
  'researchFailed': "*La recherche pour {title} n'a pas abouti.* Votre agent a continué avec les prix de Karwan.",
  'researchFailedPaid': "*La recherche pour {title} n'a pas abouti*, et {amount} USDC y ont été dépensés. Votre agent a continué avec les prix de Karwan.",
  'mandate.sellWork': 'Votre agent vend du travail à partir de {lowest} USDC (habituellement {usual}), en {min} à {max} jours.',
  'mandate.sellGoods': 'Votre agent vend {what} à partir de {lowest} USDC (habituellement {usual}).',
  'mandate.sellDeposit': 'Votre agent loue {what} contre un dépôt de {lowest} USDC.',
  'mandate.sellHourly': "Votre agent accepte du travail à l'heure à partir de {lowest} USDC de l'heure (habituellement {usual}), jusqu'à {hours} heures.",
  'mandate.sellMonthly': 'Votre agent accepte du travail au mois à partir de {lowest} USDC par mois (habituellement {usual}).',
  'mandate.sellNone': 'Votre agent ne vend encore rien.',
  'mandate.buy': "Quand vous achetez, il dépense jusqu'à {most} USDC par demande.",
  'mandate.alone.offers': 'Il fait des offres seul et vous demande avant toute transaction.',
  'mandate.alone.ask': "Il vous demande d'abord pour chaque demande qui convient.",
  'mandate.alone.agree': "Il peut accepter seul le prix d'un acheteur dans vos limites.",
  'mandate.weeklyLimit': "Il peut dépenser jusqu'à {usdc} USDC par semaine en vérifications d'historique et en recherche.",
  'mandate.watchesOne': 'Il surveille {count} marché pour vous.',
  'mandate.watches': 'Il surveille {count} marchés pour vous.',
  'mandate.goals': 'Vos objectifs : {list}.',
  'mandate.brief': 'Votre résumé arrive à {hour}:00, heure de {zone}.',
  'mandate.briefOff': 'Votre résumé quotidien est désactivé.',
  'mandate.quiet': 'Heures calmes : de {from}:00 à {to}:00.',
  'mandate.quietOff': 'Les heures calmes sont désactivées.',
  'mandate.refuse.noWay': "Vous ne vendez pas encore de cette façon. Ajoutez-la d'abord dans votre configuration.",
  'mandate.refuse.price': 'Indiquez un prix supérieur à 0 USDC.',
  'mandate.refuse.lowestAboveUsual': 'Votre prix le plus bas ne peut pas dépasser votre prix habituel.',
  'mandate.refuse.mode': "Choisissez faire des offres, demander d'abord, ou accepter pour moi.",
  'mandate.refuse.limit': 'La limite hebdomadaire va de 0 à 5 USDC.',
  'mandate.refuse.goals': "Votre agent peut suivre jusqu'à cinq objectifs. Retirez-en un d'abord.",
  'mandate.refuse.goalText': "Dites l'objectif en quelques mots, et pour un an au plus.",
  'mandate.refuse.noGoal': "Cet objectif n'est pas dans votre liste.",
  'mandate.refuse.hour': 'Choisissez des heures de 0 à 23, et deux heures différentes pour les heures calmes.',
  'mandate.refuse.timeZone': 'Je ne connais pas ce fuseau horaire. Essayez une ville, comme Africa/Lagos.',
  'effect.reopens': 'Baisser votre prix le plus bas à {lowest} USDC rouvre {count} demandes écartées cette semaine.',
  'effect.reopensOne': 'Baisser votre prix le plus bas à {lowest} USDC rouvre 1 demande écartée cette semaine.',
  'effect.buyMostAboveOne': "Les nouvelles demandes dépenseront jusqu'à {most} USDC. 1 de vos demandes ouvertes demande plus ; son budget reste tant que vous ne la publiez pas à nouveau.",
  'effect.newLowest': 'Votre agent prendra {lowest} USDC comme prix le plus bas à partir de maintenant.',
  'effect.limitUp': "Relever votre limite hebdomadaire permet à votre agent de vérifier environ {count} historiques de plus par semaine.",
  'effect.limitZero': 'Votre agent ne fera aucune vérification payante.',
  'effect.limitDown': 'Votre agent arrêtera les vérifications payantes après avoir dépensé {usdc} USDC dans la semaine.',
  'effect.buyMost': "Les nouvelles demandes dépenseront jusqu'à {most} USDC.",
  'effect.buyMostAbove': "Les nouvelles demandes dépenseront jusqu'à {most} USDC. {above} de vos demandes ouvertes demandent plus ; leur budget reste tant que vous ne les publiez pas à nouveau.",
  'effect.goalAdd': 'Votre agent fera le point sur cet objectif dans chaque résumé : {text}.',
  'effect.goalRemove': 'Votre agent cessera de poursuivre cet objectif.',
  'effect.briefOff': "Votre agent n'enverra pas de résumé quotidien.",
  'effect.briefToday': "Votre prochain résumé arrive aujourd'hui à {hour}:00, heure de {zone}.",
  'effect.briefTomorrow': 'Votre prochain résumé arrive demain à {hour}:00, heure de {zone}.',
  'effect.quiet': 'De {from}:00 à {to}:00, votre agent garde ses messages pour le résumé du matin.',
  'effect.quietOff': "Votre agent peut envoyer des messages à toute heure.",
  'replan.done': 'C’est fait. Votre agent fonctionne ainsi à partir de maintenant.',
  'replan.reopened': 'C’est fait. Votre agent a revu {judged} des demandes écartées, désormais à {lowest} USDC, et {offered} sont devenues des offres.',
  'replan.reopenedOne': 'C’est fait. Votre agent a revu {judged} des demandes écartées, désormais à {lowest} USDC, et 1 est devenue une offre.',
  'replan.reopenedNone': 'C’est fait. Votre agent a revu {judged} des demandes écartées, désormais à {lowest} USDC. Aucune n’est encore devenue une offre.',
  'replan.askClosed': 'C’est fait. Votre agent a fermé les questions dont il n’a plus besoin ({count}) et revoit ces demandes.',
  'replan.failed': 'Enregistré. Votre agent revérifie encore vos demandes et termine à son prochain passage.',
  'brief.heading': 'Votre résumé du matin',
  'brief.offers': '{title} : {count} nouvelles offres, la meilleure à {best} USDC.',
  'brief.offersOne': '{title} : 1 nouvelle offre, {best} USDC.',
  'brief.questions': '{count} questions vous attendent ; la première se décide seule à {time}.',
  'brief.questionsOne': '1 question vous attend ; elle se décide seule à {time}.',
  'brief.questionsWaiting': 'Questions qui vous attendent : {count}.',
  'brief.goalBuy': 'Votre objectif, {text} : {offers} offres reçues, la meilleure à {best} USDC, pour le {date}.',
  'brief.goalBuyOne': 'Votre objectif, {text} : 1 offre reçue, {best} USDC, pour le {date}.',
  'brief.goalBuyNone': 'Votre objectif, {text} : pas encore d’offre, pour le {date}.',
  'brief.goalSell': 'Votre objectif, {text} : {fits} demandes conviennent, et votre agent a fait une offre sur {offered}.',
  'brief.goalSellOne': 'Votre objectif, {text} : 1 demande convient, et votre agent a fait une offre sur {offered}.',
  'brief.goalWatch': 'Votre objectif, {text} : {count} nouvelles demandes dans les marchés que vous surveillez.',
  'brief.goalWatchOne': 'Votre objectif, {text} : 1 nouvelle demande dans les marchés que vous surveillez.',
  'brief.goalExpired': 'Votre objectif, {text}, a atteint sa date de fin et est clos.',
  'brief.goalNothing': 'Votre objectif, {text} : pas encore de demande qui convient.',
  'brief.dealsWaiting': '{count} transactions vous attendent.',
  'brief.dealsWaitingOne': '1 transaction vous attend.',
  'brief.open': 'Ouvrir Karwan',
  'note.heading': 'Votre agent a remarqué',
  'alert.headingNear': 'Quelqu\'un près de chez vous a besoin de votre travail',
  'alert.heading': 'Quelqu\'un a besoin de votre travail',
  'alert.reminderNear': 'Rappel : quelqu\'un près de chez vous a besoin de votre travail',
  'alert.reminder': 'Rappel : quelqu\'un a besoin de votre travail',
  'alert.budget': 'Budget environ {amount}',
  'alert.by': 'D\'ici le {day}',
  'alert.nearby': 'Tout près de vous',
  'alert.km': 'À environ {km} km de vous',
  'alert.city': 'À {city}',
  'alert.open': 'Ouvrez-la pour donner votre prix, ou dites non merci.',
  'alert.thanks': 'Merci. Cette personne a trouvé quelqu\'un. Nous vous parlerons de la prochaine.',
};

const hi: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} इस सौदे को रद्द करने का प्रस्ताव दे रहा है* (आपसी)। स्वीकार या अस्वीकार करने के लिए सौदा खोलें।',
  'cancelProposedFromOther.platform':
    '*{role} ने इस सौदे को प्लेटफ़ॉर्म त्रुटि के रूप में चिह्नित किया*। स्वीकार या अस्वीकार करने के लिए खोलें।',
  'cancelProposedFromSelf':
    '*रद्दीकरण प्रस्तावित*। दूसरे पक्ष की स्वीकृति या अस्वीकृति का इंतज़ार है।',
  'cancelDeclinedToProposer':
    '*आपका रद्दीकरण प्रस्ताव अस्वीकृत हुआ*। सौदा सामान्य रूप से जारी रहेगा।',
  'cancelDeclinedBySelf':
    '*आपने रद्दीकरण प्रस्ताव अस्वीकार किया*। सौदा सामान्य रूप से जारी रहेगा।',
  'milestoneReleasedToSeller.first':
    '*पहली मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToSeller.final':
    '*अंतिम मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToBuyer.first': '*पहली मील का पत्थर जारी* विक्रेता को।',
  'milestoneReleasedToBuyer.final': '*अंतिम मील का पत्थर जारी* विक्रेता को।',
  'bidAcceptedToSeller':
    '*आपकी बोली स्वीकृत*। एस्क्रो आगे फंड होगा; उसकी सूचना अलग से मिलेगी।',
  'bidAcceptedToBuyer': '*बोली स्वीकृत*। एस्क्रो फंड हो रहा है।',
  'reputationRecordedSuccessSeller':
    '*प्रतिष्ठा ऑन-चेन अपडेट* सफल निपटान के लिए। पासपोर्ट पर नई स्कोर देखें।',
  'reputationRecordedSuccessBuyer':
    '*प्रतिष्ठा ऑन-चेन दर्ज* सफल निपटान के लिए।',
  'dealCancelled': '*सौदा रद्द*।',
  'dealDeliveredToBuyer':
    '*विक्रेता ने डिलीवरी चिह्नित की*। सत्यापन और रिलीज़ के लिए सौदा खोलें।',
  'dealDeliveredToSeller':
    '*आपने सौदा डिलीवर चिह्नित किया*। खरीदार समीक्षा विंडो खुली है।',
  'openInKarwan': 'Karwan में खोलें',
  'insight.questions': "आपके एजेंट ने आपसे {asked} सवाल पूछे: आपने {answered} का जवाब दिया, और {byDefault} बिना जवाब के बताए गए तरीके से तय हुए।",
  'insight.testnetBudget': "*{title}*: यह टेस्ट नेटवर्क है, जहाँ सौदे {low} से {high} USDC में हुए। जल्दी सौदा पाने के लिए अपना बजट {budget} से घटाकर {suggested} USDC करें।",
  'insight.missedByPrice': "इस हफ़्ते आपसे {count} अनुरोध छूट गए क्योंकि आपकी सबसे कम कीमत, {lowest} USDC, खरीदारों की पेशकश से ज़्यादा थी। उन्होंने लगभग {median} USDC की पेशकश की।",
  'insight.budgetBelowBand': "*{title}*: ऐसे सौदे {low} से {high} USDC में हुए। आपका बजट {budget} USDC है; {low} USDC से ज़्यादा विक्रेता मिलेंगे।",
  'insight.cheaperBetterSellers': "*{title}*: इतने ही अच्छे रिकॉर्ड वाले {count} विक्रेता {price} USDC से कम लेते हैं, {lowest} USDC से शुरू।",
  'insight.slowRequest': "*{title}* पर एक दिन से कोई पेशकश नहीं आई। मिलते-जुलते अनुरोधों पर विक्रेताओं ने लगभग {usualDays} दिन माँगे; आपका अनुरोध {days} दिन देता है।",
  'insight.heading': "*आपका एजेंट क्या देख रहा है:*",
  'researchFailed': "*{title} के लिए खोज पूरी नहीं हुई।* आपका एजेंट Karwan की अपनी कीमतों के साथ आगे बढ़ा।",
  'researchFailedPaid': "*{title} के लिए खोज पूरी नहीं हुई*, और इस पर {amount} USDC खर्च हुए। आपका एजेंट Karwan की अपनी कीमतों के साथ आगे बढ़ा।",
  'mandate.sellWork': 'आपका एजेंट {lowest} USDC से काम बेचता है (आमतौर पर {usual}), {min} से {max} दिनों में।',
  'mandate.sellGoods': 'आपका एजेंट {what} {lowest} USDC से बेचता है (आमतौर पर {usual})।',
  'mandate.sellDeposit': 'आपका एजेंट {what} {lowest} USDC की जमा राशि पर किराए पर देता है।',
  'mandate.sellHourly': 'आपका एजेंट {lowest} USDC प्रति घंटे से घंटे के हिसाब से काम लेता है (आमतौर पर {usual}), {hours} घंटे तक।',
  'mandate.sellMonthly': 'आपका एजेंट {lowest} USDC प्रति माह से मासिक काम लेता है (आमतौर पर {usual})।',
  'mandate.sellNone': 'आपका एजेंट अभी कुछ नहीं बेच रहा।',
  'mandate.buy': 'जब आप खरीदते हैं, यह हर अनुरोध पर {most} USDC तक खर्च करता है।',
  'mandate.alone.offers': 'यह खुद पेशकश करता है और किसी भी सौदे से पहले आपसे पूछता है।',
  'mandate.alone.ask': 'यह हर उपयुक्त अनुरोध के बारे में पहले आपसे पूछता है।',
  'mandate.alone.agree': 'यह आपकी सीमाओं के भीतर खरीदार की कीमत पर खुद हाँ कह सकता है।',
  'mandate.weeklyLimit': 'यह रिकॉर्ड जाँच और खोज पर हफ़्ते में {usdc} USDC तक खर्च कर सकता है।',
  'mandate.watchesOne': 'यह आपके लिए {count} बाज़ार पर नज़र रखता है।',
  'mandate.watches': 'यह आपके लिए {count} बाज़ारों पर नज़र रखता है।',
  'mandate.goals': 'आपके लक्ष्य: {list}।',
  'mandate.brief': 'आपका सारांश {zone} समय से {hour}:00 बजे आता है।',
  'mandate.briefOff': 'आपका दैनिक सारांश बंद है।',
  'mandate.quiet': 'शांत समय: {from}:00 से {to}:00 तक।',
  'mandate.quietOff': 'शांत समय बंद है।',
  'mandate.refuse.noWay': 'आप अभी इस तरह नहीं बेचते। पहले इसे अपनी सेटअप में जोड़ें।',
  'mandate.refuse.price': '0 USDC से ऊपर की कीमत दें।',
  'mandate.refuse.lowestAboveUsual': 'आपकी सबसे कम कीमत आपकी सामान्य कीमत से ज़्यादा नहीं हो सकती।',
  'mandate.refuse.mode': 'चुनें: पेशकश करे, पहले पूछे, या मेरे लिए हाँ कहे।',
  'mandate.refuse.limit': 'साप्ताहिक सीमा 0 से 5 USDC तक हो सकती है।',
  'mandate.refuse.goals': 'आपका एजेंट पाँच लक्ष्यों तक पर काम कर सकता है। पहले एक हटाएँ।',
  'mandate.refuse.goalText': 'लक्ष्य कुछ शब्दों में बताएँ, और एक साल के भीतर।',
  'mandate.refuse.noGoal': 'यह लक्ष्य आपकी सूची में नहीं है।',
  'mandate.refuse.hour': '0 से 23 तक के घंटे चुनें, और शांत समय के लिए दो अलग घंटे।',
  'mandate.refuse.timeZone': 'मुझे यह समय क्षेत्र नहीं पता। कोई शहर आज़माएँ, जैसे Africa/Lagos।',
  'effect.reopens': 'अपनी सबसे कम कीमत {lowest} USDC करने से इस हफ़्ते छोड़े गए {count} अनुरोध फिर खुलते हैं।',
  'effect.reopensOne': 'अपनी सबसे कम कीमत {lowest} USDC करने से इस हफ़्ते छोड़ा गया 1 अनुरोध फिर खुलता है।',
  'effect.buyMostAboveOne': 'नए अनुरोध {most} USDC तक खर्च करेंगे। आपका 1 खुला अनुरोध इससे ज़्यादा माँगता है; उसका बजट तब तक रहेगा जब तक आप उसे फिर से पोस्ट नहीं करते।',
  'effect.newLowest': 'अब से आपका एजेंट {lowest} USDC को आपकी सबसे कम कीमत मानेगा।',
  'effect.limitUp': 'साप्ताहिक सीमा बढ़ाने से आपका एजेंट हफ़्ते में लगभग {count} और रिकॉर्ड जाँच सकता है।',
  'effect.limitZero': 'आपका एजेंट कोई सशुल्क जाँच नहीं करेगा।',
  'effect.limitDown': 'हफ़्ते में {usdc} USDC खर्च होने के बाद आपका एजेंट सशुल्क जाँच रोक देगा।',
  'effect.buyMost': 'नए अनुरोध {most} USDC तक खर्च करेंगे।',
  'effect.buyMostAbove': 'नए अनुरोध {most} USDC तक खर्च करेंगे। आपके {above} खुले अनुरोध इससे ज़्यादा माँगते हैं; उनका बजट तब तक रहेगा जब तक आप उन्हें फिर से पोस्ट नहीं करते।',
  'effect.goalAdd': 'आपका एजेंट हर सारांश में इस लक्ष्य की जानकारी देगा: {text}।',
  'effect.goalRemove': 'आपका एजेंट इस लक्ष्य पर काम करना बंद कर देगा।',
  'effect.briefOff': 'आपका एजेंट दैनिक सारांश नहीं भेजेगा।',
  'effect.briefToday': 'आपका अगला सारांश आज {zone} समय से {hour}:00 बजे आएगा।',
  'effect.briefTomorrow': 'आपका अगला सारांश कल {zone} समय से {hour}:00 बजे आएगा।',
  'effect.quiet': '{from}:00 से {to}:00 तक आपका एजेंट अपने संदेश सुबह के सारांश के लिए रखता है।',
  'effect.quietOff': 'आपका एजेंट किसी भी समय संदेश भेज सकता है।',
  'replan.done': 'हो गया। अब से आपका एजेंट इसी तरह काम करेगा।',
  'replan.reopened': 'हो गया। आपके एजेंट ने छोड़े गए अनुरोधों में से {judged} को फिर देखा, अब {lowest} USDC पर, और {offered} पेशकश बन गए।',
  'replan.reopenedOne': 'हो गया। आपके एजेंट ने छोड़े गए अनुरोधों में से {judged} को फिर देखा, अब {lowest} USDC पर, और 1 पेशकश बन गया।',
  'replan.reopenedNone': 'हो गया। आपके एजेंट ने छोड़े गए अनुरोधों में से {judged} को फिर देखा, अब {lowest} USDC पर। अभी कोई पेशकश नहीं बना।',
  'replan.askClosed': 'हो गया। आपके एजेंट ने वे सवाल बंद किए जिनकी अब ज़रूरत नहीं ({count}) और उन अनुरोधों को फिर देख रहा है।',
  'replan.failed': 'सहेजा गया। आपका एजेंट अभी भी आपके अनुरोध दोबारा जाँच रहा है और अगले दौर में पूरा करेगा।',
  'brief.heading': 'आपका सुबह का सारांश',
  'brief.offers': '{title}: {count} नई पेशकशें, सबसे अच्छी {best} USDC।',
  'brief.offersOne': '{title}: 1 नई पेशकश, {best} USDC।',
  'brief.questions': '{count} सवाल आपका इंतज़ार कर रहे हैं; पहला {time} बजे अपने आप तय होगा।',
  'brief.questionsOne': '1 सवाल आपका इंतज़ार कर रहा है; यह {time} बजे अपने आप तय होगा।',
  'brief.questionsWaiting': 'आपका इंतज़ार कर रहे सवाल: {count}।',
  'brief.goalBuy': 'आपका लक्ष्य, {text}: {offers} पेशकशें आईं, सबसे अच्छी {best} USDC, {date} तक।',
  'brief.goalBuyOne': 'आपका लक्ष्य, {text}: 1 पेशकश आई, {best} USDC, {date} तक।',
  'brief.goalBuyNone': 'आपका लक्ष्य, {text}: अभी कोई पेशकश नहीं, {date} तक।',
  'brief.goalSell': 'आपका लक्ष्य, {text}: {fits} अनुरोध उपयुक्त हैं, और आपके एजेंट ने {offered} पर पेशकश की।',
  'brief.goalSellOne': 'आपका लक्ष्य, {text}: 1 अनुरोध उपयुक्त है, और आपके एजेंट ने {offered} पर पेशकश की।',
  'brief.goalWatch': 'आपका लक्ष्य, {text}: आपके देखे जा रहे बाज़ारों में {count} नए अनुरोध।',
  'brief.goalWatchOne': 'आपका लक्ष्य, {text}: आपके देखे जा रहे बाज़ारों में 1 नया अनुरोध।',
  'brief.goalExpired': 'आपका लक्ष्य, {text}, अपनी अंतिम तारीख़ पर पहुँच गया और बंद है।',
  'brief.goalNothing': 'आपका लक्ष्य, {text}: अभी कोई उपयुक्त अनुरोध नहीं।',
  'brief.dealsWaiting': '{count} सौदे आपका इंतज़ार कर रहे हैं।',
  'brief.dealsWaitingOne': '1 सौदा आपका इंतज़ार कर रहा है।',
  'brief.open': 'Karwan खोलें',
  'note.heading': 'आपके एजेंट ने देखा',
  'alert.headingNear': 'आपके पास किसी को आपके काम की ज़रूरत है',
  'alert.heading': 'किसी को आपके काम की ज़रूरत है',
  'alert.reminderNear': 'याद दिलाना: आपके पास किसी को आपके काम की ज़रूरत है',
  'alert.reminder': 'याद दिलाना: किसी को आपके काम की ज़रूरत है',
  'alert.budget': 'बजट लगभग {amount}',
  'alert.by': '{day} तक',
  'alert.nearby': 'आपके बहुत पास',
  'alert.km': 'आपसे लगभग {km} किमी दूर',
  'alert.city': '{city} में',
  'alert.open': 'अपनी कीमत भेजने के लिए खोलें, या मना कर दें।',
  'alert.thanks': 'धन्यवाद। उन्हें कोई मिल गया है। अगली बार हम आपको बताएँगे।',
};

const sw: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} anapendekeza kufuta mkataba huu* (kwa makubaliano). Fungua mkataba kukubali au kukataa.',
  'cancelProposedFromOther.platform':
    '*{role} ameashiria mkataba kama hitilafu ya jukwaa*. Fungua kukubali au kukataa.',
  'cancelProposedFromSelf':
    '*Pendekezo la kufuta limewasilishwa*. Tunasubiri upande mwingine kukubali au kukataa.',
  'cancelDeclinedToProposer':
    '*Pendekezo lako la kufuta limekataliwa*. Mkataba unaendelea kawaida.',
  'cancelDeclinedBySelf':
    '*Umekataa pendekezo la kufuta*. Mkataba unaendelea kawaida.',
  'milestoneReleasedToSeller.first':
    '*Hatua ya kwanza imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToSeller.final':
    '*Hatua ya mwisho imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToBuyer.first': '*Hatua ya kwanza imeachiliwa* kwa muuzaji.',
  'milestoneReleasedToBuyer.final': '*Hatua ya mwisho imeachiliwa* kwa muuzaji.',
  'bidAcceptedToSeller':
    '*Toleo lako limekubaliwa*. Eskrowi inafuata; utapokea ujumbe mwingine.',
  'bidAcceptedToBuyer': '*Toleo limekubaliwa*. Eskrowi inafadhiliwa.',
  'reputationRecordedSuccessSeller':
    '*Sifa imesasishwa kwenye mnyororo* kwa malipo yenye mafanikio. Tazama pasi yako.',
  'reputationRecordedSuccessBuyer':
    '*Sifa imerekodiwa kwenye mnyororo* kwa malipo yenye mafanikio.',
  'dealCancelled': '*Mkataba umefutwa*.',
  'dealDeliveredToBuyer':
    '*Muuzaji ameashiria kazi imewasilishwa*. Fungua kuthibitisha na kuachilia.',
  'dealDeliveredToSeller':
    '*Umeashiria mkataba kuwa umewasilishwa*. Dirisha la mapitio la mnunuzi limefunguliwa.',
  'openInKarwan': 'Fungua katika Karwan',
  'insight.questions': "Wakala wako alikuuliza maswali {asked}: ulijibu {answered}, na {byDefault} yalienda kama ilivyosemwa bila jibu.",
  'insight.testnetBudget': "*{title}*: huu ni mtandao wa majaribio, ambapo mikataba ilifungwa kwa {low} hadi {high} USDC. Punguza bajeti yako kutoka {budget} hadi {suggested} USDC ili kupata mkataba haraka.",
  'insight.missedByPrice': "Ulikosa maombi {count} wiki hii kwa sababu bei yako ya chini kabisa, {lowest} USDC, ilikuwa juu ya walichotoa wanunuzi. Walitoa karibu {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: mikataba kama huu ilifungwa kwa {low} hadi {high} USDC. Bajeti yako ni {budget} USDC; {low} USDC ingewafikia wauzaji wengi zaidi.",
  'insight.cheaperBetterSellers': "*{title}*: wauzaji {count} wenye rekodi nzuri kama hii wanatoza chini ya {price} USDC, kuanzia {lowest} USDC.",
  'insight.slowRequest': "*{title}* haijapata ofa kwa siku moja. Wauzaji kwenye maombi yanayofanana waliomba karibu siku {usualDays}; lako linaruhusu {days}.",
  'insight.heading': "*Anachoona wakala wako:*",
  'researchFailed': "*Utafiti wa {title} haukukamilika.* Wakala wako aliendelea kwa bei za Karwan zenyewe.",
  'researchFailedPaid': "*Utafiti wa {title} haukukamilika*, na {amount} USDC zilitumika. Wakala wako aliendelea kwa bei za Karwan zenyewe.",
  'mandate.sellWork': 'Wakala wako anauza kazi kuanzia {lowest} USDC (kwa kawaida {usual}), kwa siku {min} hadi {max}.',
  'mandate.sellGoods': 'Wakala wako anauza {what} kuanzia {lowest} USDC (kwa kawaida {usual}).',
  'mandate.sellDeposit': 'Wakala wako anakodisha {what} kwa amana ya {lowest} USDC.',
  'mandate.sellHourly': 'Wakala wako anachukua kazi ya saa kuanzia {lowest} USDC kwa saa (kwa kawaida {usual}), hadi saa {hours}.',
  'mandate.sellMonthly': 'Wakala wako anachukua kazi ya mwezi kuanzia {lowest} USDC kwa mwezi (kwa kawaida {usual}).',
  'mandate.sellNone': 'Wakala wako bado hauzi chochote.',
  'mandate.buy': 'Unaponunua, anatumia hadi {most} USDC kwa ombi moja.',
  'mandate.alone.offers': 'Anatoa ofa mwenyewe na anakuuliza kabla ya mkataba wowote.',
  'mandate.alone.ask': 'Anakuuliza kwanza kuhusu kila ombi linalofaa.',
  'mandate.alone.agree': 'Anaweza kukubali bei ya mnunuzi ndani ya mipaka yako mwenyewe.',
  'mandate.weeklyLimit': 'Anaweza kutumia hadi {usdc} USDC kwa wiki kwa ukaguzi wa rekodi na utafiti.',
  'mandate.watchesOne': 'Anafuatilia soko {count} kwa ajili yako.',
  'mandate.watches': 'Anafuatilia masoko {count} kwa ajili yako.',
  'mandate.goals': 'Malengo yako: {list}.',
  'mandate.brief': 'Muhtasari wako unakuja saa {hour}:00, saa za {zone}.',
  'mandate.briefOff': 'Muhtasari wako wa kila siku umezimwa.',
  'mandate.quiet': 'Saa za utulivu: {from}:00 hadi {to}:00.',
  'mandate.quietOff': 'Saa za utulivu zimezimwa.',
  'mandate.refuse.noWay': 'Bado huuzi kwa njia hiyo. Iongeze kwenye mipangilio yako kwanza.',
  'mandate.refuse.price': 'Tumia bei iliyo juu ya 0 USDC.',
  'mandate.refuse.lowestAboveUsual': 'Bei yako ya chini kabisa haiwezi kuwa juu ya bei yako ya kawaida.',
  'mandate.refuse.mode': 'Chagua toa ofa, uliza kwanza, au kubali kwa niaba yangu.',
  'mandate.refuse.limit': 'Kikomo cha wiki kinaweza kuwa 0 hadi 5 USDC.',
  'mandate.refuse.goals': 'Wakala wako anaweza kufuatilia hadi malengo matano. Ondoa moja kwanza.',
  'mandate.refuse.goalText': 'Sema lengo kwa maneno machache, na hadi mwaka mmoja mbele.',
  'mandate.refuse.noGoal': 'Lengo hilo halipo kwenye orodha yako.',
  'mandate.refuse.hour': 'Chagua saa kutoka 0 hadi 23, na saa mbili tofauti kwa saa za utulivu.',
  'mandate.refuse.timeZone': 'Sijui saa hizo za eneo. Jaribu jiji, kama Africa/Lagos.',
  'effect.reopens': 'Kushusha bei yako ya chini hadi {lowest} USDC kunafungua tena maombi {count} uliyoyapita wiki hii.',
  'effect.reopensOne': 'Kushusha bei yako ya chini hadi {lowest} USDC kunafungua tena ombi 1 ulilolipita wiki hii.',
  'effect.buyMostAboveOne': 'Maombi mapya yatatumia hadi {most} USDC. Ombi lako 1 lililo wazi linaomba zaidi; bajeti yake inabaki hadi ulichapishe tena.',
  'effect.newLowest': 'Kuanzia sasa wakala wako atachukua {lowest} USDC kama bei yako ya chini kabisa.',
  'effect.limitUp': 'Kupandisha kikomo chako cha wiki kunamruhusu wakala wako kukagua takriban rekodi {count} zaidi kwa wiki.',
  'effect.limitZero': 'Wakala wako hatafanya ukaguzi wowote wa kulipia.',
  'effect.limitDown': 'Wakala wako ataacha ukaguzi wa kulipia akishatumia {usdc} USDC kwa wiki.',
  'effect.buyMost': 'Maombi mapya yatatumia hadi {most} USDC.',
  'effect.buyMostAbove': 'Maombi mapya yatatumia hadi {most} USDC. Maombi yako {above} yaliyo wazi yanaomba zaidi; bajeti yao inabaki hadi uyachapishe tena.',
  'effect.goalAdd': 'Wakala wako ataripoti kuhusu lengo hili katika kila muhtasari: {text}.',
  'effect.goalRemove': 'Wakala wako ataacha kufuatilia lengo hilo.',
  'effect.briefOff': 'Wakala wako hatatuma muhtasari wa kila siku.',
  'effect.briefToday': 'Muhtasari wako ujao unakuja leo saa {hour}:00, saa za {zone}.',
  'effect.briefTomorrow': 'Muhtasari wako ujao unakuja kesho saa {hour}:00, saa za {zone}.',
  'effect.quiet': 'Kuanzia {from}:00 hadi {to}:00 wakala wako anahifadhi ujumbe wake kwa muhtasari wa asubuhi.',
  'effect.quietOff': 'Wakala wako anaweza kutuma ujumbe saa yoyote.',
  'replan.done': 'Imekamilika. Wakala wako atafanya kazi hivi kuanzia sasa.',
  'replan.reopened': 'Imekamilika. Wakala wako aliangalia tena maombi {judged} uliyoyapita, sasa kwa {lowest} USDC, na {offered} yakawa ofa.',
  'replan.reopenedOne': 'Imekamilika. Wakala wako aliangalia tena maombi {judged} uliyoyapita, sasa kwa {lowest} USDC, na 1 likawa ofa.',
  'replan.reopenedNone': 'Imekamilika. Wakala wako aliangalia tena maombi {judged} uliyoyapita, sasa kwa {lowest} USDC. Hakuna lililokuwa ofa bado.',
  'replan.askClosed': 'Imekamilika. Wakala wako amefunga maswali asiyoyahitaji tena ({count}) na anaangalia maombi hayo tena.',
  'replan.failed': 'Imehifadhiwa. Wakala wako bado anakagua maombi yako tena na atamaliza kwenye mzunguko wake ujao.',
  'brief.heading': 'Muhtasari wako wa asubuhi',
  'brief.offers': '{title}: ofa mpya {count}, bora zaidi {best} USDC.',
  'brief.offersOne': '{title}: ofa mpya 1, {best} USDC.',
  'brief.questions': 'Maswali {count} yanakusubiri; la kwanza linaamuliwa lenyewe saa {time}.',
  'brief.questionsOne': 'Swali 1 linakusubiri; linaamuliwa lenyewe saa {time}.',
  'brief.questionsWaiting': 'Maswali yanayokusubiri: {count}.',
  'brief.goalBuy': 'Lengo lako, {text}: ofa {offers} zimefika, bora zaidi {best} USDC, mwisho {date}.',
  'brief.goalBuyOne': 'Lengo lako, {text}: ofa 1 imefika, {best} USDC, mwisho {date}.',
  'brief.goalBuyNone': 'Lengo lako, {text}: bado hakuna ofa, mwisho {date}.',
  'brief.goalSell': 'Lengo lako, {text}: maombi {fits} yanafaa, na wakala wako alitoa ofa kwenye {offered}.',
  'brief.goalSellOne': 'Lengo lako, {text}: ombi 1 linafaa, na wakala wako alitoa ofa kwenye {offered}.',
  'brief.goalWatch': 'Lengo lako, {text}: maombi mapya {count} kwenye masoko unayofuatilia.',
  'brief.goalWatchOne': 'Lengo lako, {text}: ombi jipya 1 kwenye masoko unayofuatilia.',
  'brief.goalExpired': 'Lengo lako, {text}, limefikia tarehe yake ya mwisho na limefungwa.',
  'brief.goalNothing': 'Lengo lako, {text}: bado hakuna maombi yanayofaa.',
  'brief.dealsWaiting': 'Mikataba {count} inakusubiri.',
  'brief.dealsWaitingOne': 'Mkataba 1 unakusubiri.',
  'brief.open': 'Fungua Karwan',
  'note.heading': 'Wakala wako ameona',
  'alert.headingNear': 'Mtu karibu nawe anahitaji kazi yako',
  'alert.heading': 'Mtu anahitaji kazi yako',
  'alert.reminderNear': 'Kumbusho: mtu karibu nawe anahitaji kazi yako',
  'alert.reminder': 'Kumbusho: mtu anahitaji kazi yako',
  'alert.budget': 'Bajeti takriban {amount}',
  'alert.by': 'Kufikia {day}',
  'alert.nearby': 'Karibu sana nawe',
  'alert.km': 'Takriban km {km} kutoka kwako',
  'alert.city': 'Ndani ya {city}',
  'alert.open': 'Fungua utume bei yako, au sema hapana asante.',
  'alert.thanks': 'Asante. Wamepata mtu. Tutakuambia kuhusu inayofuata.',
};

const TABLES: Record<UserLocale, Partial<Record<TgKey, string>>> = {
  en,
  ar,
  fr,
  hi,
  sw,
};

export function tg(
  key: TgKey,
  locale: UserLocale | undefined,
  vars?: Record<string, string>,
): string {
  const table = TABLES[locale ?? 'en'];
  const raw = table[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}
