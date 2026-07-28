import type { Signal } from '../db/signals.js';

/// The two passes a draft has to survive.
///
/// One is about how it reads, the other about whether it is true. The second is
/// the expensive one: a draft that sounds generated is embarrassing, a draft
/// that claims a feature we have not shipped is a false public claim, and the
/// README claimed reputation counted distinct counterparties for months on
/// exactly that basis.
///
/// KNOWN DUPLICATION. The voice table below is a copy of `VOICE_RULES` in
/// `@karwan/generator` (the content OS repo). One rule set in two places is a
/// thing that drifts, and the alternative was worse: vendoring a rules file
/// across repos gives a stale copy nothing can detect, which is the failure
/// mode this whole system exists to prevent. The real fix is publishing
/// `@karwan/kit` to npm and importing `humanize()` from it, which is already on
/// the release checklist for the public packages. Until then these two tables
/// are edited together, and the test at the bottom of this comment is a human
/// one: if you change a rule here, change it there.

export interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  excerpt: string;
  line: number;
  fix: string;
}

const VOICE_RULES: Array<{ rule: string; severity: Finding['severity']; re: RegExp; fix: string }> = [
  {
    rule: 'no-em-dash',
    severity: 'error',
    re: /—|--(?!\s*>)/g,
    fix: 'Use a period or a comma. This is the clearest tell of generated prose.',
  },
  {
    rule: 'no-filler-opener',
    severity: 'error',
    re: /\b(in today's [a-z-]+ world|it'?s worth noting that|let'?s dive in|in the world of|when it comes to|at the end of the day|needless to say)\b/gi,
    fix: 'Delete it and start with the claim.',
  },
  {
    rule: 'no-ai-vocabulary',
    severity: 'error',
    re: /\b(delve into|leverage(?:s|d|ing)? the power|seamless(?:ly)?|robust solution|game[- ]chang(?:er|ing)|revolutioniz(?:e|es|ing)|unlock the potential|elevate your|supercharge|cutting[- ]edge|state[- ]of[- ]the[- ]art)\b/gi,
    fix: 'Say the specific thing this is standing in for.',
  },
  {
    rule: 'no-rule-of-three',
    severity: 'warning',
    re: /\b(\w+),\s+(\w+),?\s+and\s+(\w+)\b(?=[.!?,])/g,
    fix: 'Padding pretending to be rhythm. Say the one thing that is true.',
  },
  {
    rule: 'no-hedging',
    severity: 'warning',
    re: /\b(arguably|essentially|basically|quite possibly|it could be argued)\b/gi,
    fix: 'Make the claim or drop it.',
  },
];

export function checkVoice(draft: string): Finding[] {
  const findings: Finding[] = [];

  draft.split('\n').forEach((line, i) => {
    for (const rule of VOICE_RULES) {
      // Fresh lastIndex per line: these are /g regexes reused across calls.
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.re.exec(line)) !== null) {
        findings.push({
          rule: rule.rule,
          severity: rule.severity,
          excerpt: m[0],
          line: i + 1,
          fix: rule.fix,
        });
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  });

  return findings;
}

/// Words that turn a sentence into a claim about what Karwan does today.
const PRESENT_TENSE_CLAIM =
  /\bkarwan\s+(now\s+)?(supports?|offers?|provides?|lets?|enables?|handles?|does|has|includes?|ships?|delivers?|runs?|settles?|funds?|advances?)\b/i;

/// Every claim has to trace to something in the pipeline.
///
/// This is a different check from the canon's, and a stronger one for this job.
/// The canon asks "is this fact publishable". This asks "did anything we
/// actually collected say this", which also catches the model inventing a
/// capability out of nothing, which is the failure the canon check cannot see
/// because an invented feature is not in the canon at all.
///
/// It is deliberately blunt and will occasionally flag a careful sentence. That
/// is the right way round to be wrong: the alternative is a false public claim
/// nobody catches for months.
export function checkClaims(draft: string, signals: Signal[]): Finding[] {
  const findings: Finding[] = [];

  // What the sources actually said, as one bag of words. A claim is supported
  // when its distinctive words appear in something we collected.
  const sourceText = signals
    .map((s) => `${s.title} ${s.summary} ${s.rawExcerpt} ${s.myTake} ${s.tags.join(' ')}`)
    .join(' ')
    .toLowerCase();

  draft.split('\n').forEach((line, i) => {
    if (!PRESENT_TENSE_CLAIM.test(line)) return;

    const words = line
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w));
    if (words.length === 0) return;

    const supported = words.filter((w) => sourceText.includes(w)).length;
    // Over half the substantive words have to appear in the sources. A sentence
    // built entirely from words nothing in the pipeline used is a sentence the
    // model wrote from memory.
    if (supported * 2 >= words.length) return;

    findings.push({
      rule: 'unsourced-claim',
      severity: 'error',
      excerpt: line.trim().slice(0, 160),
      line: i + 1,
      fix: 'Nothing collected for this issue says this. Cut it, or add the signal it came from.',
    });
  });

  return findings;
}

const STOPWORDS = new Set([
  'karwan', 'which', 'their', 'there', 'these', 'those', 'about', 'would', 'could', 'should',
  'because', 'through', 'without', 'between', 'across', 'after', 'before', 'while', 'where',
  'every', 'other', 'means', 'still', 'first', 'thing', 'things',
]);

export interface ReviewResult {
  findings: Finding[];
  errors: number;
  warnings: number;
  /// Warnings do not block. Errors do.
  clean: boolean;
}

export function reviewDraft(draft: string, signals: Signal[]): ReviewResult {
  const findings = [...checkVoice(draft), ...checkClaims(draft, signals)].sort(
    (a, b) => a.line - b.line,
  );
  const errors = findings.filter((f) => f.severity === 'error').length;
  return { findings, errors, warnings: findings.length - errors, clean: errors === 0 };
}
