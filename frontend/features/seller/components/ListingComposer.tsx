import { PostListingForm } from './PostListingForm';

/// The seller desk uses the structured listing form as its only intake path.
/// Keep the preview, validation, posting, and live-match behavior in
/// PostListingForm, while avoiding a second natural-language mode at the
/// point where a seller is ready to publish an offer.
export function ListingComposer() {
  return <PostListingForm />;
}
