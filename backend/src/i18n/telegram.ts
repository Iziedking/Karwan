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
  | 'researchShort'
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
  | 'mandate.off'
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
  | 'mandate.switch.offers'
  | 'mandate.switch.bargain'
  | 'mandate.switch.agree'
  | 'mandate.switch.lock'
  | 'mandate.switch.find'
  | 'mandate.switch.data'
  | 'mandate.switch.brief'
  | 'mandate.does'
  | 'mandate.doesNot'
  | 'mandate.stopped.locks-today'
  | 'mandate.stopped.lock-failures'
  | 'mandate.stopped.not-family'
  | 'mandate.lockRules'
  | 'mandate.lockedWeek'
  | 'mandate.who.verified'
  | 'mandate.who.record'
  | 'mandate.who.anyone'
  | 'mandate.refuse.lockNeedsAgree'
  | 'mandate.refuse.lockNeedsRules'
  | 'mandate.refuse.lockRules'
  | 'mandate.refuse.notStopped'
  | 'effect.switchOn'
  | 'effect.switchOff'
  | 'effect.lockRules'
  | 'effect.resume'
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
  | 'effect.powerOff'
  | 'effect.powerOn'
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
  | 'alert.thanks'
  | 'alert.budgetRange'
  | 'bargain.yourCall'
  | 'bargain.yourCallOn'
  | 'bargain.yourCallAsk'
  | 'bargain.yourCallChoice'
  | 'pitch.headingNear'
  | 'pitch.heading'
  | 'pitch.reminderNear'
  | 'pitch.reminder'
  | 'pitch.offer'
  | 'pitch.offerOneDay'
  | 'pitch.offerTwoDays'
  | 'pitch.offerManyDays'
  | 'pitch.verified'
  | 'pitch.rated'
  | 'pitch.open'
  | 'pitch.interested'
  | 'lock.heading'
  | 'lock.locked'
  | 'lock.lockedMoved'
  | 'lock.ask.heading'
  | 'lock.ask.lead'
  | 'lock.ask.over-deal'
  | 'lock.ask.over-week'
  | 'lock.ask.who'
  | 'lock.ask.price-outlier'
  | 'lock.ask.not-family'
  | 'lock.ask.world-id'
  | 'lock.ask.unverified'
  | 'lock.ask.short'
  | 'lock.ask.failed'
  | 'lock.ask.tail'
  | 'lock.stopped.heading'
  | 'lock.stopped.tail'
  | 'order.heading'
  | 'order.asked'
  | 'order.askedOne'
  | 'order.asked.tail'
  | 'order.pitched'
  | 'order.pitchedOne'
  | 'order.pitched.tail'
  | 'order.nobody.buy'
  | 'order.nobody.sell'
  | 'order.location'
  | 'order.short'
  | 'order.ended';

const en: Record<TgKey, string> = {
  'cancelProposedFromOther.mutual':
    '*The {role} wants to cancel this deal*. Open the deal to accept or decline.',
  'cancelProposedFromOther.platform':
    '*The {role} says Karwan matched this deal by mistake*. Open the deal to accept or decline.',
  'cancelProposedFromSelf':
    '*Cancellation proposed*. Waiting on the other party to accept or decline.',
  'cancelDeclinedToProposer':
    '*They want to keep the deal*. It carries on as before.',
  'cancelDeclinedBySelf':
    '*You kept the deal*. It carries on as before.',
  'milestoneReleasedToSeller.first':
    '*First payment released*. The money is on its way to you.',
  'milestoneReleasedToSeller.final':
    '*Last payment released*. The money is on its way to you.',
  'milestoneReleasedToBuyer.first': '*First payment sent* to the seller.',
  'milestoneReleasedToBuyer.final': '*Last payment sent* to the seller.',
  'bidAcceptedToSeller':
    "*Your offer was accepted*. The buyer's money is being held for you; you'll hear when it is.",
  'bidAcceptedToBuyer': '*Offer accepted*. Your money is being held for the deal.',
  'reputationRecordedSuccessSeller':
    '*Your trade record grew* with a deal paid in full. Open it to see where you stand.',
  'reputationRecordedSuccessBuyer':
    '*Your trade record grew* with a deal paid in full.',
  'dealCancelled': '*Deal cancelled*.',
  'dealDeliveredToBuyer':
    '*The seller says it is delivered*. Open the deal to check it and release the payment.',
  'dealDeliveredToSeller':
    '*You marked the deal delivered*. The buyer is checking it now.',
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
  'researchShort': "*Your selling agent has no money for research*, so it is using Karwan's own prices for now. Add money to it under Money, Agent.",
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
  'mandate.off': 'Your agent is off. It does nothing for you until you turn it back on.',
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
  'mandate.switch.offers': "make offers",
  'mandate.switch.bargain': "bargain",
  'mandate.switch.agree': "agree a price",
  'mandate.switch.lock': "lock money",
  'mandate.switch.find': "find people",
  'mandate.switch.data': "pay for checks and research",
  'mandate.switch.brief': "send the morning brief",
  'mandate.does': "Alone it may: {list}.",
  'mandate.doesNot': "Switched off: {list}.",
  'mandate.stopped.locks-today': "Your agent stopped. It locked money {n} times today, the most you allow in a day.",
  'mandate.stopped.lock-failures': "Your agent stopped. Locking money failed 3 times in a row.",
  'mandate.stopped.not-family': "Your agent stopped. It was asked to lock money outside a Karwan escrow.",
  'mandate.lockRules': "Lock money: at most {deal} a deal and {week} a week, {who}, {day} a day.",
  'mandate.lockedWeek': "It locked {usdc} USDC alone in the last seven days.",
  'mandate.who.verified': "only with verified people",
  'mandate.who.record': "only with people who have a record",
  'mandate.who.anyone': "with anyone",
  'mandate.refuse.lockNeedsAgree': "Turn on Agree a price first.",
  'mandate.refuse.lockNeedsRules': "Set the most it may lock for one deal and in a week first.",
  'mandate.refuse.lockRules': "Use amounts above 0, one deal no more than a week, and 1 to 10 locks a day.",
  'mandate.refuse.notStopped': "Your agent has not stopped.",
  'effect.switchOn': "It starts with the next request.",
  'effect.switchOff': "It stops at once. Deals already running go on.",
  'effect.lockRules': "Nothing is locked until the next price it agrees.",
  'effect.resume': "It is back on. Lock money stays off until you turn it on.",
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
  'effect.powerOff': 'It stops making offers, bargaining, finding people and sending briefs. Deals already running go on, offers it already made stand, and you are asked if a buyer chooses one.',
  'effect.powerOn': 'It starts again from now. It does not act on what it missed.',
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
  'alert.budgetRange': "Budget {low} to {high}",
  'bargain.yourCall': "Your call",
  'bargain.yourCallOn': "Your call: {title}",
  'bargain.yourCallAsk': "{seller} asks {price}. Your agent offered {offered}, {gap} less.",
  'bargain.yourCallChoice': "Agree at {price}, or keep bargaining? Reply here. Agreeing moves no money.",
  'pitch.headingNear': 'Someone near you can help with what you need',
  'pitch.heading': 'Someone can help with what you need',
  'pitch.reminderNear': 'Reminder: someone near you can help with what you need',
  'pitch.reminder': 'Reminder: someone can help with what you need',
  'pitch.offer': '{name} offers {price}, ready in {days} days',
  'pitch.offerOneDay': '{name} offers {price}, ready in 1 day',
  'pitch.offerTwoDays': '{name} offers {price}, ready in 2 days',
  'pitch.offerManyDays': '{name} offers {price}, ready in {days} days',
  'pitch.verified': 'Verified',
  'pitch.rated': 'Rated {stars}',
  'pitch.open': 'Open it to answer: interested, not now, or not interested.',
  'pitch.interested': 'They are interested. Your offer is on their private request now.',
  'lock.heading': "Your agent locked money",
  'lock.locked': "I agreed {price} USDC with {who} and locked it in escrow. With the fee, {total} USDC left your balance. You release it when the work is delivered.",
  'lock.lockedMoved': "The price opened at {opened} USDC.",
  'lock.ask.heading': "Your agent did not lock this one",
  'lock.ask.lead': "I agreed {price} USDC with {who}.",
  'lock.ask.over-deal': "With the fee it comes to {total} USDC, above what I may lock for one deal.",
  'lock.ask.over-week': "Locking {total} USDC would pass what I may lock in a week.",
  'lock.ask.who': "This seller has no record yet, and you asked me to lock only with people who have one.",
  'lock.ask.price-outlier': "The price is well above what this usually costs on Karwan.",
  'lock.ask.not-family': "This deal cannot use the protected escrow here yet.",
  'lock.ask.world-id': "This deal needs a World ID check first.",
  'lock.ask.unverified': "This seller is not verified, so you have to confirm them yourself.",
  'lock.ask.short': "I hold too little. Add {add} USDC to your buying agent.",
  'lock.ask.failed': "Locking the money did not go through.",
  'lock.ask.tail': "Nothing is locked. Open the request to lock it yourself.",
  'lock.stopped.heading': "Your agent stopped",
  'lock.stopped.tail': "It does nothing alone until you turn it back on under Your agent.",
  'order.heading': "Your standing order",
  'order.asked': "I asked {n} people for \"{need}\": {names}.",
  'order.askedOne': "I asked {names} for \"{need}\".",
  'order.asked.tail': "Their offers come to you as they answer.",
  'order.pitched': "I offered your work to {n} buyers who need it regularly.",
  'order.pitchedOne': "I offered your work to 1 buyer who needs it regularly.",
  'order.pitched.tail': "You hear when one is interested.",
  'order.nobody.buy': "Three days and nobody new fits \"{need}\". I keep looking each day. A higher budget or a wider area finds more people.",
  'order.nobody.sell': "Three days and no new buyer fits \"{need}\". I keep looking each day.",
  'order.location': "To find people for \"{need}\" I need to know roughly where you are. Tell me your area and city.",
  'order.short': "Your balance is too low to post \"{need}\". Add money and I try again tomorrow.",
  'order.ended': "\"{need}\" reached its date, so I stopped working it.",
};

