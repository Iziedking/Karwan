/// Local, dependency-free safety scan for delivery-proof URLs. This is the
/// first layer of the Security Agent: it catches the cheap, high-signal abuse
/// shapes (credentials embedded in a link, raw-IP hosts, punycode homographs,
/// link shorteners that hide the real destination, throwaway phishing TLDs)
/// without any third-party API or key. The paid engine layer (Google Web Risk,
/// IPQualityScore, Cloudflare URL Scanner) drops in alongside this later and
/// votes with it; until then this gives real, immediate protection rather than
/// the let-everything-through stub.
import { extractUrls } from './extractUrls.js';

export type ScanVerdict = 'clean' | 'suspicious' | 'malicious';

export interface ScanResult {
  verdict: ScanVerdict;
  reasons: string[];
}

// Link shorteners hide the true destination, so a delivery proof behind one
// can't be verified at face value. Soft-flag, not a block.
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 't.ly', 'tiny.cc',
]);

// TLDs disproportionately used for throwaway phishing/malware hosts. Soft-flag.
const HIGH_RISK_TLDS = new Set([
  'zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click',
  'country', 'kim', 'work', 'rest', 'fit', 'loan', 'date', 'review',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function tldOf(host: string): string {
  const parts = host.split('.');
  return parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
}

/// Scans every URL in the proof text and returns the worst verdict found.
/// `malicious` => hard block (credentials in the link, a classic phishing
/// shape). `suspicious` => hold for review (can't verify the destination).
/// `clean` => nothing notable.
export function localScanProof(text: string): ScanResult {
  const urls = extractUrls(text);
  if (urls.length === 0) {
    // No link at all (e.g. a plain note). Nothing to scan; treat as clean.
    return { verdict: 'clean', reasons: [] };
  }

  const reasons: string[] = [];
  let worst: ScanVerdict = 'clean';
  const raise = (to: ScanVerdict) => {
    const rank = { clean: 0, suspicious: 1, malicious: 2 } as const;
    if (rank[to] > rank[worst]) worst = to;
  };

  for (const { href, host } of urls) {
    // Embedded credentials (user:pass@host) are a hallmark of credential-
    // harvesting and obfuscated redirects. Hard signal.
    if (/^https?:\/\/[^/@]*@/i.test(href)) {
      reasons.push(`Link embeds credentials before the host (${host || 'unknown'}).`);
      raise('malicious');
      continue;
    }
    // Raw IP host instead of a domain. Legitimate deliverables almost never
    // do this; phishing kits frequently do.
    if (IPV4.test(host)) {
      reasons.push(`Link points at a raw IP address (${host}).`);
      raise('suspicious');
    }
    // Punycode / IDN homograph host (xn--), commonly used to spoof brands.
    if (host.includes('xn--')) {
      reasons.push(`Link uses a punycode host that can spoof a real domain (${host}).`);
      raise('suspicious');
    }
    // Link shortener: the real destination is hidden behind a redirect.
    if (SHORTENERS.has(host)) {
      reasons.push(`Link uses a shortener (${host}); the real destination is hidden.`);
      raise('suspicious');
    }
    // Throwaway / high-abuse TLD.
    const tld = tldOf(host);
    if (HIGH_RISK_TLDS.has(tld)) {
      reasons.push(`Link uses a high-risk top-level domain (.${tld}).`);
      raise('suspicious');
    }
  }

  return { verdict: worst, reasons };
}
