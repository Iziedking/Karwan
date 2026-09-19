import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

/** @type {import('next').NextConfig} */

// Security headers for the Vercel-served frontend (api.karwan.site gets the
// equivalent set from the Caddyfile). CSP is intentionally scoped to
// frame-ancestors: a full script-src policy would need auditing against the
// wallet SDKs and Next's inline runtime; framing denial is the part that
// protects signature prompts from clickjacking today.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/// Where the backend serves the attestation documents from.
///
/// The issuer manifest names `karwan.site` as the issuer domain and points its
/// schema URL at `karwan.site/schemas/...`, because an issuer IS a domain plus a
/// signing key. Serving those documents from api.karwan.site instead would describe
/// a different issuer, and a manifest whose own URLs do not resolve is not usable by
/// anyone. So the site proxies them to the backend rather than keeping a
/// hand-maintained copy that can drift from the code that emits attestations.
// A production build has to name its API. Falling back to the live one meant a
// local or preview build that forgot the variable quietly ran against real
// deals and real money while looking like a test.
const configuredBackend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
const BACKEND = (configuredBackend || 'http://localhost:8787').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  // Lint is a CI gate (`npm run check:hooks`), not a build step. Letting the
  // build lint would read eslint-disable comments for rules this config does
  // not load and fail the deploy on them.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: '/.well-known/attestation-issuer.json',
        destination: `${BACKEND}/.well-known/attestation-issuer.json`,
      },
      {
        source: '/schemas/:path*',
        destination: `${BACKEND}/schemas/:path*`,
      },
      // Every attestation path, not just the revocation list: the manifest
      // publishes by-subject and by-id resolution templates on this domain, so a
      // consumer that can read the manifest but not the documents it points at
      // has been handed a schema and no evidence.
      {
        source: '/attestations/:path*',
        destination: `${BACKEND}/attestations/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default function config(phase) {
  // `next typegen` loads this file in the build phase too, but only generates
  // types, so the guard keys on the build command itself.
  const building = phase === PHASE_PRODUCTION_BUILD && process.argv.includes('build');
  if (building && !configuredBackend) {
    throw new Error(
      'NEXT_PUBLIC_BACKEND_URL is not set. A production build must name its API explicitly, ' +
        'for example NEXT_PUBLIC_BACKEND_URL=https://api.karwan.site on Vercel, or a local API for a test build.',
    );
  }
  return nextConfig;
}
