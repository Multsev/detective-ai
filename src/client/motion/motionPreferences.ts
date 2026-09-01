export type MotionLevel = 'full' | 'reduced' | 'off';

export const motionDurations = {
  fast: 150,
  panel: 220,
  card: 380,
  camera: 360,
  layout: 520,
  relation: 620,
  removal: 260,
  feedback: 1800,
} as const;

export function getDefaultMotionLevel(): MotionLevel {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
}

export function isMotionLevel(value: unknown): value is MotionLevel {
  return value === 'full' || value === 'reduced' || value === 'off';
}

export function motionDuration(level: MotionLevel, duration: number): number {
  if (level === 'off') return 0;
  if (level === 'reduced') return Math.min(120, Math.round(duration * 0.3));
  return duration;
}

