/** Great-circle distance in metres (Haversine). Display only — the server decides. */
export function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatMetersShort(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(1)} km`;
}
