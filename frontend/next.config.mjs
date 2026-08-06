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
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8787';

const nextConfig = {
  reactStrictMode: true,
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
      {
        source: '/attestations/revocations.json',
        destination: `${BACKEND}/attestations/revocations.json`,
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

export default nextConfig;
