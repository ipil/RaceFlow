export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371000;

export function parseGpxToLatLngs(gpxText: string): LatLng[] {
  const xml = new DOMParser().parseFromString(gpxText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid GPX XML file.');
  }

  const trkpts = Array.from(xml.querySelectorAll('trkpt'));
  const rtepts = Array.from(xml.querySelectorAll('rtept'));
  const src = trkpts.length > 0 ? trkpts : rtepts;

  if (src.length < 2) {
    throw new Error('GPX must contain at least two trkpt or rtept nodes.');
  }

  return src
    .map((node) => {
      const lat = Number(node.getAttribute('lat'));
      const lng = Number(node.getAttribute('lon'));
      return { lat, lng };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function buildCumulativeDistances(points: LatLng[]): {
  points: LatLng[];
  cumdist: number[];
  total: number;
} {
  if (points.length < 2) {
    return { points, cumdist: [0], total: 0 };
  }

  const cumdist = new Array<number>(points.length);
  cumdist[0] = 0;
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
    cumdist[i] = total;
  }

  return { points, cumdist, total };
}

export function positionAtDistance(
  points: LatLng[],
  cumdist: number[],
  dMeters: number,
): LatLng {
  const n = points.length;
  if (n === 0) return { lat: 0, lng: 0 };
  if (n === 1) return points[0];

  const clamped = Math.max(0, Math.min(dMeters, cumdist[n - 1]));

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumdist[mid] < clamped) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const i = Math.max(1, lo);
  const d0 = cumdist[i - 1];
  const d1 = cumdist[i];
  const span = d1 - d0;
  if (span <= 0) return points[i];

  const t = (clamped - d0) / span;
  const a = points[i - 1];
  const b = points[i];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

export function boundsOfPoints(points: LatLng[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  if (points.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return { minLat, maxLat, minLng, maxLng };
}
