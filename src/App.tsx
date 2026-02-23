import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import 'leaflet/dist/leaflet.css';
import MapView from './components/MapView';
import WaveEditor from './components/WaveEditor';
import Controls from './components/Controls';
import {
  buildCumulativeDistances,
  parseGpxToLatLngs,
  type LatLng,
} from './sim/route';
import { generateRunners, type Runner, type Wave } from './sim/sim';

type RouteData = {
  points: LatLng[];
  cumdist: number[];
  total: number;
};

const KM_PER_MILE = 1.609344;

function paceFromMinMile(minutes: number, seconds: number): number {
  return (minutes * 60 + seconds) / KM_PER_MILE;
}

const DEFAULT_WAVES: Wave[] = [
  {
    id: 'wave-1',
    startTimeSeconds: 0,
    runnerCount: 89,
    minPaceSecPerKm: paceFromMinMile(5, 51),
    maxPaceSecPerKm: paceFromMinMile(8, 30),
  },
  {
    id: 'wave-2',
    startTimeSeconds: 300,
    runnerCount: 158,
    minPaceSecPerKm: paceFromMinMile(8, 31),
    maxPaceSecPerKm: paceFromMinMile(11, 0),
  },
  {
    id: 'wave-3',
    startTimeSeconds: 600,
    runnerCount: 462,
    minPaceSecPerKm: paceFromMinMile(11, 0),
    maxPaceSecPerKm: paceFromMinMile(20, 0),
  },
];

export default function App() {
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [waves, setWaves] = useState<Wave[]>(DEFAULT_WAVES);
  const [runners, setRunners] = useState<Runner[]>([]);

  const [simTime, setSimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);

  const maxTime = useMemo(() => {
    if (!routeData || routeData.total <= 0) return 3600;
    if (runners.length === 0) return 3600;

    let maxFinish = 0;
    for (let i = 0; i < runners.length; i += 1) {
      const r = runners[i];
      const finish = r.startTimeSeconds + (routeData.total / 1000) * r.paceSecPerKm;
      if (finish > maxFinish) maxFinish = finish;
    }

    return Math.max(1, Math.ceil(maxFinish));
  }, [routeData, runners]);

  useEffect(() => {
    if (!playing) {
      lastFrameTsRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (ts: number) => {
      if (lastFrameTsRef.current === null) {
        lastFrameTsRef.current = ts;
      }
      const deltaSeconds = (ts - lastFrameTsRef.current) / 1000;
      lastFrameTsRef.current = ts;

      setSimTime((prev) => {
        const next = prev + deltaSeconds * speed;
        if (next >= maxTime) {
          setPlaying(false);
          return maxTime;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, speed, maxTime]);

  const loadGpxText = (gpxText: string) => {
    try {
      const points = parseGpxToLatLngs(gpxText);
      const built = buildCumulativeDistances(points);
      setRouteData(built);
      setError(null);
      setPlaying(false);
      setSimTime(0);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to parse GPX file.';
      setError(message);
    }
  };

  const onUploadFile: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadGpxText(text);
    e.currentTarget.value = '';
  };

  const onLoadDefaultRoute = async () => {
    try {
      const resp = await fetch('/default.gpx');
      const text = await resp.text();
      loadGpxText(text);
    } catch {
      setError('Could not load default GPX route.');
    }
  };

  useEffect(() => {
    void onLoadDefaultRoute();
  }, []);

  const onGenerateRunners = () => {
    const generated = generateRunners(waves);
    setRunners(generated);
    setSimTime(0);
    setPlaying(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>RaceFlow</h1>

        <div className="panel">
          <h2>Route</h2>
          <div className="row">
            <label htmlFor="gpx-upload">Upload GPX</label>
            <input id="gpx-upload" type="file" accept=".gpx,application/gpx+xml" onChange={onUploadFile} />
          </div>
          <button type="button" onClick={onLoadDefaultRoute}>
            Reload default route
          </button>
          <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
            Route length: {routeData ? `${routeData.total.toFixed(0)} m` : 'No route loaded'}
          </div>
          {error && <div style={{ color: '#b91c1c', marginTop: 6 }}>{error}</div>}
        </div>

        <WaveEditor waves={waves} setWaves={setWaves} onGenerateRunners={onGenerateRunners} />

        <Controls
          simTime={simTime}
          maxTime={maxTime}
          playing={playing}
          speed={speed}
          onPlayPause={() => setPlaying((p) => !p)}
          onReset={() => {
            setPlaying(false);
            setSimTime(0);
          }}
          onTimeChange={(t) => {
            setPlaying(false);
            setSimTime(Math.max(0, Math.min(maxTime, t)));
          }}
          onSpeedChange={(s) => setSpeed(s)}
        />

        <div className="panel">
          <h2>Status</h2>
          <div>Waves: {waves.length}</div>
          <div>Runners: {runners.length}</div>
        </div>
      </aside>

      <MapView routeData={routeData} runners={runners} simTime={simTime} />
    </div>
  );
}