const ar: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*يريد {role} إلغاء هذه الصفقة*. افتح الصفقة للقبول أو الرفض.",
  'cancelProposedFromOther.platform':
    "*يقول {role} إن كروان طابق هذه الصفقة بالخطأ*. افتح الصفقة للقبول أو الرفض.",
  'cancelProposedFromSelf':
    '*تم اقتراح الإلغاء*. في انتظار الطرف الآخر للقبول أو الرفض.',
  'cancelDeclinedToProposer':
    "*الطرف الآخر يريد إبقاء الصفقة*. تستمر كما كانت.",
  'cancelDeclinedBySelf':
    "*أبقيت الصفقة*. تستمر كما كانت.",
  'milestoneReleasedToSeller.first':
    "*صُرفت الدفعة الأولى*. المال في طريقه إليك.",
  'milestoneReleasedToSeller.final':
    "*صُرفت الدفعة الأخيرة*. المال في طريقه إليك.",
  'milestoneReleasedToBuyer.first': "*أُرسلت الدفعة الأولى* إلى البائع.",
  'milestoneReleasedToBuyer.final': "*أُرسلت الدفعة الأخيرة* إلى البائع.",
  'bidAcceptedToSeller':
    "*قُبل عرضك*. يُحجز مال المشتري لك الآن، وستصلك رسالة عند اكتمال ذلك.",
  'bidAcceptedToBuyer': "*قُبل العرض*. يُحجز مالك للصفقة.",
  'reputationRecordedSuccessSeller':
    "*نما سجل تداولك* بصفقة دُفعت كاملة. افتحه لترى مكانتك.",
  'reputationRecordedSuccessBuyer':
    "*نما سجل تداولك* بصفقة دُفعت كاملة.",
  'dealCancelled': '*تم إلغاء الصفقة*.',
  'dealDeliveredToBuyer':
    "*يقول البائع إن الطلب سُلّم*. افتح الصفقة لتتحقق منه وتصرف الدفعة.",
  'dealDeliveredToSeller':
    "*وضعت علامة التسليم على الصفقة*. المشتري يتحقق منها الآن.",
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
  'researchShort': "*ليس لدى وكيل البيع لديك مال للبحث*، لذا يستخدم أسعار كروان نفسها حاليًا. أضف إليه المال من المال، الوكيل.",
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
  'mandate.off': 'وكيلك متوقف. لا يفعل شيئًا لك حتى تعيد تشغيله.',
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
  'mandate.switch.offers': "تقديم العروض",
  'mandate.switch.bargain': "المساومة",
  'mandate.switch.agree': "الاتفاق على سعر",
  'mandate.switch.lock': "حجز المال",
  'mandate.switch.find': "البحث عن أشخاص",
  'mandate.switch.data': "الدفع مقابل الفحوص والبحث",
  'mandate.switch.brief': "إرسال ملخص الصباح",
  'mandate.does': "يمكنه وحده: {list}.",
  'mandate.doesNot': "متوقف: {list}.",
  'mandate.stopped.locks-today': "توقف وكيلك. حجز المال {n} مرات اليوم، وهو أقصى ما تسمح به في اليوم.",
  'mandate.stopped.lock-failures': "توقف وكيلك. فشل حجز المال 3 مرات متتالية.",
  'mandate.stopped.not-family': "توقف وكيلك. طُلب منه حجز مال خارج ضمان Karwan.",
  'mandate.lockRules': "حجز المال: بحد أقصى {deal} للصفقة و{week} في الأسبوع، {who}، {day} في اليوم.",
  'mandate.lockedWeek': "حجز {usdc} USDC وحده في آخر سبعة أيام.",
  'mandate.who.verified': "مع الأشخاص الموثَّقين فقط",
  'mandate.who.record': "مع من لديهم سجل فقط",
  'mandate.who.anyone': "مع أي شخص",
  'mandate.refuse.lockNeedsAgree': "شغّل الاتفاق على سعر أولًا.",
  'mandate.refuse.lockNeedsRules': "حدّد أولًا أقصى ما يحجزه لصفقة واحدة وفي الأسبوع.",
  'mandate.refuse.lockRules': "استخدم مبالغ أكبر من 0، والصفقة الواحدة لا تزيد على الأسبوع، ومن 1 إلى 10 مرات حجز في اليوم.",
  'mandate.refuse.notStopped': "وكيلك لم يتوقف.",
  'effect.switchOn': "يبدأ مع الطلب التالي.",
  'effect.switchOff': "يتوقف فورًا. الصفقات الجارية تستمر.",
  'effect.lockRules': "لا يُحجز شيء حتى السعر التالي الذي يتفق عليه.",
  'effect.resume': "عاد للعمل. حجز المال يبقى متوقفًا حتى تشغّله.",
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
  'effect.powerOff': 'يتوقف عن تقديم العروض والمساومة والبحث عن أشخاص وإرسال الملخصات. الصفقات الجارية تستمر، والعروض التي قدّمها تبقى، وتُسأل إذا اختار مشترٍ أحدها.',
  'effect.powerOn': 'يبدأ من جديد من الآن. لا يتصرف بناءً على ما فاته.',
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
  'alert.budgetRange': "الميزانية من {low} إلى {high}",
  'bargain.yourCall': "القرار لك",
  'bargain.yourCallOn': "القرار لك: {title}",
  'bargain.yourCallAsk': "سعر {seller} هو {price}. عرض وكيلك {offered}، أي أقل بمقدار {gap}.",
  'bargain.yourCallChoice': "وافق على {price}، أو واصل التفاوض؟ ردّ هنا. الموافقة لا تنقل أي أموال.",
  'pitch.headingNear': 'شخص قريب منك يمكنه مساعدتك فيما تحتاجه',
  'pitch.heading': 'شخص يمكنه مساعدتك فيما تحتاجه',
  'pitch.reminderNear': 'تذكير: شخص قريب منك يمكنه مساعدتك فيما تحتاجه',
  'pitch.reminder': 'تذكير: شخص يمكنه مساعدتك فيما تحتاجه',
  'pitch.offer': '{name} يعرض {price}، جاهز خلال {days} أيام',
  'pitch.offerOneDay': '{name} يعرض {price}، جاهز خلال يوم واحد',
  'pitch.offerTwoDays': '{name} يعرض {price}، جاهز خلال يومين',
  'pitch.offerManyDays': '{name} يعرض {price}، جاهز خلال {days} يومًا',
  'pitch.verified': 'موثّق',
  'pitch.rated': 'التقييم {stars}',
  'pitch.open': 'افتحه لتقول مهتم، أو ليس الآن، أو غير مهتم.',
  'pitch.interested': 'الشخص مهتم. عرضك الآن على طلبه الخاص.',
  'lock.heading': "وكيلك حجز المال",
  'lock.locked': "اتفقت على {price} USDC مع {who} وحجزت المبلغ في الضمان. مع الرسوم خرج {total} USDC من رصيدك. أنت من يفرج عنه عند تسليم العمل.",
  'lock.lockedMoved': "بدأ السعر عند {opened} USDC.",
  'lock.ask.heading': "وكيلك لم يحجز المال هذه المرة",
  'lock.ask.lead': "اتفقت على {price} USDC مع {who}.",
  'lock.ask.over-deal': "مع الرسوم يصل المبلغ إلى {total} USDC، وهذا فوق ما يحق لي حجزه لصفقة واحدة.",
  'lock.ask.over-week': "حجز {total} USDC يتجاوز ما يحق لي حجزه في أسبوع.",
  'lock.ask.who': "هذا البائع بلا سجل بعد، وقد طلبت مني الحجز فقط مع من لهم سجل.",
  'lock.ask.price-outlier': "السعر أعلى بكثير من المعتاد لهذا العمل على Karwan.",
  'lock.ask.not-family': "هذه الصفقة لا يمكنها استخدام الضمان المحمي هنا بعد.",
  'lock.ask.world-id': "هذه الصفقة تحتاج أولا إلى تحقق World ID.",
  'lock.ask.unverified': "هذا البائع غير موثق، لذا عليك تأكيده بنفسك.",
  'lock.ask.short': "رصيدي لا يكفي. أضف {add} USDC إلى وكيل الشراء.",
  'lock.ask.failed': "لم يتم حجز المال.",
  'lock.ask.tail': "لم يُحجز شيء. افتح الطلب لتحجز المال بنفسك.",
  'lock.stopped.heading': "وكيلك توقف",
  'lock.stopped.tail': "لن يفعل شيئا وحده حتى تعيد تشغيله من صفحة وكيلك.",
  'order.heading': "طلبك الدائم",
  'order.asked': "سألت {n} أشخاص عن \"{need}\": {names}.",
  'order.askedOne': "سألت {names} عن \"{need}\".",
  'order.asked.tail': "تصلك عروضهم فور ردّهم.",
  'order.pitched': "عرضت عملك على {n} مشترين يحتاجونه بانتظام.",
  'order.pitchedOne': "عرضت عملك على مشترٍ واحد يحتاجه بانتظام.",
  'order.pitched.tail': "أخبرك حين يهتم أحدهم.",
  'order.nobody.buy': "مرّت ثلاثة أيام ولا أحد جديد يناسب \"{need}\". أواصل البحث كل يوم. ميزانية أعلى أو منطقة أوسع تجد أشخاصا أكثر.",
  'order.nobody.sell': "مرّت ثلاثة أيام ولا مشترٍ جديد يناسب \"{need}\". أواصل البحث كل يوم.",
  'order.location': "لأجد أشخاصا من أجل \"{need}\" أحتاج أن أعرف مكانك تقريبا. أخبرني بحيّك ومدينتك.",
  'order.short': "رصيدك لا يكفي لنشر \"{need}\". أضف مالا وسأحاول غدا من جديد.",
  'order.ended': "\"{need}\" بلغ تاريخه، فتوقفت عن العمل عليه.",
};

