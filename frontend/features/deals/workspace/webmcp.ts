import type { DirectDeal } from '@/core/api';

/// WebMCP (Chrome origin trial, document.modelContext.registerTool): lets a
/// browser agent read this deal on the user's behalf. Read-only by design;
/// every money action stays behind the human confirm sheet.
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, never> };
  annotations?: { readOnlyHint?: boolean };
  execute: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}
interface ModelContext { registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void }

export function registerDealTools(deal: DirectDeal): () => void {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context || !deal.view) return () => undefined;
  const controller = new AbortController();
  const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const view = deal.view;
  const trust = deal.counterpartyTrust ?? null;
  try {
    context.registerTool({
      name: 'karwan-deal-status',
      description: 'Read this Karwan deal: amount in USDC, where the money is, progress, the next action and whose move it is.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => text({
        amountUsdc: deal.dealAmountUsdc,
        stage: view.stage,
        money: view.money.line,
        progress: view.progress,
        next: view.next,
        automatic: view.automatic,
      }),
    }, { signal: controller.signal });
    context.registerTool({
      name: 'karwan-counterparty-trust',
      description: 'Read the measured trust facts Karwan shows for the other party in this deal.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => text(trust),
    }, { signal: controller.signal });
  } catch {
    // A tool of the same name is already registered (another tab state).
  }
  return () => controller.abort();
}
