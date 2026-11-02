import { AuthGuard } from '@/shared/components/AuthGuard';
import { PersonCheck } from '@/features/verification/PersonCheck';

export default function PersonCheckPage() {
  return <AuthGuard><PersonCheck /></AuthGuard>;
}