const fr: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*Le {role} veut annuler cet accord*. Ouvrez l’accord pour accepter ou refuser.",
  'cancelProposedFromOther.platform':
    "*Le {role} dit que Karwan a fait ce rapprochement par erreur*. Ouvrez l’accord pour accepter ou refuser.",
  'cancelProposedFromSelf':
    "*Annulation proposée*. En attente de la décision de l'autre partie.",
  'cancelDeclinedToProposer':
    "*L’autre partie veut garder l’accord*. Il continue comme avant.",
  'cancelDeclinedBySelf':
    "*Vous avez gardé l’accord*. Il continue comme avant.",
  'milestoneReleasedToSeller.first':
    "*Premier paiement versé*. L’argent arrive chez vous.",
  'milestoneReleasedToSeller.final':
    "*Dernier paiement versé*. L’argent arrive chez vous.",
  'milestoneReleasedToBuyer.first': "*Premier paiement envoyé* au vendeur.",
  'milestoneReleasedToBuyer.final': "*Dernier paiement envoyé* au vendeur.",
  'bidAcceptedToSeller':
    "*Votre offre a été acceptée*. L’argent de l’acheteur est mis de côté pour vous ; vous serez prévenu quand ce sera fait.",
  'bidAcceptedToBuyer': "*Offre acceptée*. Votre argent est mis de côté pour l’accord.",
  'reputationRecordedSuccessSeller':
    "*Votre historique s’enrichit* d’un accord payé en entier. Ouvrez-le pour voir où vous en êtes.",
  'reputationRecordedSuccessBuyer':
    "*Votre historique s’enrichit* d’un accord payé en entier.",
  'dealCancelled': '*Transaction annulée*.',
  'dealDeliveredToBuyer':
    "*Le vendeur dit que c’est livré*. Ouvrez l’accord pour vérifier et verser le paiement.",
  'dealDeliveredToSeller':
    "*Vous avez marqué l’accord comme livré*. L’acheteur vérifie maintenant.",
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
  'researchShort': "*Votre agent de vente n'a pas d'argent pour ses recherches*, il utilise donc les prix de Karwan pour l'instant. Ajoutez-lui de l'argent dans Argent, Agent.",
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
  'mandate.off': "Votre agent est arrêté. Il ne fait rien pour vous tant que vous ne le rallumez pas.",
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
  'mandate.switch.offers': "faire des offres",
  'mandate.switch.bargain': "négocier",
  'mandate.switch.agree': "s'accorder sur un prix",
  'mandate.switch.lock': "bloquer de l'argent",
  'mandate.switch.find': "trouver des personnes",
  'mandate.switch.data': "payer les vérifications et la recherche",
  'mandate.switch.brief': "envoyer le résumé du matin",
  'mandate.does': "Seul, il peut : {list}.",
  'mandate.doesNot': "Désactivé : {list}.",
  'mandate.stopped.locks-today': "Votre agent s'est arrêté. Il a bloqué de l'argent {n} fois aujourd'hui, le maximum que vous autorisez par jour.",
  'mandate.stopped.lock-failures': "Votre agent s'est arrêté. Le blocage de l'argent a échoué 3 fois de suite.",
  'mandate.stopped.not-family': "Votre agent s'est arrêté. On lui a demandé de bloquer de l'argent hors d'un séquestre Karwan.",
  'mandate.lockRules': "Bloquer de l'argent : au plus {deal} par transaction et {week} par semaine, {who}, {day} par jour.",
  'mandate.lockedWeek': "Il a bloqué {usdc} USDC seul ces sept derniers jours.",
  'mandate.who.verified': "seulement avec des personnes vérifiées",
  'mandate.who.record': "seulement avec des personnes qui ont un dossier",
  'mandate.who.anyone': "avec n'importe qui",
  'mandate.refuse.lockNeedsAgree': "Activez d'abord S'accorder sur un prix.",
  'mandate.refuse.lockNeedsRules': "Fixez d'abord le maximum qu'il peut bloquer pour une transaction et par semaine.",
  'mandate.refuse.lockRules': "Utilisez des montants au-dessus de 0, une transaction pas plus qu'une semaine, et 1 à 10 blocages par jour.",
  'mandate.refuse.notStopped': "Votre agent ne s'est pas arrêté.",
  'effect.switchOn': "Il commence à la prochaine demande.",
  'effect.switchOff': "Il s'arrête tout de suite. Les transactions en cours continuent.",
  'effect.lockRules': "Rien n'est bloqué avant le prochain prix qu'il accepte.",
  'effect.resume': "Il est de nouveau actif. Bloquer de l'argent reste désactivé jusqu'à ce que vous l'activiez.",
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
  'effect.powerOff': "Il arrête de faire des offres, de négocier, de chercher des personnes et d'envoyer des résumés. Les transactions en cours continuent, ses offres déjà faites restent, et on vous demande si un acheteur en choisit une.",
  'effect.powerOn': "Il reprend à partir de maintenant. Il n'agit pas sur ce qu'il a manqué.",
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
  'alert.budgetRange': "Budget de {low} à {high}",
  'bargain.yourCall': "À vous de décider",
  'bargain.yourCallOn': "À vous de décider : {title}",
  'bargain.yourCallAsk': "{seller} demande {price}. Votre agent a proposé {offered}, soit {gap} de moins.",
  'bargain.yourCallChoice': "Accepter à {price}, ou continuer à négocier ? Répondez ici. Accepter ne déplace pas d'argent.",
  'pitch.headingNear': 'Quelqu\'un près de chez vous peut vous aider pour votre besoin',
  'pitch.heading': 'Quelqu\'un peut vous aider pour votre besoin',
  'pitch.reminderNear': 'Rappel : quelqu\'un près de chez vous peut vous aider pour votre besoin',
  'pitch.reminder': 'Rappel : quelqu\'un peut vous aider pour votre besoin',
  'pitch.offer': '{name} propose {price}, prêt en {days} jours',
  'pitch.offerOneDay': '{name} propose {price}, prêt en 1 jour',
  'pitch.offerTwoDays': '{name} propose {price}, prêt en 2 jours',
  'pitch.offerManyDays': '{name} propose {price}, prêt en {days} jours',
  'pitch.verified': 'Vérifié',
  'pitch.rated': 'Noté {stars}',
  'pitch.open': 'Ouvrez-la pour dire intéressé, pas maintenant, ou pas intéressé.',
  'pitch.interested': 'Cette personne est intéressée. Votre offre est maintenant sur sa demande privée.',
  'lock.heading': "Votre agent a bloqué de l'argent",
  'lock.locked': "J'ai convenu de {price} USDC avec {who} et bloqué la somme en séquestre. Avec les frais, {total} USDC ont quitté votre solde. Vous la libérez quand le travail est livré.",
  'lock.lockedMoved': "Le prix de départ était de {opened} USDC.",
  'lock.ask.heading': "Votre agent n'a pas bloqué cette somme",
  'lock.ask.lead': "J'ai convenu de {price} USDC avec {who}.",
  'lock.ask.over-deal': "Avec les frais, cela fait {total} USDC, plus que ce que je peux bloquer pour une affaire.",
  'lock.ask.over-week': "Bloquer {total} USDC dépasserait ce que je peux bloquer en une semaine.",
  'lock.ask.who': "Ce vendeur n'a pas encore d'historique, et vous m'avez demandé de bloquer seulement avec ceux qui en ont un.",
  'lock.ask.price-outlier': "Le prix est bien au-dessus de ce que cela coûte d'habitude sur Karwan.",
  'lock.ask.not-family': "Cette affaire ne peut pas encore utiliser le séquestre protégé ici.",
  'lock.ask.world-id': "Cette affaire demande d'abord une vérification World ID.",
  'lock.ask.unverified': "Ce vendeur n'est pas vérifié, vous devez donc le confirmer vous-même.",
  'lock.ask.short': "Je n'ai pas assez. Ajoutez {add} USDC à votre agent acheteur.",
  'lock.ask.failed': "Le blocage de l'argent n'a pas abouti.",
  'lock.ask.tail': "Rien n'est bloqué. Ouvrez la demande pour bloquer la somme vous-même.",
  'lock.stopped.heading': "Votre agent s'est arrêté",
  'lock.stopped.tail': "Il ne fait plus rien seul tant que vous ne le relancez pas dans Votre agent.",
  'order.heading': "Votre ordre permanent",
  'order.asked': "J'ai demandé à {n} personnes pour « {need} » : {names}.",
  'order.askedOne': "J'ai demandé à {names} pour « {need} ».",
  'order.asked.tail': "Leurs offres vous arrivent dès qu'ils répondent.",
  'order.pitched': "J'ai proposé votre travail à {n} acheteurs qui en ont besoin régulièrement.",
  'order.pitchedOne': "J'ai proposé votre travail à 1 acheteur qui en a besoin régulièrement.",
  'order.pitched.tail': "Vous êtes prévenu dès que l'un d'eux est intéressé.",
  'order.nobody.buy': "Trois jours et personne de nouveau ne convient pour « {need} ». Je continue de chercher chaque jour. Un budget plus élevé ou une zone plus large trouve plus de monde.",
  'order.nobody.sell': "Trois jours et aucun nouvel acheteur ne convient pour « {need} ». Je continue de chercher chaque jour.",
  'order.location': "Pour trouver des personnes pour « {need} », j'ai besoin de savoir à peu près où vous êtes. Dites-moi votre quartier et votre ville.",
  'order.short': "Votre solde est trop bas pour publier « {need} ». Ajoutez de l'argent et je réessaie demain.",
  'order.ended': "« {need} » a atteint sa date, j'ai donc arrêté d'y travailler.",
};

