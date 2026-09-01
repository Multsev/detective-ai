export interface ResearchAutoFitState {
  entityCount: number;
  relationCount: number;
  researching: boolean;
}

export function shouldAutoFitResearchGraph(
  enabled: boolean,
  previous: ResearchAutoFitState,
  current: ResearchAutoFitState,
): boolean {
  const graphChanged = previous.entityCount !== current.entityCount
    || previous.relationCount !== current.relationCount;

  // The previous flag includes a final graph update that is rendered in the
  // same React cycle in which the research switches to completed.
  return enabled && graphChanged && (current.researching || previous.researching);
}
