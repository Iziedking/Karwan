// Reuse the same generated card for the Twitter (X) summary_large_image preview
// so we emit an explicit twitter:image instead of relying on the og:image
// fallback. Single source of truth lives in opengraph-image.tsx.
export { default, runtime, alt, size, contentType } from './opengraph-image';
