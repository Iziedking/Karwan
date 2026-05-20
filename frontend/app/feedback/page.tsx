import { FeedbackForm } from '@/features/feedback/components/FeedbackForm';

export const metadata = {
  title: 'Feedback · Karwan',
  description: 'Report a bug, suggest an improvement, or tell us what you liked.',
};

export default function FeedbackPage() {
  return <FeedbackForm />;
}