const hi: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*{role} यह सौदा रद्द करना चाहता है*. स्वीकार या अस्वीकार करने के लिए सौदा खोलें.",
  'cancelProposedFromOther.platform':
    "*{role} कहता है कि Karwan ने यह सौदा गलती से जोड़ा*. स्वीकार या अस्वीकार करने के लिए सौदा खोलें.",
  'cancelProposedFromSelf':
    '*रद्दीकरण प्रस्तावित*। दूसरे पक्ष की स्वीकृति या अस्वीकृति का इंतज़ार है।',
  'cancelDeclinedToProposer':
    "*दूसरा पक्ष सौदा जारी रखना चाहता है*. यह पहले की तरह चलता रहेगा.",
  'cancelDeclinedBySelf':
    "*आपने सौदा जारी रखा*. यह पहले की तरह चलता रहेगा.",
  'milestoneReleasedToSeller.first':
    "*पहला भुगतान जारी हुआ*. पैसा आपके पास आ रहा है.",
  'milestoneReleasedToSeller.final':
    "*आखिरी भुगतान जारी हुआ*. पैसा आपके पास आ रहा है.",
  'milestoneReleasedToBuyer.first': "*पहला भुगतान* विक्रेता को भेजा गया.",
  'milestoneReleasedToBuyer.final': "*आखिरी भुगतान* विक्रेता को भेजा गया.",
  'bidAcceptedToSeller':
    "*आपका ऑफ़र स्वीकार हुआ*. खरीदार का पैसा आपके लिए रोका जा रहा है; हो जाने पर आपको बताया जाएगा.",
  'bidAcceptedToBuyer': "*ऑफ़र स्वीकार हुआ*. आपका पैसा सौदे के लिए रोका जा रहा है.",
  'reputationRecordedSuccessSeller':
    "*आपका ट्रेड रिकॉर्ड बढ़ा*, एक पूरा भुगतान हुए सौदे से. अपनी स्थिति देखने के लिए इसे खोलें.",
  'reputationRecordedSuccessBuyer':
    "*आपका ट्रेड रिकॉर्ड बढ़ा*, एक पूरा भुगतान हुए सौदे से.",
  'dealCancelled': '*सौदा रद्द*।',
  'dealDeliveredToBuyer':
    "*विक्रेता कहता है कि डिलीवरी हो गई*. जाँचने और भुगतान जारी करने के लिए सौदा खोलें.",
  'dealDeliveredToSeller':
    "*आपने सौदे को डिलीवर हुआ बताया*. खरीदार अभी इसे जाँच रहा है.",
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
  'researchShort': "*आपके बेचने वाले एजेंट के पास खोज के लिए पैसा नहीं है*, इसलिए वह अभी Karwan की अपनी कीमतें इस्तेमाल कर रहा है। पैसा, एजेंट में जाकर उसमें पैसा जोड़ें।",
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
  'mandate.off': 'आपका एजेंट बंद है। जब तक आप इसे फिर चालू नहीं करते, यह आपके लिए कुछ नहीं करता।',
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
  'mandate.switch.offers': "पेशकश करना",
  'mandate.switch.bargain': "मोलभाव करना",
  'mandate.switch.agree': "कीमत पर सहमत होना",
  'mandate.switch.lock': "पैसा लॉक करना",
  'mandate.switch.find': "लोगों को खोजना",
  'mandate.switch.data': "जाँच और रिसर्च के लिए भुगतान करना",
  'mandate.switch.brief': "सुबह का सारांश भेजना",
  'mandate.does': "अकेले यह कर सकता है: {list}।",
  'mandate.doesNot': "बंद है: {list}।",
  'mandate.stopped.locks-today': "आपका एजेंट रुक गया। इसने आज {n} बार पैसा लॉक किया, जो एक दिन में आपकी तय सीमा है।",
  'mandate.stopped.lock-failures': "आपका एजेंट रुक गया। पैसा लॉक करना लगातार 3 बार विफल हुआ।",
  'mandate.stopped.not-family': "आपका एजेंट रुक गया। इससे Karwan एस्क्रो के बाहर पैसा लॉक करने को कहा गया।",
  'mandate.lockRules': "पैसा लॉक करना: एक सौदे में अधिकतम {deal} और हफ़्ते में {week}, {who}, दिन में {day} बार।",
  'mandate.lockedWeek': "इसने पिछले सात दिनों में अकेले {usdc} USDC लॉक किए।",
  'mandate.who.verified': "केवल सत्यापित लोगों के साथ",
  'mandate.who.record': "केवल रिकॉर्ड वाले लोगों के साथ",
  'mandate.who.anyone': "किसी के भी साथ",
  'mandate.refuse.lockNeedsAgree': "पहले कीमत पर सहमत होना चालू करें।",
  'mandate.refuse.lockNeedsRules': "पहले तय करें कि यह एक सौदे के लिए और एक हफ़्ते में अधिकतम कितना लॉक कर सकता है।",
  'mandate.refuse.lockRules': "0 से ऊपर की रकम रखें, एक सौदा हफ़्ते से ज़्यादा नहीं, और दिन में 1 से 10 लॉक।",
  'mandate.refuse.notStopped': "आपका एजेंट रुका नहीं है।",
  'effect.switchOn': "यह अगले अनुरोध से शुरू होता है।",
  'effect.switchOff': "यह तुरंत रुक जाता है। चल रहे सौदे जारी रहते हैं।",
  'effect.lockRules': "जब तक यह अगली कीमत पर सहमत नहीं होता, कुछ लॉक नहीं होता।",
  'effect.resume': "यह फिर चालू है। पैसा लॉक करना तब तक बंद रहता है जब तक आप इसे चालू नहीं करते।",
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
  'effect.powerOff': 'यह पेशकश करना, मोलभाव करना, लोगों को खोजना और सारांश भेजना बंद कर देता है। चल रहे सौदे जारी रहते हैं, इसकी की हुई पेशकशें बनी रहती हैं, और कोई खरीदार उनमें से एक चुने तो आपसे पूछा जाता है।',
  'effect.powerOn': 'यह अभी से फिर शुरू होता है। जो छूट गया उस पर यह कुछ नहीं करता।',
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
  'alert.budgetRange': "बजट {low} से {high}",
  'bargain.yourCall': "आपका फ़ैसला",
  'bargain.yourCallOn': "आपका फ़ैसला: {title}",
  'bargain.yourCallAsk': "{seller} {price} माँग रहे हैं। आपके एजेंट ने {offered} की पेशकश की, {gap} कम।",
  'bargain.yourCallChoice': "{price} पर सहमति दें, या मोलभाव जारी रखें? यहीं जवाब दें। सहमति देने से कोई पैसा नहीं जाता।",
  'pitch.headingNear': 'आपके पास कोई आपकी ज़रूरत में मदद कर सकता है',
  'pitch.heading': 'कोई आपकी ज़रूरत में मदद कर सकता है',
  'pitch.reminderNear': 'याद दिलाना: आपके पास कोई आपकी ज़रूरत में मदद कर सकता है',
  'pitch.reminder': 'याद दिलाना: कोई आपकी ज़रूरत में मदद कर सकता है',
  'pitch.offer': '{name}: {price}, {days} दिन में तैयार',
  'pitch.offerOneDay': '{name}: {price}, 1 दिन में तैयार',
  'pitch.offerTwoDays': '{name}: {price}, 2 दिन में तैयार',
  'pitch.offerManyDays': '{name}: {price}, {days} दिन में तैयार',
  'pitch.verified': 'सत्यापित',
  'pitch.rated': 'रेटिंग {stars}',
  'pitch.open': 'खोलें और बताएँ: रुचि है, अभी नहीं, या रुचि नहीं।',
  'pitch.interested': 'उन्हें रुचि है। आपका ऑफ़र अब उनके निजी अनुरोध पर है।',
  'lock.heading': "आपके एजेंट ने पैसा लॉक किया",
  'lock.locked': "मैंने {who} के साथ {price} USDC पर सहमति की और रकम एस्क्रो में लॉक कर दी। फ़ीस के साथ {total} USDC आपके बैलेंस से गए। काम मिलने पर आप ही इसे जारी करते हैं।",
  'lock.lockedMoved': "कीमत {opened} USDC से शुरू हुई थी।",
  'lock.ask.heading': "आपके एजेंट ने इस बार पैसा लॉक नहीं किया",
  'lock.ask.lead': "मैंने {who} के साथ {price} USDC पर सहमति की।",
  'lock.ask.over-deal': "फ़ीस के साथ यह {total} USDC होता है, जो एक सौदे के लिए मेरी सीमा से ऊपर है।",
  'lock.ask.over-week': "{total} USDC लॉक करने से मेरी हफ़्ते की सीमा पार हो जाएगी।",
  'lock.ask.who': "इस विक्रेता का अभी कोई रिकॉर्ड नहीं है, और आपने कहा था कि मैं केवल रिकॉर्ड वालों के साथ लॉक करूँ।",
  'lock.ask.price-outlier': "कीमत Karwan पर इस काम की आम कीमत से काफ़ी ऊपर है।",
  'lock.ask.not-family': "यह सौदा अभी यहाँ सुरक्षित एस्क्रो का उपयोग नहीं कर सकता।",
  'lock.ask.world-id': "इस सौदे के लिए पहले World ID जाँच ज़रूरी है।",
  'lock.ask.unverified': "यह विक्रेता सत्यापित नहीं है, इसलिए आपको खुद पुष्टि करनी होगी।",
  'lock.ask.short': "मेरे पास कम पैसा है। अपने ख़रीद एजेंट में {add} USDC जोड़ें।",
  'lock.ask.failed': "पैसा लॉक नहीं हो पाया।",
  'lock.ask.tail': "कुछ भी लॉक नहीं हुआ। खुद लॉक करने के लिए अनुरोध खोलें।",
  'lock.stopped.heading': "आपका एजेंट रुक गया",
  'lock.stopped.tail': "जब तक आप इसे आपका एजेंट में फिर चालू नहीं करते, यह अकेले कुछ नहीं करेगा।",
  'order.heading': "आपका स्थायी ऑर्डर",
  'order.asked': "मैंने \"{need}\" के लिए {n} लोगों से पूछा: {names}।",
  'order.askedOne': "मैंने \"{need}\" के लिए {names} से पूछा।",
  'order.asked.tail': "उनके जवाब आते ही उनके ऑफ़र आपके पास पहुँचेंगे।",
  'order.pitched': "मैंने आपका काम {n} खरीदारों को पेश किया जिन्हें इसकी नियमित ज़रूरत है।",
  'order.pitchedOne': "मैंने आपका काम 1 खरीदार को पेश किया जिसे इसकी नियमित ज़रूरत है।",
  'order.pitched.tail': "किसी की रुचि होते ही आपको बताऊँगा।",
  'order.nobody.buy': "तीन दिन हो गए और \"{need}\" के लिए कोई नया व्यक्ति नहीं मिला। मैं हर दिन खोजता रहूँगा। ज़्यादा बजट या बड़ा इलाका ज़्यादा लोग ढूँढता है।",
  'order.nobody.sell': "तीन दिन हो गए और \"{need}\" के लिए कोई नया खरीदार नहीं मिला। मैं हर दिन खोजता रहूँगा।",
  'order.location': "\"{need}\" के लिए लोग ढूँढने को मुझे मोटे तौर पर जानना होगा कि आप कहाँ हैं। अपना इलाका और शहर बताइए।",
  'order.short': "\"{need}\" पोस्ट करने के लिए आपका बैलेंस कम है। पैसे जोड़ें, मैं कल फिर कोशिश करूँगा।",
  'order.ended': "\"{need}\" की तारीख आ गई, इसलिए मैंने इस पर काम रोक दिया।",
};

