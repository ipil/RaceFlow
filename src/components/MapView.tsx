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

type MapViewProps = {
  routeData: RouteData | null;
  runners: Runner[];
  simTime: number;
  playing: boolean;
  densityRadiusMeters: number;
  thresholdRunnerDensity: number;
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  averageMode: 'active_avg' | 'p90' | 'top30' | 'window';
  showRouteHeatmap: boolean;
  averageRedThreshold: number;
  maxRedThreshold: number;
};

function densityToColor(norm: number): string {
  const clamped = Math.max(0, Math.min(1, norm));
  const hue = 220 - 220 * clamped;
  const sat = 80;
  const light = 50 - clamped * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-9) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function segmentToSegmentDistSq(
  a0x: number,
  a0y: number,
  a1x: number,
  a1y: number,
  b0x: number,
  b0y: number,
  b1x: number,
  b1y: number,
): number {
  const d1 = pointToSegmentDistSq(a0x, a0y, b0x, b0y, b1x, b1y);
  const d2 = pointToSegmentDistSq(a1x, a1y, b0x, b0y, b1x, b1y);
  const d3 = pointToSegmentDistSq(b0x, b0y, a0x, a0y, a1x, a1y);
  const d4 = pointToSegmentDistSq(b1x, b1y, a0x, a0y, a1x, a1y);
  return Math.min(d1, d2, d3, d4);
}

