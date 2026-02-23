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
  smoothNeighborBins?: boolean;
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
  smoothNeighborBins = true,
}: MapViewProps) {
  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  const distancesRef = useRef<Float64Array>(new Float64Array(0));
  const binIdxRef = useRef<Uint16Array>(new Uint16Array(0));
  const binsRef = useRef<Uint16Array>(new Uint16Array(0));
  const smoothBinsRef = useRef<Float32Array>(new Float32Array(0));
  const densityPerRunnerRef = useRef<Float32Array>(new Float32Array(0));

  const binSize = 50;

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
      color: '#1d4ed8',
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
      const binCount = Math.max(1, Math.floor(routeData.total / binSize) + 1);

      if (distancesRef.current.length < runnerCount) {
        distancesRef.current = new Float64Array(runnerCount);
        binIdxRef.current = new Uint16Array(runnerCount);
        densityPerRunnerRef.current = new Float32Array(runnerCount);
      }
      if (binsRef.current.length !== binCount) {
        binsRef.current = new Uint16Array(binCount);
        smoothBinsRef.current = new Float32Array(binCount);
      }

      const distances = distancesRef.current;
      const binIdxs = binIdxRef.current;
      const bins = binsRef.current;
      const smoothBins = smoothBinsRef.current;
      const densityPerRunner = densityPerRunnerRef.current;
      bins.fill(0);

      for (let i = 0; i < runnerCount; i += 1) {
        const d = runnerDistanceMeters(runners[i], simTime, routeData.total);
        distances[i] = d;
        const idx = Math.min(binCount - 1, Math.max(0, Math.floor(d / binSize)));
        binIdxs[i] = idx;
        bins[idx] += 1;
      }

      let maxDensity = 1;
      if (smoothNeighborBins) {
        for (let i = 0; i < binCount; i += 1) {
          const left = i > 0 ? bins[i - 1] : bins[i];
          const center = bins[i];
          const right = i < binCount - 1 ? bins[i + 1] : bins[i];
          const smoothed = (left + center + right) / 3;
          smoothBins[i] = smoothed;
          if (smoothed > maxDensity) maxDensity = smoothed;
        }

        for (let i = 0; i < runnerCount; i += 1) {
          densityPerRunner[i] = smoothBins[binIdxs[i]];
        }
      } else {
        for (let i = 0; i < runnerCount; i += 1) {
          const density = bins[binIdxs[i]];
          densityPerRunner[i] = density;
          if (density > maxDensity) maxDensity = density;
        }
      }

      ctx.globalAlpha = 0.92;
      for (let i = 0; i < runnerCount; i += 1) {
        const pos = positionAtDistance(routeData.points, routeData.cumdist, distances[i]);
        const pt = map.latLngToContainerPoint([pos.lat, pos.lng]);
        const norm = densityPerRunner[i] / maxDensity;

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.7, 0, Math.PI * 2);
        ctx.fillStyle = densityToColor(norm);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  }, [routeData, runners, simTime, smoothNeighborBins]);

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
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
