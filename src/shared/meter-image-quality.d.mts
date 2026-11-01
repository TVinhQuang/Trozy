export type MeterImageQuality = {
  version: 1;
  status: 'pass' | 'retake';
  scope: 'frame' | 'counter';
  canSubmit: boolean;
  checks: { resolution: boolean; exposure: boolean; contrast: boolean; sharpness: boolean; glare: boolean };
  reasons: string[];
  metrics: { width: number; height: number; meanLuma: number; contrast: number; edgeEnergy: number; clippedDark: number; clippedLight: number; glareFraction: number };
};
export function analyzeMeterPixels(image: { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels?: number }, options?: { scope?: 'frame' | 'counter' }): MeterImageQuality;
