export type MobileOrientationRestorePlan = {
  cfi: string;
  navigationAt: number;
  generation: number;
};

export type ReaderViewport = { width: number; height: number };

export function hasOrientationViewportChange(previous: ReaderViewport, next: ReaderViewport) {
  if (previous.width === next.width) return false;
  const previousLandscape = previous.width > previous.height;
  const nextLandscape = next.width > next.height;
  return previousLandscape !== nextLandscape || Math.abs(next.width - previous.width) >= 80;
}

export function captureMobileOrientationRestore(
  current: MobileOrientationRestorePlan | null,
  cfi: string | null,
  navigationAt: number,
  generation: number,
) {
  if (current || !cfi) return current;
  return { cfi, navigationAt, generation };
}

export function shouldRestoreMobileOrientation(
  plan: MobileOrientationRestorePlan | null,
  activeGeneration: number,
  navigationAt: number,
) {
  return Boolean(plan && plan.generation === activeGeneration && navigationAt <= plan.navigationAt);
}
