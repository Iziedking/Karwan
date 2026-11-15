/// What an assistant turn reports while it runs, so a channel can say what
/// Aman is doing (view 84). Only real steps are reported, never a timer.
export type TurnEvent = { kind: 'status'; tool: string } | { kind: 'retrying' };

export type OnStep = (event: TurnEvent) => void;

/// The generateText option that reports each tool call as it starts. A
/// callback that throws is ignored: the turn never depends on its listener.
export function toolCallEvents(onStep?: OnStep): { experimental_onToolCallStart?: (event: { toolCall: { toolName: string } }) => void } {
  if (!onStep) return {};
  return {
    experimental_onToolCallStart: (event) => {
      try {
        onStep({ kind: 'status', tool: event.toolCall.toolName });
      } catch {
        // The listener's trouble is not the turn's.
      }
    },
  };
}

/// Calls a listener without letting it throw into the turn.
export function tell(onStep: OnStep | undefined, event: TurnEvent): void {
  if (!onStep) return;
  try {
    onStep(event);
  } catch {
    // ignored, as above
  }
}
