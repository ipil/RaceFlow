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
  maxDensityColorValue: number;
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
};

function densityToColor(norm: number): string {
  const clamped = Math.max(0, Math.min(1, norm));
  const hue = 220 - 220 * clamped;
  const sat = 80;
  const light = 50 - clamped * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

export default function MapView({
  routeData,
  runners,
  simTime,
  playing,
  densityRadiusMeters,
  maxDensityColorValue,
  segmentLengthMeters,
  heatMetric,
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
  const segmentWeightRef = useRef<Float64Array>(new Float64Array(0));
  const segmentMaxDensityRef = useRef<Float32Array>(new Float32Array(0));
  const segmentTmpSumRef = useRef<Float64Array>(new Float64Array(0));
  const segmentTmpCountRef = useRef<Uint16Array>(new Uint16Array(0));
  const segmentTmpMaxRef = useRef<Float32Array>(new Float32Array(0));
  const lastTrackedSimTimeRef = useRef(0);

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

  useEffect(() => {
    if (!routeData || segmentCount <= 0) return;
    segmentSumDensityRef.current = new Float64Array(segmentCount);
    segmentWeightRef.current = new Float64Array(segmentCount);
    segmentMaxDensityRef.current = new Float32Array(segmentCount);
    segmentTmpSumRef.current = new Float64Array(segmentCount);
    segmentTmpCountRef.current = new Uint16Array(segmentCount);
    segmentTmpMaxRef.current = new Float32Array(segmentCount);
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
      const earthRadiusM = 6371000;
      const refLatRad = (routeData.points[0].lat * Math.PI) / 180;
      const cosRefLat = Math.cos(refLatRad);
      const segmentTmpSum = segmentTmpSumRef.current;
      const segmentTmpCount = segmentTmpCountRef.current;
      const segmentTmpMax = segmentTmpMaxRef.current;
      const segmentSumDensity = segmentSumDensityRef.current;
      const segmentWeight = segmentWeightRef.current;
      const segmentMaxDensity = segmentMaxDensityRef.current;

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
      }

      if (simTime < lastTrackedSimTimeRef.current) {
        segmentSumDensity.fill(0);
        segmentWeight.fill(0);
        segmentMaxDensity.fill(0);
      }
      const deltaTime = Math.max(0, simTime - lastTrackedSimTimeRef.current);
      if (playing && deltaTime > 0 && segmentCount > 0) {
        segmentTmpSum.fill(0);
        segmentTmpCount.fill(0);
        segmentTmpMax.fill(0);

        for (let i = 0; i < runnerCount; i += 1) {
          const segIdx = Math.min(
            segmentCount - 1,
            Math.max(0, Math.floor(distances[i] / segmentLengthMeters)),
          );
          const density = densityPerRunner[i];
          segmentTmpSum[segIdx] += density;
          segmentTmpCount[segIdx] += 1;
          if (density > segmentTmpMax[segIdx]) {
            segmentTmpMax[segIdx] = density;
          }
        }

        for (let i = 0; i < segmentCount; i += 1) {
          if (segmentTmpCount[i] > 0) {
            const frameAvg = segmentTmpSum[i] / segmentTmpCount[i];
            segmentSumDensity[i] += frameAvg * deltaTime;
            segmentWeight[i] += deltaTime;
          }
          if (segmentTmpMax[i] > segmentMaxDensity[i]) {
            segmentMaxDensity[i] = segmentTmpMax[i];
          }
        }
      }
      lastTrackedSimTimeRef.current = simTime;

      if (segmentCount > 0 && segmentBreakpoints.length === segmentCount + 1) {
        const denom = Math.max(1, maxDensityColorValue - 1);
        ctx.globalAlpha = 0.9;
        ctx.lineCap = 'round';
        for (let i = 0; i < segmentCount; i += 1) {
          const p0 = segmentBreakpoints[i];
          const p1 = segmentBreakpoints[i + 1];
          const pt0 = map.latLngToContainerPoint([p0.lat, p0.lng]);
          const pt1 = map.latLngToContainerPoint([p1.lat, p1.lng]);
          const value =
            heatMetric === 'average'
              ? segmentWeight[i] > 0
                ? segmentSumDensity[i] / segmentWeight[i]
                : 0
              : segmentMaxDensity[i];
          const norm = (value - 1) / denom;
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
        const denom = Math.max(1, maxDensityColorValue - 1);
        const norm = (densityPerRunner[i] - 1) / denom;

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
    maxDensityColorValue,
    segmentLengthMeters,
    segmentCount,
    segmentBreakpoints,
    heatMetric,
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
          <span>1 runner</span>
          <span>{maxDensityColorValue} runners</span>
        </div>
      </div>
    </div>
  );
}