export default function MapView({
  routeData,
  runners,
  simTime,
  playing,
  densityRadiusMeters,
  thresholdRunnerDensity,
  segmentLengthMeters,
  heatMetric,
  averageMode,
  showRouteHeatmap,
  averageRedThreshold,
  maxRedThreshold,
}: MapViewProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  const distancesRef = useRef<Float64Array>(new Float64Array(0));
  const latRef = useRef<Float64Array>(new Float64Array(0));
  const lngRef = useRef<Float64Array>(new Float64Array(0));
  const xMetersRef = useRef<Float64Array>(new Float64Array(0));
  const yMetersRef = useRef<Float64Array>(new Float64Array(0));
  const densityPerRunnerRef = useRef<Float32Array>(new Float32Array(0));
  const segmentSumDensityRef = useRef<Float64Array>(new Float64Array(0));
  const segmentSampleCountRef = useRef<Uint32Array>(new Uint32Array(0));
  const segmentMaxDensityRef = useRef<Float32Array>(new Float32Array(0));
  const segmentTmpCountRef = useRef<Uint16Array>(new Uint16Array(0));
  const segmentSeenRef = useRef<Uint8Array>(new Uint8Array(0));
  const segmentNonZeroSumRef = useRef<Float64Array>(new Float64Array(0));
  const segmentNonZeroCountRef = useRef<Uint32Array>(new Uint32Array(0));
  const segmentWindowSumRef = useRef<Float64Array>(new Float64Array(0));
  const segmentWindowCountRef = useRef<Uint32Array>(new Uint32Array(0));
  const segmentHistCountsRef = useRef<Uint32Array>(new Uint32Array(0));
  const segmentHistTotalNonZeroRef = useRef<Uint32Array>(new Uint32Array(0));
  const windowSamplesRef = useRef<Array<{ t: number; values: Float32Array }>>([]);
  const lastSampleSimTimeRef = useRef(0);
  const groupValueRef = useRef<Float32Array>(new Float32Array(0));
  const groupSeenRef = useRef<Uint8Array>(new Uint8Array(0));
  const lastTrackedSimTimeRef = useRef(0);
  const avgModeValueRef = useRef<Float32Array>(new Float32Array(0));

  const HIST_BIN_WIDTH = 0.25;
  const HIST_MAX_VALUE = 50;
  const HIST_BIN_COUNT = Math.floor(HIST_MAX_VALUE / HIST_BIN_WIDTH) + 1;
  const WINDOW_SECONDS = 180;
  const SAMPLE_INTERVAL_SECONDS = 1;

  const segmentCount = routeData ? Math.max(1, Math.ceil(routeData.total / segmentLengthMeters)) : 0;
  const segmentBreakpoints = useMemo(() => {
    if (!routeData || routeData.total <= 0) return [] as LatLng[];
    const count = Math.max(1, Math.ceil(routeData.total / segmentLengthMeters));
    const out = new Array<LatLng>(count + 1);
    for (let i = 0; i <= count; i += 1) {
      const d = Math.min(routeData.total, i * segmentLengthMeters);
      out[i] = positionAtDistance(routeData.points, routeData.cumdist, d);
    }
    return out;
  }, [routeData, segmentLengthMeters]);

  const segmentSpatialGroups = useMemo(() => {
    if (!routeData || segmentCount <= 0 || segmentBreakpoints.length !== segmentCount + 1) {
      return { segToGroup: new Uint32Array(0), groupCount: 0 };
    }

    const earthRadiusM = 6371000;
    const refLatRad = (routeData.points[0].lat * Math.PI) / 180;
    const cosRefLat = Math.cos(refLatRad);
    const ax = new Float64Array(segmentCount);
    const ay = new Float64Array(segmentCount);
    const bx = new Float64Array(segmentCount);
    const by = new Float64Array(segmentCount);
    for (let i = 0; i < segmentCount; i += 1) {
      const p0 = segmentBreakpoints[i];
      const p1 = segmentBreakpoints[i + 1];
      const x0 = earthRadiusM * ((p0.lng * Math.PI) / 180) * cosRefLat;
      const y0 = earthRadiusM * ((p0.lat * Math.PI) / 180);
      const x1 = earthRadiusM * ((p1.lng * Math.PI) / 180) * cosRefLat;
      const y1 = earthRadiusM * ((p1.lat * Math.PI) / 180);
      ax[i] = x0;
      ay[i] = y0;
      bx[i] = x1;
      by[i] = y1;
    }

    const parent = new Int32Array(segmentCount);
    const rank = new Int8Array(segmentCount);
    for (let i = 0; i < segmentCount; i += 1) parent[i] = i;

    const find = (x: number): number => {
      let p = x;
      while (parent[p] !== p) {
        parent[p] = parent[parent[p]];
        p = parent[p];
      }
      return p;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra] += 1;
      }
    };

    const toleranceM = Math.max(1.5, Math.min(5, segmentLengthMeters * 0.5));
    const toleranceSq = toleranceM * toleranceM;
    const minRouteSeparationM = Math.max(20, segmentLengthMeters * 4);
    const cellSizeM = toleranceM;
    const sampleStepM = Math.max(0.75, Math.min(2, segmentLengthMeters * 0.5));
    const cells = new Map<string, number[]>();

    for (let i = 0; i < segmentCount; i += 1) {
      const dx = bx[i] - ax[i];
      const dy = by[i] - ay[i];
      const segLen = Math.hypot(dx, dy);
      const sampleCount = Math.max(1, Math.ceil(segLen / sampleStepM));
      const candidateSet = new Set<number>();
      const touchedKeys = new Set<string>();

      for (let s = 0; s <= sampleCount; s += 1) {
        const t = s / sampleCount;
        const x = ax[i] + dx * t;
        const y = ay[i] + dy * t;
        const cx = Math.floor(x / cellSizeM);
        const cy = Math.floor(y / cellSizeM);

        for (let ox = -1; ox <= 1; ox += 1) {
          for (let oy = -1; oy <= 1; oy += 1) {
            const key = `${cx + ox}:${cy + oy}`;
            const list = cells.get(key);
            if (!list) continue;
            for (let k = 0; k < list.length; k += 1) candidateSet.add(list[k]);
          }
        }

        touchedKeys.add(`${cx}:${cy}`);
      }

      candidateSet.forEach((j) => {
        const routeSeparationM = Math.abs(i - j) * segmentLengthMeters;
        // Prevent contiguous route neighbors from chaining the entire course into one group.
        if (routeSeparationM < minRouteSeparationM) return;
        const distSq = segmentToSegmentDistSq(
          ax[i],
          ay[i],
          bx[i],
          by[i],
          ax[j],
          ay[j],
          bx[j],
          by[j],
        );
        if (distSq <= toleranceSq) union(i, j);
      });

      touchedKeys.forEach((key) => {
        const list = cells.get(key);
        if (list) {
          list.push(i);
        } else {
          cells.set(key, [i]);
        }
      });
    }

    const segToGroup = new Uint32Array(segmentCount);
    const rootToGroup = new Map<number, number>();
    let groupCount = 0;
    for (let i = 0; i < segmentCount; i += 1) {
      const root = find(i);
      const existing = rootToGroup.get(root);
      if (existing !== undefined) {
        segToGroup[i] = existing;
      } else {
        segToGroup[i] = groupCount;
        rootToGroup.set(root, groupCount);
        groupCount += 1;
      }
    }

    return { segToGroup, groupCount };
  }, [routeData, segmentCount, segmentBreakpoints, segmentLengthMeters]);

  useEffect(() => {
    if (!routeData || segmentCount <= 0) return;
    segmentSumDensityRef.current = new Float64Array(segmentCount);
    segmentSampleCountRef.current = new Uint32Array(segmentCount);
    segmentMaxDensityRef.current = new Float32Array(segmentCount);
    segmentTmpCountRef.current = new Uint16Array(segmentCount);
    segmentSeenRef.current = new Uint8Array(segmentCount);
    segmentNonZeroSumRef.current = new Float64Array(segmentCount);
    segmentNonZeroCountRef.current = new Uint32Array(segmentCount);
    segmentWindowSumRef.current = new Float64Array(segmentCount);
    segmentWindowCountRef.current = new Uint32Array(segmentCount);
    segmentHistCountsRef.current = new Uint32Array(segmentCount * HIST_BIN_COUNT);
    segmentHistTotalNonZeroRef.current = new Uint32Array(segmentCount);
    windowSamplesRef.current = [];
    avgModeValueRef.current = new Float32Array(segmentCount);
    lastSampleSimTimeRef.current = 0;
    lastTrackedSimTimeRef.current = 0;
  }, [routeData, segmentLengthMeters, runners, segmentCount]);

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
    if (!map || !routeData || routeData.points.length < 2) return;

    routeLayerRef.current?.remove();

    const latLngs = routeData.points.map((p) => [p.lat, p.lng]) as [number, number][];
    routeLayerRef.current = L.polyline(latLngs, {
      color: '#6b7280',
      weight: 4,
      opacity: 0.9,
    }).addTo(map);

    map.fitBounds(latLngs as LatLngBoundsExpression, { padding: [20, 20] });
  }, [routeData]);

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

      if (!routeData || routeData.points.length < 2 || runners.length === 0 || routeData.total <= 0) {
        return;
      }

      const runnerCount = runners.length;

      if (distancesRef.current.length < runnerCount) {
        distancesRef.current = new Float64Array(runnerCount);
        latRef.current = new Float64Array(runnerCount);
        lngRef.current = new Float64Array(runnerCount);
        xMetersRef.current = new Float64Array(runnerCount);
        yMetersRef.current = new Float64Array(runnerCount);
        densityPerRunnerRef.current = new Float32Array(runnerCount);
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
      const refLatRad = (routeData.points[0].lat * Math.PI) / 180;
      const cosRefLat = Math.cos(refLatRad);
      const segmentTmpCount = segmentTmpCountRef.current;
      const segmentSumDensity = segmentSumDensityRef.current;
      const segmentSampleCount = segmentSampleCountRef.current;
      const segmentMaxDensity = segmentMaxDensityRef.current;
      const segmentSeen = segmentSeenRef.current;
      const segmentNonZeroSum = segmentNonZeroSumRef.current;
      const segmentNonZeroCount = segmentNonZeroCountRef.current;
      const segmentWindowSum = segmentWindowSumRef.current;
      const segmentWindowCount = segmentWindowCountRef.current;
      const segmentHistCounts = segmentHistCountsRef.current;
      const segmentHistTotalNonZero = segmentHistTotalNonZeroRef.current;
      const windowSamples = windowSamplesRef.current;
      const avgModeValue = avgModeValueRef.current;

      for (let i = 0; i < runnerCount; i += 1) {
        const d = runnerDistanceMeters(runners[i], simTime, routeData.total);
        distances[i] = d;
        const pos = positionAtDistance(routeData.points, routeData.cumdist, d);
        lats[i] = pos.lat;
        lngs[i] = pos.lng;
        const latRad = (pos.lat * Math.PI) / 180;
        const lngRad = (pos.lng * Math.PI) / 180;
        xs[i] = earthRadiusM * lngRad * cosRefLat;
        ys[i] = earthRadiusM * latRad;
        densityPerRunner[i] = 1;
      }

      for (let i = 0; i < runnerCount; i += 1) {
        const xi = xs[i];
        const yi = ys[i];
        for (let j = i + 1; j < runnerCount; j += 1) {
          const dx = xi - xs[j];
          const dy = yi - ys[j];
          if (dx * dx + dy * dy <= radiusSq) {
            densityPerRunner[i] += 1;
            densityPerRunner[j] += 1;
          }
        }
        densityPerRunner[i] *= invDensityRadius;
      }

      if (simTime < lastTrackedSimTimeRef.current) {
        segmentSumDensity.fill(0);
        segmentSampleCount.fill(0);
        segmentMaxDensity.fill(0);
        segmentSeen.fill(0);
        segmentNonZeroSum.fill(0);
        segmentNonZeroCount.fill(0);
        segmentWindowSum.fill(0);
        segmentWindowCount.fill(0);
        segmentHistCounts.fill(0);
        segmentHistTotalNonZero.fill(0);
        windowSamplesRef.current = [];
        lastSampleSimTimeRef.current = 0;
      }
      if (playing && segmentCount > 0) {
        segmentTmpCount.fill(0);

        for (let i = 0; i < runnerCount; i += 1) {
          const segIdx = Math.min(
            segmentCount - 1,
            Math.max(0, Math.floor(distances[i] / segmentLengthMeters)),
          );
          segmentTmpCount[segIdx] += 1;
        }

        for (let i = 0; i < segmentCount; i += 1) {
          const frameDensity = segmentTmpCount[i] / segmentLengthMeters;
          if (frameDensity > 0) {
            segmentSeen[i] = 1;
          }
          if (segmentSeen[i] === 0) {
            continue;
          }

          segmentSumDensity[i] += frameDensity;
          segmentSampleCount[i] += 1;
          if (frameDensity > segmentMaxDensity[i]) {
            segmentMaxDensity[i] = frameDensity;
          }
        }

        const shouldSample =
          simTime === 0 ||
          simTime - lastSampleSimTimeRef.current >= SAMPLE_INTERVAL_SECONDS ||
          lastSampleSimTimeRef.current === 0;
        if (shouldSample) {
          const snapshot = new Float32Array(segmentCount);
          for (let i = 0; i < segmentCount; i += 1) {
            const density = segmentTmpCount[i] / segmentLengthMeters;
            snapshot[i] = density;
            if (density > 0) {
              segmentNonZeroSum[i] += density;
              segmentNonZeroCount[i] += 1;
              segmentWindowSum[i] += density;
              segmentWindowCount[i] += 1;
              segmentHistTotalNonZero[i] += 1;
              const bin = Math.min(HIST_BIN_COUNT - 1, Math.floor(density / HIST_BIN_WIDTH));
              segmentHistCounts[i * HIST_BIN_COUNT + bin] += 1;
            }
          }
          windowSamples.push({ t: simTime, values: snapshot });
          while (windowSamples.length > 0 && simTime - windowSamples[0].t > WINDOW_SECONDS) {
            const oldest = windowSamples.shift();
            if (!oldest) break;
            for (let i = 0; i < segmentCount; i += 1) {
              const density = oldest.values[i];
              if (density > 0) {
                segmentWindowSum[i] -= density;
                segmentWindowCount[i] -= 1;
              }
            }
          }
          lastSampleSimTimeRef.current = simTime;
        }
      }
      lastTrackedSimTimeRef.current = simTime;

      if (avgModeValue.length === segmentCount) {
        for (let i = 0; i < segmentCount; i += 1) {
          if (segmentSeen[i] === 0) {
            avgModeValue[i] = 0;
            continue;
          }
          if (averageMode === 'active_avg') {
            avgModeValue[i] =
              segmentNonZeroCount[i] > 0 ? segmentNonZeroSum[i] / segmentNonZeroCount[i] : 0;
            continue;
          }
          if (averageMode === 'window') {
            avgModeValue[i] =
              segmentWindowCount[i] > 0 ? segmentWindowSum[i] / segmentWindowCount[i] : 0;
            continue;
          }

          const total = segmentHistTotalNonZero[i];
          if (total === 0) {
            avgModeValue[i] = 0;
            continue;
          }
          const base = i * HIST_BIN_COUNT;

          if (averageMode === 'p90') {
            const target = Math.ceil(total * 0.9);
            let cum = 0;
            let binIdx = 0;
            for (; binIdx < HIST_BIN_COUNT; binIdx += 1) {
              cum += segmentHistCounts[base + binIdx];
              if (cum >= target) break;
            }
            avgModeValue[i] = Math.min(HIST_MAX_VALUE, (binIdx + 0.5) * HIST_BIN_WIDTH);
            continue;
          }

          const topCount = Math.max(1, Math.ceil(total * 0.3));
          let remaining = topCount;
          let sum = 0;
          for (let binIdx = HIST_BIN_COUNT - 1; binIdx >= 0 && remaining > 0; binIdx -= 1) {
            const c = segmentHistCounts[base + binIdx];
            if (c === 0) continue;
            const take = Math.min(remaining, c);
            const binCenter = Math.min(HIST_MAX_VALUE, (binIdx + 0.5) * HIST_BIN_WIDTH);
            sum += take * binCenter;
            remaining -= take;
          }
          avgModeValue[i] = sum / topCount;
        }
      }

      if (showRouteHeatmap && segmentCount > 0 && segmentBreakpoints.length === segmentCount + 1) {
        const activeRedThreshold =
          heatMetric === 'average' ? averageRedThreshold : maxRedThreshold;
        const denom = Math.max(1e-6, activeRedThreshold);
        const { segToGroup, groupCount } = segmentSpatialGroups;
        if (groupValueRef.current.length !== groupCount) {
          groupValueRef.current = new Float32Array(groupCount);
        }
        if (groupSeenRef.current.length !== groupCount) {
          groupSeenRef.current = new Uint8Array(groupCount);
        }
        const groupValues = groupValueRef.current;
        const groupSeen = groupSeenRef.current;
        groupValues.fill(0);
        groupSeen.fill(0);

        for (let i = 0; i < segmentCount; i += 1) {
          const hasSeenRunner = segmentSeen[i] === 1;
          if (!hasSeenRunner) continue;
          const value =
            heatMetric === 'average'
              ? avgModeValue[i]
              : segmentMaxDensity[i];
          const g = segToGroup[i];
          groupSeen[g] = 1;
          if (value > groupValues[g]) {
            groupValues[g] = value;
          }
        }

        ctx.globalAlpha = 1;
        ctx.lineCap = 'round';
        for (let i = 0; i < segmentCount; i += 1) {
          const p0 = segmentBreakpoints[i];
          const p1 = segmentBreakpoints[i + 1];
          const pt0 = map.latLngToContainerPoint([p0.lat, p0.lng]);
          const pt1 = map.latLngToContainerPoint([p1.lat, p1.lng]);
          const groupIdx = segToGroup[i];
          const hasSeenRunner = segmentSeen[i] === 1;
          if (!hasSeenRunner || groupSeen[groupIdx] === 0) continue;
          const value = groupValues[groupIdx];
          const norm = value / denom;
          ctx.beginPath();
          ctx.moveTo(pt0.x, pt0.y);
          ctx.lineTo(pt1.x, pt1.y);
          ctx.lineWidth = 8;
          ctx.strokeStyle = densityToColor(norm);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 0.92;
      for (let i = 0; i < runnerCount; i += 1) {
        const pt = map.latLngToContainerPoint([lats[i], lngs[i]]);
        const lowDensity = invDensityRadius;
        const highDensity = thresholdRunnerDensity;
        const denom = Math.max(1e-6, highDensity - lowDensity);
        const norm = (densityPerRunner[i] - lowDensity) / denom;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.7, 0, Math.PI * 2);
        ctx.fillStyle = densityToColor(norm);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  }, [
    routeData,
    runners,
    simTime,
    playing,
    densityRadiusMeters,
    thresholdRunnerDensity,
    segmentLengthMeters,
    segmentCount,
    segmentBreakpoints,
    segmentSpatialGroups,
    heatMetric,
    averageMode,
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
      <div className="legend">
        <div><strong>Runner Density</strong></div>
        <div className="legend-bar" />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{(1 / Math.max(1e-6, densityRadiusMeters)).toFixed(2)} runners/m</span>
          <span>{thresholdRunnerDensity} runners/m</span>
        </div>
      </div>
    </div>
  );
}
