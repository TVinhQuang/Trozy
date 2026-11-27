/** Usage belongs to each physical meter between its opening and closing indexes. */
export function meterConsumption(reading, utility) {
  const segments = (reading?.meterBreakdown || []).filter(part => part.utility === utility);
  const currentOpening = segments.at(-1)?.newOpening ?? reading?.[utility + 'Old'];
  const difference = (closing, opening) => {
    if ([opening, closing].some(value => value == null || value === '' || !Number.isFinite(Number(value)))) return NaN;
    return Number(closing) - Number(opening);
  };
  return segments.reduce((total, part) => total + difference(part.oldClosing, part.oldOpening),
    difference(reading?.[utility + 'New'], currentOpening));
}
