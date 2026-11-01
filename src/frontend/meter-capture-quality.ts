import type { MeterImageQuality } from '../shared/meter-image-quality.mjs';

export type MeterCaptureRectangle = { left: number; top: number; width: number; height: number };
export type CameraReadiness = { consecutive: number; startedAt: number; ready: boolean };
export const emptyCameraReadiness = (): CameraReadiness => ({ consecutive: 0, startedAt: 0, ready: false });

/** Keep the complete row and its printed scale in the guide. Geometry never infers a digit. */
export function cameraCounterRectangle(width: number, height: number, rowCenter = .5, rowWidth = .8): MeterCaptureRectangle {
  const w = Math.max(1, Math.round(width * Math.max(.45, Math.min(.95, rowWidth))));
  const h = Math.max(1, Math.min(height, Math.round(w / 3.2)));
  return { left: Math.max(0, Math.round((width - w) / 2)), top: Math.max(0, Math.min(height - h, Math.round(height * rowCenter - h / 2))), width: w, height: h };
}

/** Several passing preview frames measure camera steadiness. */
export function cameraReadiness(previous: CameraReadiness, quality: MeterImageQuality, motion: number, now: number): CameraReadiness {
  if (quality.status !== 'pass' || !Number.isFinite(motion) || motion > 9) return emptyCameraReadiness();
  const consecutive = previous.consecutive + 1, startedAt = previous.consecutive ? previous.startedAt : now;
  return { consecutive, startedAt, ready: consecutive >= 4 && now - startedAt >= 750 };
}

export function cameraLumaSample(data: Uint8ClampedArray): number[] {
  const sample: number[] = [], stride = Math.max(4, Math.floor(data.length / (256 * 4)) * 4);
  for (let i = 0; i < data.length; i += stride) sample.push(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722);
  return sample;
}

export function cameraMotion(previous: number[] | null, current: number[]): number {
  if (!previous || !current.length || previous.length !== current.length) return Infinity;
  return current.reduce((sum, value, i) => sum + Math.abs(value - previous[i]), 0) / current.length;
}
