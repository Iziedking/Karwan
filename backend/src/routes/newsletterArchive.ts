import { Hono } from 'hono';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSentIssueBySlug, listSentIssues, type NewsletterIssue } from '../db/newsletter.js';

/// The public archive.
///
/// Every issue needs a url that outlives the inbox it landed in: for the "read
/// this in your browser" link, for the Telegram announcement, and for anyone who
/// finds Karwan later and wants to know what we have been doing.
///
/// Only sent issues, ever. `listSentIssues` filters on status, and this route
/// looks up through it rather than through `getIssue`, so there is no path here
/// that can reach a draft by guessing its id. A draft reachable by url is a
/// draft published by accident.

export const newsletterArchiveRoutes = new Hono();

const archiveLimit = rateLimit({ windowMs: 60_000, max: 60, name: 'newsletter-archive' });

/// The public shape. Deliberately not the stored one: `signalIds`, the
/// collection window and the rejection history are ours, not a reader's.
function publicView(issue: NewsletterIssue) {
  return {
    slug: issue.slug,
    subject: issue.subject,
    preheader: issue.preheader,
    sentAt: issue.sentAt,
    monthInReview: issue.monthInReview,
    sections: issue.sections.map((s) => ({ heading: s.heading, body: s.body })),
    sources: issue.sources.map((s) => ({
      title: s.title,
      url: s.url,
      source: s.source,
      publishedAt: s.publishedAt,
    })),
  };
}

/// GET /api/newsletter/archive
newsletterArchiveRoutes.get('/archive', archiveLimit, async (c) => {
  const issues = await listSentIssues();
  return c.json({
    issues: issues.map((i) => ({
      slug: i.slug,
      subject: i.subject,
      preheader: i.preheader,
      sentAt: i.sentAt,
      monthInReview: i.monthInReview,
    })),
  });
});

/// GET /api/newsletter/archive/:slug
newsletterArchiveRoutes.get('/archive/:slug', archiveLimit, async (c) => {
  const slug = c.req.param('slug');
  if (!slug) return c.json({ error: 'no such issue' }, 404);

  const issue = await getSentIssueBySlug(slug);
  if (!issue) return c.json({ error: 'no such issue' }, 404);
  return c.json({ issue: publicView(issue) });
});
