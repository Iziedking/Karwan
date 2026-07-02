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

const nextConfig = {
  reactStrictMode: true,
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
