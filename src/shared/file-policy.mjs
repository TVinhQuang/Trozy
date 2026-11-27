export const MAX_FILE_BYTES = 5 * 1024 * 1024;

// The same local time next month in Vietnam, clamped for shorter months.
export function meterPhotoExpiry(uploadedAt) {
  const offset = 7 * 60 * 60 * 1000;
  const local = new Date(new Date(uploadedAt).getTime() + offset);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 2, 0);
  local.setUTCDate(Math.min(day, local.getUTCDate()));
  return Math.ceil((local.getTime() - offset) / 1000);
}
