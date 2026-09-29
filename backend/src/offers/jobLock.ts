/// Jobs with an approval, raise or accept running right now. One set shared by
/// the agent-match routes and direct-offer accepts, so two paths can never fund
/// the same request at once.
export const jobActionsInFlight = new Set<string>();
