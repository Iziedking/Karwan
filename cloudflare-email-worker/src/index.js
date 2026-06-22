import PostalMime from 'postal-mime';

/// Cloudflare Email Worker: catches mail sent to the inbound subdomain and
/// posts it to the Karwan support webhook, which turns it into a ticket.
/// Free — runs on Cloudflare Email Routing.
///
/// The webhook URL (which embeds the secret) comes from `env.WEBHOOK_URL`, set
/// with `npx wrangler secret put WEBHOOK_URL` (encrypted in Cloudflare, not in
/// any file). For local `wrangler dev`, put it in a gitignored `.dev.vars`.

export default {
  async email(message, env, _ctx) {
    const webhook = env.WEBHOOK_URL;
    if (!webhook) {
      console.log('WEBHOOK_URL not configured');
      return;
    }

    let subject = message.headers.get('subject') || '';
    let text = '';
    try {
      const parser = new PostalMime();
      const parsed = await parser.parse(message.raw);
      text = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
      if (!subject) subject = parsed.subject || '';
    } catch (err) {
      // Couldn't parse the body; still forward sender + subject so the operator
      // at least gets a ticket and can reply.
      console.log('parse failed', err);
    }

    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: message.from, subject, text }),
    });
  },
};
