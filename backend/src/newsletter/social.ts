import { generateObject } from 'ai';
import { z } from 'zod';
import { llmModel } from '../llm/client.js';
import { checkVoice, type Finding } from './checks.js';
import type { NewsletterIssue } from '../db/newsletter.js';

/// One issue, fanned out into the shapes each platform actually rewards.
///
/// NOTHING HERE POSTS. There is no client, no token, and no network call to any
/// platform in this file, by decision: publishing integrations come after
/// approval works, so that a bug cannot reach a live account. What this produces
/// is text a person copies.
///
/// Three registers, and they are genuinely different. X is lowercase and blunt
/// and leads with the problem. LinkedIn is the same facts in the plainer,
/// longer register a business audience reads without wincing. YouTube is not
/// prose at all: a title, a description, chapters, and a shot list for a feature
/// somebody is about to film.

export type Platform = 'x' | 'linkedin' | 'youtube';

export interface SocialDraft {
  platform: Platform;
  /// The thing to copy. For X this is the whole thread, one post per element.
  posts: string[];
  /// Only for youtube: the chapters and the shot list.
  chapters?: string[];
  shotList?: string[];
  findings: Finding[];
}

const X_RULES = `X voice. All lowercase, including the first word of every post.
Problem first: open with the thing that is broken for somebody, not with what we
built. No hashtags. No emoji. No "1/" numbering and no "a thread 🧵". Each post
stands alone and earns the next one. Between three and six posts. The last one
is a flat statement, not a call to action.`;

const LINKEDIN_RULES = `LinkedIn voice. Normal sentence case, plainer and longer
than X, written for someone who runs a business rather than someone who follows
crypto. One post, four to eight short paragraphs. Open with a concrete situation,
not a claim about the industry. No hashtags. No "excited to announce". No
engagement bait question at the end.`;

const YOUTUBE_RULES = `A video description for a feature demo. Give a title under
70 characters, a description of two or three short paragraphs, a chapter list
with timestamps starting at 0:00, and a shot list of what to actually film. The
shot list is instructions to a person holding a camera, so it names screens and
actions, not concepts. Do not write a script and do not attempt to generate
video.`;

const RULES: Record<Platform, string> = {
  x: X_RULES,
  linkedin: LINKEDIN_RULES,
  youtube: YOUTUBE_RULES,
};

const SHARED = `Never use an em dash. Never use: seamless, robust,
game-changing, cutting-edge, delve, leverage the power, unlock the potential,
revolutionise, supercharge. No rule of three. No hedging.

Write only from the material below. Do not add a capability that is not in it.`;

const schemas = {
  x: z.object({ posts: z.array(z.string()).min(3).max(6) }),
  linkedin: z.object({ posts: z.array(z.string()).length(1) }),
  youtube: z.object({
    title: z.string(),
    description: z.string(),
    chapters: z.array(z.string()).min(2),
    shotList: z.array(z.string()).min(3),
  }),
} as const;

function material(issue: NewsletterIssue): string {
  const body = issue.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n');
  const links = issue.sources.map((s) => `- ${s.title}: ${s.url}`).join('\n');
  return `Subject: ${issue.subject}\n${issue.preheader}\n\n${body}\n\nLinks:\n${links}`;
}

export class SocialFailed extends Error {}

export async function writeSocial(issue: NewsletterIssue, platform: Platform): Promise<SocialDraft> {
  const prompt = `${RULES[platform]}\n\n${SHARED}\n\nThe material:\n\n${material(issue)}`;

  try {
    if (platform === 'youtube') {
      const { object } = await generateObject({ model: llmModel, schema: schemas.youtube, prompt });
      const posts = [object.title, object.description];
      return {
        platform,
        posts,
        chapters: object.chapters,
        shotList: object.shotList,
        findings: checkVoice(posts.join('\n')),
      };
    }

    const { object } = await generateObject({
      model: llmModel,
      schema: platform === 'x' ? schemas.x : schemas.linkedin,
      prompt,
    });

    const posts = object.posts.map((p) => p.trim()).filter(Boolean);
    const findings = checkVoice(posts.join('\n'));

    // The lowercase rule is the one an LLM quietly ignores, and it is the most
    // visible tell that a post was not written by a person who posts here.
    if (platform === 'x') {
      for (const [i, post] of posts.entries()) {
        if (/^[A-Z]/.test(post.trim())) {
          findings.push({
            rule: 'x-lowercase',
            severity: 'error',
            excerpt: post.slice(0, 60),
            line: i + 1,
            fix: 'Lowercase the opening. Every post in this voice starts lowercase.',
          });
        }
        if (/#\w/.test(post) || /[\u{1F300}-\u{1FAFF}]/u.test(post)) {
          findings.push({
            rule: 'x-no-hashtags-or-emoji',
            severity: 'error',
            excerpt: post.slice(0, 60),
            line: i + 1,
            fix: 'Cut the hashtag or emoji.',
          });
        }
        if (post.length > 280) {
          findings.push({
            rule: 'x-too-long',
            severity: 'error',
            excerpt: `${post.length} characters`,
            line: i + 1,
            fix: 'Over the limit. Split it or cut it.',
          });
        }
      }
    }

    return { platform, posts, findings };
  } catch (e) {
    throw new SocialFailed(`could not write the ${platform} draft: ${(e as Error).message}`);
  }
}
