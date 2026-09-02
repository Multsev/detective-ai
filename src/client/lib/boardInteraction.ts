export interface BackgroundClickDecision {
  openAddEntity: boolean;
  nextClickAt: number;
}

export function registerBackgroundClick(previousClickAt: number, currentClickAt: number, thresholdMs = 350): BackgroundClickDecision {
  const isDoubleClick = previousClickAt > 0 && currentClickAt - previousClickAt <= thresholdMs;
  return {
    openAddEntity: isDoubleClick,
    nextClickAt: isDoubleClick ? 0 : currentClickAt,
  };
}
