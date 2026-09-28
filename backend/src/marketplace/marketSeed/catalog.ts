/// The operator market catalog: real offers and requests the Karwan team posts
/// from its own testnet accounts, fulfilled with test USDC. Each account takes
/// one group of three specialties by its position in the operator's request,
/// so no email or name lives in code.

export type Lane = 'service' | 'goods';

export interface Specialty {
  id: string;
  lane: Lane;
  /// [title, description, base price in USDC]
  offers: ReadonlyArray<readonly [string, string, number]>;
  /// [brief, budget in USDC]
  requests: ReadonlyArray<readonly [string, number]>;
}

export interface Variant {
  label: string;
  multiplier: number;
  detail: string;
}

export const SERVICE_VARIANTS: readonly Variant[] = [
  { label: 'Basic', multiplier: 1, detail: 'One round of revisions, delivered in 5 days.' },
  { label: 'Standard', multiplier: 1.8, detail: 'Two rounds of revisions, delivered in 4 days.' },
  { label: 'Premium', multiplier: 3, detail: 'Revisions for 14 days after delivery, delivered in 3 days.' },
  { label: '48-hour', multiplier: 2.2, detail: 'Delivered within 48 hours, with one round of revisions.' },
  { label: 'Bundle of 3', multiplier: 2.6, detail: 'Three of these, delivered together in 7 days.' },
];

export const GOODS_VARIANTS: readonly Variant[] = [
  { label: 'Lagos delivery', multiplier: 1, detail: 'Delivered within Lagos in 2 days.' },
  { label: 'Abuja delivery', multiplier: 1.05, detail: 'Delivered to Abuja in 3 days.' },
  { label: 'Accra delivery', multiplier: 1.1, detail: 'Shipped to Accra in 4 to 6 days.' },
  { label: 'Nairobi delivery', multiplier: 1.12, detail: 'Shipped to Nairobi in 5 to 7 days.' },
  { label: 'Pickup in Ikeja', multiplier: 0.97, detail: 'Collected in Ikeja, Lagos, at a time you choose.' },
];