const sw: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*{role} anataka kughairi makubaliano haya*. Fungua makubaliano ukubali au ukatae.",
  'cancelProposedFromOther.platform':
    "*{role} anasema Karwan iliunganisha makubaliano haya kimakosa*. Fungua makubaliano ukubali au ukatae.",
  'cancelProposedFromSelf':
    '*Pendekezo la kufuta limewasilishwa*. Tunasubiri upande mwingine kukubali au kukataa.',
  'cancelDeclinedToProposer':
    "*Upande mwingine unataka kuendelea na makubaliano*. Yanaendelea kama kawaida.",
  'cancelDeclinedBySelf':
    "*Umeendelea na makubaliano*. Yanaendelea kama kawaida.",
  'milestoneReleasedToSeller.first':
    "*Malipo ya kwanza yametolewa*. Pesa zinakuja kwako.",
  'milestoneReleasedToSeller.final':
    "*Malipo ya mwisho yametolewa*. Pesa zinakuja kwako.",
  'milestoneReleasedToBuyer.first': "*Malipo ya kwanza yametumwa* kwa muuzaji.",
  'milestoneReleasedToBuyer.final': "*Malipo ya mwisho yametumwa* kwa muuzaji.",
  'bidAcceptedToSeller':
    "*Ofa yako imekubaliwa*. Pesa za mnunuzi zinashikiliwa kwa ajili yako; utaarifiwa zikishashikiliwa.",
  'bidAcceptedToBuyer': "*Ofa imekubaliwa*. Pesa zako zinashikiliwa kwa ajili ya makubaliano.",
  'reputationRecordedSuccessSeller':
    "*Rekodi yako ya biashara imekua* kwa makubaliano yaliyolipwa kikamilifu. Ifungue uone ulipo.",
  'reputationRecordedSuccessBuyer':
    "*Rekodi yako ya biashara imekua* kwa makubaliano yaliyolipwa kikamilifu.",
  'dealCancelled': '*Mkataba umefutwa*.',
  'dealDeliveredToBuyer':
    "*Muuzaji anasema imewasilishwa*. Fungua makubaliano uikague na utoe malipo.",
  'dealDeliveredToSeller':
    "*Umeweka makubaliano kuwa yamewasilishwa*. Mnunuzi anayakagua sasa.",
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
  'researchShort': "*Wakala wako wa kuuza hana pesa za utafiti*, kwa hivyo anatumia bei za Karwan zenyewe kwa sasa. Mwongezee pesa kwenye Pesa, Wakala.",
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
  'mandate.off': 'Wakala wako amezimwa. Hakufanyii chochote hadi umwashe tena.',
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
  'mandate.switch.offers': "kutoa ofa",
  'mandate.switch.bargain': "kujadiliana bei",
  'mandate.switch.agree': "kukubali bei",
  'mandate.switch.lock': "kufunga pesa",
  'mandate.switch.find': "kutafuta watu",
  'mandate.switch.data': "kulipia ukaguzi na utafiti",
  'mandate.switch.brief': "kutuma muhtasari wa asubuhi",
  'mandate.does': "Peke yake anaweza: {list}.",
  'mandate.doesNot': "Imezimwa: {list}.",
  'mandate.stopped.locks-today': "Wakala wako amesimama. Amefunga pesa mara {n} leo, kiwango cha juu unachoruhusu kwa siku.",
  'mandate.stopped.lock-failures': "Wakala wako amesimama. Kufunga pesa kumeshindwa mara 3 mfululizo.",
  'mandate.stopped.not-family': "Wakala wako amesimama. Aliombwa kufunga pesa nje ya escrow ya Karwan.",
  'mandate.lockRules': "Kufunga pesa: isiyozidi {deal} kwa mkataba na {week} kwa wiki, {who}, mara {day} kwa siku.",
  'mandate.lockedWeek': "Amefunga {usdc} USDC peke yake katika siku saba zilizopita.",
  'mandate.who.verified': "na watu waliothibitishwa tu",
  'mandate.who.record': "na watu wenye rekodi tu",
  'mandate.who.anyone': "na mtu yeyote",
  'mandate.refuse.lockNeedsAgree': "Washa Kukubali bei kwanza.",
  'mandate.refuse.lockNeedsRules': "Weka kwanza kiwango cha juu anachoweza kufunga kwa mkataba mmoja na kwa wiki.",
  'mandate.refuse.lockRules': "Tumia kiasi kilicho juu ya 0, mkataba mmoja usizidi wiki, na mara 1 hadi 10 za kufunga kwa siku.",
  'mandate.refuse.notStopped': "Wakala wako hajasimama.",
  'effect.switchOn': "Anaanza na ombi linalofuata.",
  'effect.switchOff': "Anasimama mara moja. Mikataba inayoendelea inaendelea.",
  'effect.lockRules': "Hakuna kinachofungwa hadi bei inayofuata atakayokubali.",
  'effect.resume': "Amerudi kazini. Kufunga pesa kunabaki kumezimwa hadi ukiwashe.",
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
  'effect.powerOff': 'Anaacha kutoa ofa, kujadiliana bei, kutafuta watu na kutuma muhtasari. Mikataba inayoendelea inaendelea, ofa alizokwisha kutoa zinabaki, na unaulizwa mnunuzi akichagua moja.',
  'effect.powerOn': 'Anaanza tena kuanzia sasa. Hashughulikii alichokosa.',
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
  'alert.budgetRange': "Bajeti {low} hadi {high}",
  'bargain.yourCall': "Uamuzi ni wako",
  'bargain.yourCallOn': "Uamuzi ni wako: {title}",
  'bargain.yourCallAsk': "{seller} anaomba {price}. Wakala wako alitoa {offered}, pungufu kwa {gap}.",
  'bargain.yourCallChoice': "Kubali kwa {price}, au endelea kujadiliana? Jibu hapa. Kukubali hakuhamishi pesa yoyote.",
  'pitch.headingNear': 'Mtu karibu nawe anaweza kukusaidia na unachohitaji',
  'pitch.heading': 'Mtu anaweza kukusaidia na unachohitaji',
  'pitch.reminderNear': 'Kumbusho: mtu karibu nawe anaweza kukusaidia na unachohitaji',
  'pitch.reminder': 'Kumbusho: mtu anaweza kukusaidia na unachohitaji',
  'pitch.offer': '{name} anatoa {price}, tayari ndani ya siku {days}',
  'pitch.offerOneDay': '{name} anatoa {price}, tayari ndani ya siku 1',
  'pitch.offerTwoDays': '{name} anatoa {price}, tayari ndani ya siku 2',
  'pitch.offerManyDays': '{name} anatoa {price}, tayari ndani ya siku {days}',
  'pitch.verified': 'Amethibitishwa',
  'pitch.rated': 'Ukadiriaji {stars}',
  'pitch.open': 'Fungua useme unavutiwa, si sasa, au huvutiwi.',
  'pitch.interested': 'Wanavutiwa. Ofa yako sasa iko kwenye ombi lao la faragha.',
  'lock.heading': "Wakala wako amefunga pesa",
  'lock.locked': "Nimekubaliana {price} USDC na {who} na kufunga pesa kwenye escrow. Pamoja na ada, {total} USDC zimetoka kwenye salio lako. Wewe ndiye unayeziachilia kazi ikifika.",
  'lock.lockedMoved': "Bei ilianza {opened} USDC.",
  'lock.ask.heading': "Wakala wako hakufunga pesa safari hii",
  'lock.ask.lead': "Nimekubaliana {price} USDC na {who}.",
  'lock.ask.over-deal': "Pamoja na ada inafika {total} USDC, zaidi ya ninachoruhusiwa kufunga kwa dili moja.",
  'lock.ask.over-week': "Kufunga {total} USDC kungepita ninachoruhusiwa kufunga kwa wiki.",
  'lock.ask.who': "Muuzaji huyu bado hana rekodi, na uliniambia nifunge tu na wenye rekodi.",
  'lock.ask.price-outlier': "Bei iko juu sana kuliko kawaida ya kazi hii kwenye Karwan.",
  'lock.ask.not-family': "Dili hili bado haliwezi kutumia escrow iliyolindwa hapa.",
  'lock.ask.world-id': "Dili hili linahitaji ukaguzi wa World ID kwanza.",
  'lock.ask.unverified': "Muuzaji huyu hajathibitishwa, kwa hiyo lazima umthibitishe mwenyewe.",
  'lock.ask.short': "Nina pesa kidogo. Ongeza {add} USDC kwa wakala wako wa kununua.",
  'lock.ask.failed': "Kufunga pesa hakukufanikiwa.",
  'lock.ask.tail': "Hakuna kilichofungwa. Fungua ombi ufunge mwenyewe.",
  'lock.stopped.heading': "Wakala wako amesimama",
  'lock.stopped.tail': "Hatafanya lolote peke yake hadi umwashe tena kwenye Wakala wako.",
  'order.heading': "Agizo lako la kudumu",
  'order.asked': "Nimewauliza watu {n} kuhusu \"{need}\": {names}.",
  'order.askedOne': "Nimemuuliza {names} kuhusu \"{need}\".",
  'order.asked.tail': "Ofa zao zinakufikia wanapojibu.",
  'order.pitched': "Nimetoa kazi yako kwa wanunuzi {n} wanaoihitaji mara kwa mara.",
  'order.pitchedOne': "Nimetoa kazi yako kwa mnunuzi 1 anayeihitaji mara kwa mara.",
  'order.pitched.tail': "Utajulishwa mmoja akipendezwa.",
  'order.nobody.buy': "Siku tatu na hakuna mtu mpya anayefaa kwa \"{need}\". Naendelea kutafuta kila siku. Bajeti kubwa zaidi au eneo pana zaidi hupata watu wengi zaidi.",
  'order.nobody.sell': "Siku tatu na hakuna mnunuzi mpya anayefaa kwa \"{need}\". Naendelea kutafuta kila siku.",
  'order.location': "Ili kupata watu kwa ajili ya \"{need}\" nahitaji kujua takriban ulipo. Niambie mtaa na jiji lako.",
  'order.short': "Salio lako ni dogo mno kuchapisha \"{need}\". Ongeza pesa nami nitajaribu tena kesho.",
  'order.ended': "\"{need}\" imefika tarehe yake, kwa hiyo nimeacha kuifanyia kazi.",
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
