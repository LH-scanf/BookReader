import type { ReadingMode } from "../types";

export const mobileResumeTolerance = 0.005;

export function shouldRestoreMobileResume({ mobileReader, readingMode, resumeCfi, initialTarget }: {
  mobileReader: boolean;
  readingMode: ReadingMode;
  resumeCfi: string | null;
  initialTarget: string | null;
}) {
  return mobileReader && readingMode === "scroll" && Boolean(resumeCfi) && !initialTarget;
}

export function shouldPersistRelocated({ restoringInitialProgress, previewing, restoringOrientation }: {
  restoringInitialProgress: boolean;
  previewing: boolean;
  restoringOrientation: boolean;
}) {
  return !restoringInitialProgress && !previewing && !restoringOrientation;
}

export function needsMobileResumePercentageFallback(saved: number, restored: number | undefined) {
  return Number.isFinite(saved) && typeof restored === "number" && Number.isFinite(restored) && Math.abs(saved - restored) > mobileResumeTolerance;
}
