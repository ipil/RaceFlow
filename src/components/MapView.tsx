import { useEffect, useMemo, useRef } from 'react';
import L, { type LatLngBoundsExpression, type Map as LeafletMap } from 'leaflet';
import type { Runner } from '../sim/sim';
import { positionAtDistance } from '../sim/route';
import { runnerDistanceMeters } from '../sim/sim';
import type { LatLng } from '../sim/route';

type RouteData = {
  points: LatLng[];
  cumdist: number[];
  total: number;
};

type CourseMapData = {
  id: string;
  routeData: RouteData | null;
  runners: Runner[];
};

type MapViewProps = {
  courses: CourseMapData[];
  simTime: number;
  playing: boolean;
  densityRadiusMeters: number;
  thresholdRunnerDensity: number;
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  showRouteHeatmap: boolean;
  averageRedThreshold: number;
  maxRedThreshold: number;
  runId: number;
};

type SegmentEntry = {
  courseIdx: number;
  segIdx: number;
  groupIdx: number;
  p0: LatLng;
  p1: LatLng;
};

type SegmentMeters = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  midX: number;
  midY: number;
};

type SegmentGroupRep = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  midX: number;
  midY: number;
};

function densityToColor(norm: number): string {
  const clamped = Math.max(0, Math.min(1, norm));
  const hue = 220 - 220 * clamped;
  const sat = 80;
  const light = 50 - clamped * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function toMeters(point: LatLng, cosRefLat: number, earthRadiusM: number): { x: number; y: number } {
  const latRad = (point.lat * Math.PI) / 180;
  const lngRad = (point.lng * Math.PI) / 180;
  return {
    x: earthRadiusM * lngRad * cosRefLat,
    y: earthRadiusM * latRad,
  };
}

function segmentMatchDistance(a: SegmentMeters, b: SegmentGroupRep): number {
  const fwd =
    Math.hypot(a.x0 - b.x0, a.y0 - b.y0) + Math.hypot(a.x1 - b.x1, a.y1 - b.y1);
  const rev =
    Math.hypot(a.x0 - b.x1, a.y0 - b.y1) + Math.hypot(a.x1 - b.x0, a.y1 - b.y0);
  return Math.min(fwd, rev) * 0.5;
}

export default function MapView({
  courses,
  simTime,
  playing,
  densityRadiusMeters,
  thresholdRunnerDensity,
  segmentLengthMeters,
  heatMetric,
  showRouteHeatmap,
  averageRedThreshold,
  maxRedThreshold,
  runId,
}: MapViewProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const distancesRef = useRef<Float64Array>(new Float64Array(0));
  const latRef = useRef<Float64Array>(new Float64Array(0));
  const lngRef = useRef<Float64Array>(new Float64Array(0));
  const xMetersRef = useRef<Float64Array>(new Float64Array(0));
  const yMetersRef = useRef<Float64Array>(new Float64Array(0));
  const densityPerRunnerRef = useRef<Float32Array>(new Float32Array(0));

  const segmentNonZeroSumRef = useRef<Float64Array>(new Float64Array(0));
  const segmentNonZeroCountRef = useRef<Uint32Array>(new Uint32Array(0));
  const segmentMaxDensityRef = useRef<Float32Array>(new Float32Array(0));
  const segmentSeenRef = useRef<Uint8Array>(new Uint8Array(0));
  const segmentFrameCountRef = useRef<Uint32Array>(new Uint32Array(0));
  const avgValueRef = useRef<Float32Array>(new Float32Array(0));
  const segmentFrameDensityRef = useRef<Float32Array>(new Float32Array(0));
  const lastTrackedSimTimeRef = useRef(0);

  const courseTmpCountsRef = useRef<Array<Uint16Array>>([]);

  const geometry = useMemo(() => {
    const courseSegmentCounts = new Array<number>(courses.length).fill(0);
    const entries: SegmentEntry[] = [];
    const groupMembers: Array<Array<{ courseIdx: number; segIdx: number }>> = [];
    const groupReps: SegmentGroupRep[] = [];
    const bucketToGroups = new Map<string, number[]>();

    const firstRoute = courses.find((c) => c.routeData && c.routeData.points.length > 0)?.routeData;
    const refLatRad = firstRoute ? (firstRoute.points[0].lat * Math.PI) / 180 : 0;
    const cosRefLat = Math.cos(refLatRad);
    const earthRadiusM = 6371000;

    const overlapToleranceMeters = Math.max(2, segmentLengthMeters * 0.6);
    const bucketSize = Math.max(2, overlapToleranceMeters);
    const bucketKey = (x: number, y: number) =>
      `${Math.floor(x / bucketSize)},${Math.floor(y / bucketSize)}`;
    const neighborOffsets = [-1, 0, 1];

    for (let c = 0; c < courses.length; c += 1) {
      const rd = courses[c].routeData;
      if (!rd || rd.total <= 0 || rd.points.length < 2) continue;

      const segCount = Math.max(1, Math.ceil(rd.total / segmentLengthMeters));
      courseSegmentCounts[c] = segCount;

      for (let i = 0; i < segCount; i += 1) {
        const d0 = i * segmentLengthMeters;
        const d1 = Math.min(rd.total, (i + 1) * segmentLengthMeters);
        const p0 = positionAtDistance(rd.points, rd.cumdist, d0);
        const p1 = positionAtDistance(rd.points, rd.cumdist, d1);

        const m0 = toMeters(p0, cosRefLat, earthRadiusM);
        const m1 = toMeters(p1, cosRefLat, earthRadiusM);
        const segM: SegmentMeters = {
          x0: m0.x,
          y0: m0.y,
          x1: m1.x,
          y1: m1.y,
          midX: 0.5 * (m0.x + m1.x),
          midY: 0.5 * (m0.y + m1.y),
        };

        const bx = Math.floor(segM.midX / bucketSize);
        const by = Math.floor(segM.midY / bucketSize);
        let bestGroup = -1;
        let bestDist = Number.POSITIVE_INFINITY;

        for (let oy = 0; oy < neighborOffsets.length; oy += 1) {
          for (let ox = 0; ox < neighborOffsets.length; ox += 1) {
            const nx = bx + neighborOffsets[ox];
            const ny = by + neighborOffsets[oy];
            const groups = bucketToGroups.get(`${nx},${ny}`);
            if (!groups) continue;
            for (let gi = 0; gi < groups.length; gi += 1) {
              const g = groups[gi];
              const rep = groupReps[g];
              const d = segmentMatchDistance(segM, rep);
              if (d <= overlapToleranceMeters && d < bestDist) {
                bestDist = d;
                bestGroup = g;
              }
            }
          }
        }

        let groupIdx = bestGroup;
        if (groupIdx < 0) {
          groupIdx = groupMembers.length;
          groupMembers.push([]);
          groupReps.push({
            x0: segM.x0,
            y0: segM.y0,
            x1: segM.x1,
            y1: segM.y1,
            midX: segM.midX,
            midY: segM.midY,
          });
          const key = bucketKey(segM.midX, segM.midY);
          const existing = bucketToGroups.get(key);
          if (existing) {
            existing.push(groupIdx);
          } else {
            bucketToGroups.set(key, [groupIdx]);
          }
        }

        groupMembers[groupIdx].push({ courseIdx: c, segIdx: i });
        entries.push({ courseIdx: c, segIdx: i, groupIdx, p0, p1 });
      }
    }

    return {
      courseSegmentCounts,
      entries,
      groupMembers,
      groupCount: groupMembers.length,
    };
  }, [courses, segmentLengthMeters]);

  useEffect(() => {
    const groupCount = geometry.groupCount;
    segmentNonZeroSumRef.current = new Float64Array(groupCount);
    segmentNonZeroCountRef.current = new Uint32Array(groupCount);
    segmentMaxDensityRef.current = new Float32Array(groupCount);
    segmentSeenRef.current = new Uint8Array(groupCount);
    segmentFrameCountRef.current = new Uint32Array(groupCount);
    avgValueRef.current = new Float32Array(groupCount);
    segmentFrameDensityRef.current = new Float32Array(groupCount);
    lastTrackedSimTimeRef.current = 0;

    const courseTmpCounts: Array<Uint16Array> = new Array(courses.length);
    for (let i = 0; i < courses.length; i += 1) {
      const segCount = geometry.courseSegmentCounts[i] ?? 0;
      courseTmpCounts[i] = new Uint16Array(segCount);
    }
    courseTmpCountsRef.current = courseTmpCounts;
  }, [geometry.groupCount, geometry.courseSegmentCounts, courses.length, runId]);

  useEffect(() => {
    if (!mapRootRef.current || mapRef.current) return;

    const map = L.map(mapRootRef.current, {
      center: [37.7749, -122.4194],
      zoom: 13,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeLayerGroupRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = group;

    const allLatLngs: [number, number][] = [];

    for (let c = 0; c < courses.length; c += 1) {
      const rd = courses[c].routeData;
      if (!rd || rd.points.length < 2) continue;
      const latLngs = rd.points.map((p) => [p.lat, p.lng]) as [number, number][];
      allLatLngs.push(...latLngs);
      L.polyline(latLngs, {
        color: '#6b7280',
        weight: 4,
        opacity: 0.9,
      }).addTo(group);
    }

    if (allLatLngs.length >= 2) {
      map.fitBounds(allLatLngs as LatLngBoundsExpression, { padding: [20, 20] });
    }
  }, [courses]);

  const draw = useMemo(() => {
    return () => {
      const map = mapRef.current;
      const canvas = canvasRef.current;
      if (!map || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const totalRunners = courses.reduce((sum, c) => sum + c.runners.length, 0);
      if (totalRunners <= 0) return;

      if (distancesRef.current.length < totalRunners) {
        distancesRef.current = new Float64Array(totalRunners);
        latRef.current = new Float64Array(totalRunners);
        lngRef.current = new Float64Array(totalRunners);
        xMetersRef.current = new Float64Array(totalRunners);
        yMetersRef.current = new Float64Array(totalRunners);
        densityPerRunnerRef.current = new Float32Array(totalRunners);
      }

      const distances = distancesRef.current;
      const lats = latRef.current;
      const lngs = lngRef.current;
      const xs = xMetersRef.current;
      const ys = yMetersRef.current;
      const densityPerRunner = densityPerRunnerRef.current;

      const radiusSq = densityRadiusMeters * densityRadiusMeters;
      const invDensityRadius = 1 / Math.max(1e-6, densityRadiusMeters);

      const earthRadiusM = 6371000;
      const firstRoute = courses.find((c) => c.routeData && c.routeData.points.length > 0)?.routeData;
      const refLatRad = firstRoute ? (firstRoute.points[0].lat * Math.PI) / 180 : 0;
      const cosRefLat = Math.cos(refLatRad);

      const courseTmpCounts = courseTmpCountsRef.current;
      for (let c = 0; c < courseTmpCounts.length; c += 1) {
        courseTmpCounts[c].fill(0);
      }

      let writeIdx = 0;
      for (let c = 0; c < courses.length; c += 1) {
        const course = courses[c];
        const rd = course.routeData;
        if (!rd || rd.total <= 0 || rd.points.length < 2) continue;

        const segCount = geometry.courseSegmentCounts[c] ?? 0;

        for (let i = 0; i < course.runners.length; i += 1) {
          const runner = course.runners[i];
          const d = runnerDistanceMeters(runner, simTime, rd.total);
          distances[writeIdx] = d;
          const pos = positionAtDistance(rd.points, rd.cumdist, d);
          lats[writeIdx] = pos.lat;
          lngs[writeIdx] = pos.lng;

          const latRad = (pos.lat * Math.PI) / 180;
          const lngRad = (pos.lng * Math.PI) / 180;
          xs[writeIdx] = earthRadiusM * lngRad * cosRefLat;
          ys[writeIdx] = earthRadiusM * latRad;
          densityPerRunner[writeIdx] = 1;

          if (segCount > 0) {
            const segIdx = Math.min(segCount - 1, Math.max(0, Math.floor(d / segmentLengthMeters)));
            courseTmpCounts[c][segIdx] += 1;
          }

          writeIdx += 1;
        }
      }
      const activeRunnerCount = writeIdx;

      for (let i = 0; i < activeRunnerCount; i += 1) {
        const xi = xs[i];
        const yi = ys[i];
        for (let j = i + 1; j < activeRunnerCount; j += 1) {
          const dx = xi - xs[j];
          const dy = yi - ys[j];
          if (dx * dx + dy * dy <= radiusSq) {
            densityPerRunner[i] += 1;
            densityPerRunner[j] += 1;
          }
        }
        densityPerRunner[i] *= invDensityRadius;
      }

      const nonZeroSum = segmentNonZeroSumRef.current;
      const nonZeroCount = segmentNonZeroCountRef.current;
      const maxDensity = segmentMaxDensityRef.current;
      const seen = segmentSeenRef.current;
      const frameCount = segmentFrameCountRef.current;
      const avgValues = avgValueRef.current;
      const frameDensity = segmentFrameDensityRef.current;

      if (simTime < lastTrackedSimTimeRef.current) {
        nonZeroSum.fill(0);
        nonZeroCount.fill(0);
        maxDensity.fill(0);
        seen.fill(0);
        frameCount.fill(0);
        frameDensity.fill(0);
      }

      if (geometry.groupCount > 0) {
        const isForwardStep = simTime > lastTrackedSimTimeRef.current + 1e-6;
        for (let g = 0; g < geometry.groupCount; g += 1) {
          const members = geometry.groupMembers[g];
          let countSum = 0;
          for (let m = 0; m < members.length; m += 1) {
            const member = members[m];
            countSum += courseTmpCounts[member.courseIdx][member.segIdx] || 0;
          }
          const density = countSum / segmentLengthMeters;
          frameDensity[g] = density;

          if (isForwardStep) {
            frameCount[g] += 1;
            if (density > 0) {
              seen[g] = 1;
              nonZeroSum[g] += density;
              nonZeroCount[g] += 1;
            }
            if (density > maxDensity[g]) {
              maxDensity[g] = density;
            }
          }
        }
      }

      lastTrackedSimTimeRef.current = simTime;

      for (let g = 0; g < geometry.groupCount; g += 1) {
        avgValues[g] = nonZeroCount[g] > 0 ? nonZeroSum[g] / nonZeroCount[g] : 0;
      }

      if (showRouteHeatmap && geometry.entries.length > 0) {
        const activeThreshold = heatMetric === 'average' ? averageRedThreshold : maxRedThreshold;
        const denom = Math.max(1e-6, activeThreshold);

        const drawOrder = [...geometry.entries];
        drawOrder.sort((a, b) => {
          const va = heatMetric === 'average' ? avgValues[a.groupIdx] : maxDensity[a.groupIdx];
          const vb = heatMetric === 'average' ? avgValues[b.groupIdx] : maxDensity[b.groupIdx];
          return va - vb;
        });

        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        for (let i = 0; i < drawOrder.length; i += 1) {
          const seg = drawOrder[i];
          if (seen[seg.groupIdx] === 0) continue;

          const value = heatMetric === 'average' ? avgValues[seg.groupIdx] : maxDensity[seg.groupIdx];
          const norm = value / denom;

          const pt0 = map.latLngToContainerPoint([seg.p0.lat, seg.p0.lng]);
          const pt1 = map.latLngToContainerPoint([seg.p1.lat, seg.p1.lng]);
          ctx.beginPath();
          ctx.moveTo(pt0.x, pt0.y);
          ctx.lineTo(pt1.x, pt1.y);
          ctx.lineWidth = 8;
          ctx.strokeStyle = densityToColor(norm);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 0.92;
      const lowDensity = invDensityRadius;
      const highDensity = thresholdRunnerDensity;
      const dotDenom = Math.max(1e-6, highDensity - lowDensity);

      for (let i = 0; i < activeRunnerCount; i += 1) {
        const pt = map.latLngToContainerPoint([lats[i], lngs[i]]);
        const norm = (densityPerRunner[i] - lowDensity) / dotDenom;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.7, 0, Math.PI * 2);
        ctx.fillStyle = densityToColor(norm);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  }, [
    courses,
    simTime,
    playing,
    densityRadiusMeters,
    thresholdRunnerDensity,
    segmentLengthMeters,
    geometry,
    heatMetric,
    showRouteHeatmap,
    averageRedThreshold,
    maxRedThreshold,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMapChange = () => draw();
    map.on('move zoom resize', onMapChange);
    draw();

    return () => {
      map.off('move zoom resize', onMapChange);
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="map-wrap">
      <div ref={mapRootRef} className="map-root" />
      <canvas ref={canvasRef} className="overlay-canvas" />
    </div>
  );
}
