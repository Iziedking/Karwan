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
  const forced = new URLSearchParams(
    Object.entries({ workspace: query.workspace, handoff: query.handoff }).filter((e): e is [string, string] => typeof e[1] === 'string'),
  ).toString();
  return workspaceEnabled(process.env.NEXT_PUBLIC_DEAL_WORKSPACE_V2, forced ? `?${forced}` : '')
    ? <DealWorkspace jobId={id} />
    : <DirectDealDetail jobId={id} />;
}
