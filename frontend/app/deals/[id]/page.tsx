import { DirectDealDetail } from '@/features/deals/components/DirectDealDetail';
import { DealWorkspace } from '@/features/deals/workspace/DealWorkspace';
import { workspaceEnabled } from '@/features/deals/workspace/workspaceSwitch';

export default async function DirectDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const forced = typeof query.workspace === 'string' ? `?workspace=${query.workspace}` : '';
  return workspaceEnabled(process.env.NEXT_PUBLIC_DEAL_WORKSPACE_V2, forced)
    ? <DealWorkspace jobId={id} />
    : <DirectDealDetail jobId={id} />;
}