export const SPECIALTIES: readonly Specialty[] = [
  {
    id: 'brand-design', lane: 'service',
    offers: [
      ['Logo design', 'An original logo with a mark and wordmark, supplied in SVG, PNG and PDF.', 120],
      ['Brand identity kit', 'Logo, colour palette, type pairing and a two-page usage guide.', 350],
      ['Business card design', 'Print-ready front and back design with bleed, in PDF.', 40],
      ['Social media profile kit', 'Profile image, cover banners and a post template sized for four platforms.', 60],
      ['Product packaging design', 'Print-ready packaging artwork for one product, fitted to your dieline.', 280],
      ['Flyer or poster design', 'A single-page flyer or poster in print and digital versions.', 45],
      ['Pitch deck design', 'Up to 15 slides designed from your content, in Keynote or PowerPoint.', 220],
      ['Brand refresh', 'An update of an existing logo and colours that keeps what customers recognise.', 300],
      ['Menu design', 'A restaurant or cafe menu in print and QR-friendly PDF formats.', 70],
      ['Letterhead and invoice template', 'Editable letterhead and invoice templates in Word and Google Docs.', 50],
    ],
    requests: [
      ['Need a clean logo and colour palette for a new food delivery brand.', 150],
      ['Looking for a designer to redo our pitch deck, about 12 slides.', 180],
      ['Need packaging artwork for a 250 ml juice bottle label.', 120],
      ['Want a set of business cards and a letterhead that match our logo.', 60],
      ['Need a flyer for a weekend pop-up market, print and Instagram sizes.', 40],
    ],
  },
  {
    id: 'social-content', lane: 'service',
    offers: [
      ['Instagram content pack', 'Twelve designed posts with captions, planned as a two-week grid.', 90],
      ['Short video edits for Reels or TikTok', 'Five vertical edits up to 30 seconds from your raw clips, with captions.', 110],
      ['Content calendar', 'A 30-day posting plan with themes, formats and suggested captions.', 60],
      ['LinkedIn ghostwriting', 'Eight LinkedIn posts in your voice, drafted from a short interview.', 150],
      ['Community management', 'Replies to comments and messages on two platforms, one hour each weekday for two weeks.', 200],
      ['Product launch campaign', 'A launch plan with teaser, launch and follow-up posts across three platforms.', 260],
      ['Carousel posts', 'Four educational carousels of up to eight slides each.', 55],
      ['Social media audit', 'A review of your profiles and last 30 posts with a prioritised fix list.', 70],
      ['X thread writing', 'Three threads of up to ten posts each on topics you choose.', 45],
      ['Creator outreach list', 'Twenty vetted creators in your niche with contact details and a pitch message.', 85],
    ],
    requests: [
      ['Need someone to plan and design a month of Instagram posts for a skincare brand.', 120],
      ['Looking for five short Reels edited from footage I already shot.', 90],
      ['Need a LinkedIn post series about our product launch, about eight posts.', 130],
      ['Want an audit of our TikTok and Instagram with clear next steps.', 60],
      ['Need a list of 20 micro-creators in fashion who take paid collaborations.', 70],
    ],
  },
  {
    id: 'copywriting', lane: 'service',
    offers: [
      ['Website copy', 'Copy for up to five pages: home, about, services, pricing and contact.', 180],
      ['Product descriptions', 'Ten product descriptions written for search and conversion.', 60],
      ['Email newsletter', 'One newsletter issue of about 600 words, ready to send.', 50],
      ['Blog article', 'A researched 1,200-word article with headings and a meta description.', 70],
      ['Sales page', 'Long-form sales page copy with headline options and FAQs.', 220],
      ['Email welcome sequence', 'Five automated welcome emails for new subscribers.', 140],
      ['About page and founder story', 'An about page that tells your story in under 500 words.', 65],
      ['Ad copy set', 'Ten ad variations for Meta or Google with headlines and descriptions.', 55],
      ['Proofreading and editing', 'A line edit and proofread of up to 3,000 words.', 35],
      ['App store listing copy', 'Title, subtitle and description for the App Store and Google Play.', 60],
    ],
    requests: [
      ['Need homepage and about page copy for a logistics startup.', 150],
      ['Looking for someone to write 20 product descriptions for an online store.', 100],
      ['Need a five-email welcome sequence for new newsletter subscribers.', 120],
      ['Want two blog articles a month on small business finance.', 110],
      ['Need our app store listing rewritten to improve installs.', 60],
    ],
  },
  {
    id: 'web-development', lane: 'service',
    offers: [
      ['Landing page build', 'A responsive one-page site built from your design or a clean template.', 250],
      ['Small business website', 'Up to five pages with a contact form, basic SEO and hosting setup.', 450],
      ['WordPress fixes', 'Fix up to three issues on an existing WordPress site.', 60],
      ['Online store setup', 'A Shopify or WooCommerce store with up to 20 products loaded.', 380],
      ['Website speed optimisation', 'Image, caching and script fixes with before and after scores.', 120],
      ['API integration', 'Connect your site or app to one third-party API, with tests.', 300],
      ['Bug fixing session', 'Two hours of debugging on a web app you already run.', 80],
      ['Contact form and email setup', 'A working contact form wired to your inbox with spam protection.', 45],
      ['Website migration', 'Move a site to a new host or domain with no lost pages.', 150],
      ['Custom admin dashboard', 'A simple admin dashboard over your existing data source.', 420],
    ],
    requests: [
      ['Need a landing page for a product waitlist, design is ready in Figma.', 200],
      ['Looking for a developer to fix checkout errors on our WooCommerce store.', 90],
      ['Need our website moved to a new host without downtime.', 120],
      ['Want a small internal dashboard that reads from a Google Sheet.', 180],
      ['Need a contact form and booking page added to an existing site.', 70],
    ],
  },
  {
    id: 'qa-testing', lane: 'service',
    offers: [
      ['Mobile app test pass', 'Manual test of core flows on Android and iOS, with a written bug report.', 140],
      ['Website cross-browser test', 'Checks on Chrome, Safari, Firefox and a phone, with screenshots of issues.', 90],
      ['Test case writing', 'Up to 40 test cases for a feature, in a spreadsheet you can reuse.', 110],
      ['Accessibility check', 'A WCAG 2.2 AA review of up to five pages with fixes listed.', 130],
      ['Automated UI tests', 'Playwright tests for up to five key user journeys.', 280],
      ['Payment flow testing', 'End-to-end checks of checkout and refunds in test mode.', 120],
      ['Usability review', 'A walkthrough of your sign-up and first task with clear findings.', 100],
      ['Release regression test', 'A full pass on your release checklist, with results within a day of the build.', 150],
      ['API testing', 'A Postman collection and checks for up to 20 endpoints.', 160],
      ['Localisation check', 'A review of text and layout in two languages for truncation and mistakes.', 90],
    ],
    requests: [
      ['Need a tester to go through our Android app before release and log bugs.', 110],
      ['Looking for an accessibility review of our sign-up and checkout pages.', 120],
      ['Need Playwright tests written for login, search and checkout.', 200],
      ['Want someone to test our payment flow end to end in sandbox mode.', 90],
      ['Need a usability review of our onboarding with five real tasks.', 80],
    ],
  },
  {
    id: 'technical-writing', lane: 'service',
    offers: [
      ['API documentation', 'Reference docs for up to 20 endpoints with request and response examples.', 260],
      ['Product user guide', 'A step-by-step guide for your product with screenshots.', 180],
      ['README and setup guide', 'A clear README with install, configuration and first-run steps.', 70],
      ['Help centre articles', 'Five help articles answering your most common support questions.', 120],
      ['Release notes', 'Customer-facing release notes written from your changelog.', 40],
      ['Developer onboarding emails', 'A four-email sequence that gets developers to their first API call.', 110],
      ['Standard operating procedures', 'Up to five internal SOPs written from interviews with your team.', 150],
      ['Whitepaper editing', 'A structural edit and proofread of a technical whitepaper up to 6,000 words.', 200],
      ['Tutorial with sample code', 'A working tutorial with runnable examples in one language.', 140],
      ['Product FAQ', 'Twenty clear questions and answers for your site.', 55],
    ],
    requests: [
      ['Need API reference docs for about 15 REST endpoints.', 200],
      ['Looking for someone to write help centre articles for our top support questions.', 100],
      ['Need SOPs written for our order fulfilment process.', 120],
      ['Want a getting-started tutorial for our SDK with code samples.', 130],
      ['Need our product FAQ rewritten in plain language.', 50],
    ],
  },
  {
    id: 'bookkeeping', lane: 'service',
    offers: [
      ['Monthly bookkeeping', 'Up to 150 transactions categorised and reconciled each month.', 120],
      ['Catch-up bookkeeping', 'Up to six months of books brought current.', 250],
      ['Invoicing and receipts setup', 'An invoicing workflow and receipt capture set up in your tool.', 60],
      ['Profit and loss statement', 'A monthly profit and loss statement with a short note on what changed.', 80],
      ['Payroll preparation', 'Payroll figures prepared for up to 10 staff.', 100],
      ['Expense tracking spreadsheet', 'A ready-to-use expense tracker with monthly summaries.', 45],
      ['Cash flow forecast', 'A 12-week cash flow forecast you can update weekly.', 150],
      ['Bank reconciliation', 'One account reconciled for one month, with gaps flagged.', 70],
      ['Year-end schedules', 'Year-end schedules prepared and ready for your accountant.', 300],
      ['Accounting software setup', 'QuickBooks, Xero or Wave set up with your chart of accounts.', 110],
    ],
    requests: [
      ['Need monthly bookkeeping for a small retail shop, about 100 transactions.', 100],
      ['Looking for help catching up on four months of unreconciled books.', 180],
      ['Need a 12-week cash flow forecast before a supplier negotiation.', 120],
      ['Want Xero set up for a new company with a simple chart of accounts.', 90],
      ['Need payroll prepared for eight staff this month.', 80],
    ],
  },
  {
    id: 'data-analysis', lane: 'service',
    offers: [
      ['Sales dashboard', 'A dashboard of revenue, orders and top products from your data.', 200],
      ['Spreadsheet cleanup', 'One messy Excel or Google Sheets file cleaned, deduplicated and structured.', 60],
      ['Customer survey analysis', 'Analysis of up to 500 responses with charts and key findings.', 140],
      ['Market research summary', 'A short report on size, competitors and pricing for one market.', 180],
      ['Website analytics review', 'What your traffic data says and what to change first.', 90],
      ['Data entry', 'Up to 500 records entered from documents into a spreadsheet.', 40],
      ['Financial model', 'A three-statement model with editable assumptions.', 260],
      ['SQL reporting queries', 'Up to five saved queries that answer your business questions.', 120],
      ['Pricing analysis', 'A review of your prices against competitors with recommendations.', 150],
      ['Monthly KPI report', 'A one-page KPI report with trends and notes.', 100],
    ],
    requests: [
      ['Need a sales dashboard built from our Shopify exports.', 160],
      ['Looking for someone to analyse 300 customer survey responses.', 110],
      ['Need a competitor pricing review for five phone accessory shops.', 100],
      ['Want a simple financial model for a seed fundraise.', 200],
      ['Need 400 supplier records entered and cleaned in a spreadsheet.', 50],
    ],
  },
  {
    id: 'virtual-assistance', lane: 'service',
    offers: [
      ['Inbox management', 'Daily inbox triage and replies for one week.', 80],
      ['Calendar and scheduling', 'Meeting scheduling and reminders for one week.', 60],
      ['Travel booking', 'Flights, hotel and an itinerary for one trip.', 45],
      ['Lead research', 'Fifty qualified leads with names, roles and emails.', 90],
      ['Customer support replies', 'Replies to support tickets for 10 hours over one week.', 100],
      ['Document formatting', 'Up to 30 pages formatted into a clean document.', 35],
      ['Online research task', 'Research on one question with sources, delivered as a summary.', 50],
      ['CRM data cleanup', 'Up to 1,000 CRM contacts cleaned and updated.', 85],
      ['Order processing', 'Online orders processed and tracked for one week.', 70],
      ['Supplier outreach', 'Up to 20 suppliers contacted and their quotes compared.', 75],
    ],
    requests: [
      ['Need a virtual assistant to manage my inbox for two weeks.', 120],
      ['Looking for 50 B2B leads in Nigerian fintech with verified emails.', 80],
      ['Need help booking travel and meetings for a trip to Nairobi.', 60],
      ['Want someone to contact 15 packaging suppliers and compare quotes.', 70],
      ['Need our CRM cleaned up, about 800 contacts.', 70],
    ],
  },
  {
    id: 'photo-video', lane: 'service',
    offers: [
      ['Product photography', 'Ten edited product photos on a clean background.', 150],
      ['Event photography', 'Four hours of event coverage with 100 edited photos.', 220],
      ['Headshot session', 'A one-hour session with five retouched headshots.', 80],
      ['Promo video edit', 'A 60-second promo edited from your footage with music and titles.', 180],
      ['YouTube video editing', 'One video up to 15 minutes edited with cuts, captions and a thumbnail.', 120],
      ['Photo retouching', 'Retouching of up to 20 photos.', 40],
      ['Real estate photography', 'Interior and exterior photos of one property, 25 edited images.', 170],
      ['Wedding highlight film', 'A three-to-five-minute highlight film from your wedding footage.', 400],
      ['Drone footage edit', 'A short edit from your drone clips with colour grading.', 140],
      ['Food photography', 'Twelve styled and edited dish photos for menus and delivery apps.', 130],
    ],
    requests: [
      ['Need product photos for 15 items on a white background.', 140],
      ['Looking for a photographer for a four-hour launch event in Lagos.', 200],
      ['Need a 60-second promo video cut from existing footage.', 150],
      ['Want team headshots for six people.', 120],
      ['Need a YouTube video edited with captions and a thumbnail.', 90],
    ],
  },
  {
    id: 'translation', lane: 'service',
    offers: [
      ['English to French translation', 'Translation of up to 2,000 words, proofread by a second linguist.', 90],
      ['English to Arabic translation', 'Translation of up to 2,000 words with right-to-left layout checked.', 110],
      ['Official document translation', 'Translation of official documents formatted for certification.', 150],
      ['Website localisation', 'Your site translated into one language, with search terms adapted.', 250],
      ['Subtitle translation', 'Translated subtitles for a video up to 20 minutes.', 80],
      ['English to Swahili translation', 'Translation of up to 2,000 words for East African readers.', 90],
      ['English to Hausa translation', 'Translation of up to 2,000 words.', 80],
      ['Audio transcription', 'Transcription of up to 60 minutes of audio with timestamps.', 50],
      ['Translation proofreading', 'A native-speaker check of an existing translation up to 3,000 words.', 45],
      ['App localisation', 'App strings translated into one language with context checks.', 170],
    ],
    requests: [
      ['Need our website translated into French for West African customers.', 200],
      ['Looking for Swahili subtitles for a 10-minute product video.', 70],
      ['Need a contract translated from English to Arabic.', 120],
      ['Want 45 minutes of interview audio transcribed with timestamps.', 45],
      ['Need our app strings localised into Hausa.', 130],
    ],
  },
  {
    id: 'voice-audio', lane: 'service',
    offers: [
      ['Commercial voice-over', 'A 30-second ad read, recorded and cleaned, with two takes.', 120],
      ['Explainer video narration', 'Narration up to 2 minutes, synced to your video.', 150],
      ['Phone system greetings', 'Up to five recorded phone system prompts.', 60],
      ['Audiobook narration', 'Narration of up to 20,000 words with edits and mastering.', 400],
      ['E-learning narration', 'Narration for up to 10 short course modules.', 200],
      ['Podcast editing', 'One episode up to 60 minutes edited, with noise removal.', 90],
      ['Radio jingle', 'A 15-second jingle with voice and a music bed.', 180],
      ['Character voices for animation', 'Up to three character voices for a short animation.', 160],
      ['Pidgin English voice-over', 'A natural Pidgin read up to 60 seconds for ads or explainers.', 90],
      ['Audio clean-up', 'Noise and echo removed from up to 30 minutes of audio.', 50],
    ],
    requests: [
      ['Need a 30-second radio ad voiced in Pidgin English.', 100],
      ['Looking for narration for a two-minute explainer video.', 130],
      ['Need our podcast episodes edited, two episodes of about 45 minutes.', 150],
      ['Want phone greetings recorded for our customer line.', 50],
      ['Need a short jingle for a campus radio campaign.', 150],
    ],
  },
  {
    id: 'phones-electronics', lane: 'goods',
    offers: [
      ['Used iPhone 13, 128 GB', 'Unlocked, battery health above 85 percent, tested and wiped, with a charger.', 420],
      ['Samsung Galaxy A54 5G', 'New in box, 128 GB, with a one-year local warranty.', 290],
      ['Refurbished MacBook Air M1', '8 GB RAM, 256 GB SSD, clean battery report, with a charger.', 650],
      ['Tecno Camon 20', 'New in box, 256 GB, dual SIM.', 170],
      ['AirPods Pro, second generation', 'Sealed in box, with the MagSafe case.', 180],
      ['Power bank, 20,000 mAh', 'Fast charging with two USB ports and USB-C.', 25],
      ['Solar home kit', 'Panel, battery and three bulbs, enough for lights and phone charging.', 240],
      ['Wi-Fi 6 router', 'Dual-band router, new in box.', 55],
      ['Used iPad, 9th generation', '64 GB Wi-Fi model, screen and battery in good condition.', 230],
      ['Fitness smartwatch', 'Heart rate and sleep tracking with a two-week battery.', 70],
    ],
    requests: [
      ['Looking to buy a used iPhone 12 or 13 in good condition, unlocked.', 350],
      ['Need five power banks for our field team.', 120],
      ['Want a refurbished laptop for design work, at least 16 GB RAM.', 450],
      ['Need a solar kit to keep a small shop lit during outages.', 220],
      ['Looking for two Wi-Fi routers for a small office.', 100],
    ],
  },
  {
    id: 'fashion-tailoring', lane: 'goods',
    offers: [
      ['Ankara two-piece set', 'Made to your measurements from quality Ankara fabric.', 60],
      ["Men's senator outfit", 'Tailored top and trousers, made to measure.', 75],
      ['Agbada three-piece', 'Embroidered agbada made to measure for events.', 180],
      ['Wedding guest dress', 'Designed with you and made to measure.', 140],
      ['Adire fabric, 6 yards', 'Hand-dyed adire from Abeokuta.', 35],
      ['Handmade leather sandals', 'Made in Aba, sizes 38 to 46.', 40],
      ['Aso-oke set', 'Gele, ipele and iro woven to order for ceremonies.', 150],
      ["Children's native outfit", 'Made to measure for ages 2 to 12.', 30],
      ['Kente stole', 'Handwoven kente stole for graduations.', 45],
      ['Alterations bundle', 'Up to three garments altered to fit.', 25],
    ],
    requests: [
      ['Need matching Ankara outfits for a team of six for a trade fair.', 300],
      ['Looking for a tailor to make a senator outfit for a wedding next month.', 80],
      ['Want 12 yards of hand-dyed adire for a design project.', 70],
      ['Need aso-oke sets for a family ceremony, four people.', 400],
      ['Looking for handmade leather sandals in bulk, 20 pairs.', 450],
    ],
  },
  {
    id: 'home-crafts', lane: 'goods',
    offers: [
      ['Handwoven raffia basket set', 'Three nesting baskets for storage.', 40],
      ['Shea butter, 1 kg', 'Unrefined grade A shea butter.', 18],
      ['Carved wooden serving tray', 'Carved from mahogany with a food-safe finish.', 35],
      ['African black soap, 12 bars', 'Traditional black soap from Ghana.', 22],
      ['Beaded necklace', 'A handmade glass bead necklace.', 25],
      ['Scented soy candles, set of 4', 'Soy wax candles in local scents.', 30],
      ['Mudcloth pillow covers, set of 2', 'Covers in a mudcloth pattern, 45 by 45 cm.', 28],
      ['Clay cooking pot', 'A traditional clay pot for soups and stews.', 32],
      ['Woven wall hanging', 'Handwoven wall art, about 60 by 90 cm.', 50],
      ['Natural hair care set', 'Oil, butter and leave-in conditioner in one set.', 26],
    ],
    requests: [
      ['Need 30 raffia baskets for a hotel room refresh.', 400],
      ['Looking to buy 10 kg of unrefined shea butter for a skincare line.', 150],
      ['Want handmade gift sets for 25 clients, candles or soap.', 350],
      ['Need carved wooden trays for a restaurant, 12 pieces.', 300],
      ['Looking for woven wall art for a new office, three pieces.', 140],
    ],
  },
];

/// One group of three specialties per account, in the operator's order, and a
/// line about that account's business that makes each of its requests its own.
export const ACCOUNT_GROUPS: ReadonlyArray<{ specialties: readonly string[]; context: string }> = [
  { specialties: ['brand-design', 'social-content', 'copywriting'], context: 'It is for a small design studio in Lagos.' },
  { specialties: ['web-development', 'qa-testing', 'technical-writing'], context: 'It is for a software team building a payments app.' },
  { specialties: ['bookkeeping', 'data-analysis', 'virtual-assistance'], context: 'It is for a bookkeeping practice with retail clients.' },
  { specialties: ['photo-video', 'translation', 'voice-audio'], context: 'It is for a media studio in Abuja.' },
  { specialties: ['phones-electronics', 'fashion-tailoring', 'home-crafts'], context: 'It is for an online shop that sells across West Africa.' },
];
