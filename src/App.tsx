import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import 'leaflet/dist/leaflet.css';
import MapView from './components/MapView';
import WaveEditor from './components/WaveEditor';
import Controls from './components/Controls';
import RouteCongestionStats from './components/RouteCongestionStats';
import RunnerDotColoring from './components/RunnerDotColoring';
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

const DEFAULT_MAP_OPTIONS = [
  { id: 'north-first', label: 'Heart to Start 5K - north first', url: '/default-north-first.gpx' },
  { id: 'south-first', label: 'Heart to Start 5K - south first', url: '/default-south-first.gpx' },
] as const;

export default function App() {
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [waves, setWaves] = useState<Wave[]>(DEFAULT_WAVES);
  const [runners, setRunners] = useState<Runner[]>([]);

  const [simTime, setSimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [selectedDefaultMapUrl, setSelectedDefaultMapUrl] = useState<string>(
    DEFAULT_MAP_OPTIONS[0].url,
  );
  const [densityRadiusMeters, setDensityRadiusMeters] = useState(15);
  const [maxDensityColorValue, setMaxDensityColorValue] = useState(20);
  const [segmentLengthMeters, setSegmentLengthMeters] = useState(5);
  const [heatMetric, setHeatMetric] = useState<'average' | 'max'>('average');
  const [showRouteHeatmap, setShowRouteHeatmap] = useState(true);
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

  const onLoadDefaultRoute = async (url: string) => {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      loadGpxText(text);
    } catch {
      setError('Could not load default GPX route.');
    }
  };

  useEffect(() => {
    void onLoadDefaultRoute(selectedDefaultMapUrl);
  }, []);

  const onPlayPause = () => {
    if (playing) {
      setPlaying(false);
      return;
    }

    if (simTime === 0) {
      const generated = generateRunners(waves);
      setRunners(generated);
    }
    setPlaying(true);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>RaceFlow</h1>

        <div className="panel">
          <p>
            This program simulates a flow of runners through a race course to visualize points of
            congestion along the course. Each dot represents a runner, and the color of each dot
            represents the number of runners within a selected radius of the dot at every point in
            time.
          </p>
          <p><strong>To use the tool:</strong></p>
          <p>
            <strong>1. Choose a Map</strong><br />
            Feel free to select an example course map from the drop-down menu or upload your own
            map as a .gpx file.
          </p>
          <p>
            <strong>2. Configure the Starting Waves</strong><br />
            You can add any number of starting waves of runners, each of which can start at any
            time and can have any number of runners.
          </p>
          <p>
            Each wave is characterized by a fastest pace and a slowest pace; for example, a first
            wave may be faster than 8:30/mile and a second wave may be between 8:31/mile and
            11:00/mile.
          </p>
          <p>
            In each wave, each runner&apos;s pace is randomly selected from the paces in the
            corresponding range of paces.
          </p>
          <p>
            The default waves represent the waves used in the 2026 Heart to Start 5k race in
            Tigard, Oregon. The defaul numbers of runners in each wave are the numbers of race
            finishers from that race with final paces in each wave pace interval.
          </p>
          <p>
            <strong>3. Select a Simulation Speed</strong><br />
            By default, the simulation proceeds at 20x real-time speed. Feel free to adjust this
            as desired.
          </p>
          <p>
            <strong>4. Configure the Density Visualization</strong><br />
            For purposes of color-coding the dots, the parameter Density radius (m) represents the
            radius (in meters) of the area around each runner in which the number of neighboring
            runners is counted. The parameter Max density (number of runners) represents the
            (smallest) number of runners in the area for which the dot color will be red. Play
            around with these values to get a good visualization. The default values are a good
            starting point, at least for the default maps.
          </p>
        </div>

        <div className="panel">
          <h2>Route</h2>
          <div className="row">
            <label htmlFor="gpx-upload">Upload GPX</label>
            <input id="gpx-upload" type="file" accept=".gpx,application/gpx+xml" onChange={onUploadFile} />
          </div>
          <div className="row">
            <label htmlFor="default-map-select">Select an Example Map</label>
            <select
              id="default-map-select"
              value={selectedDefaultMapUrl}
              onChange={(e) => setSelectedDefaultMapUrl(e.target.value)}
            >
              {DEFAULT_MAP_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.url}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void onLoadDefaultRoute(selectedDefaultMapUrl)}>
            Load selected default map
          </button>
          <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
            Route length: {routeData ? `${routeData.total.toFixed(0)} m` : 'No route loaded'}
          </div>
          {error && <div style={{ color: '#b91c1c', marginTop: 6 }}>{error}</div>}
        </div>

        <WaveEditor waves={waves} setWaves={setWaves} />

        <Controls
          simTime={simTime}
          maxTime={maxTime}
          playing={playing}
          speed={speed}
          onPlayPause={onPlayPause}
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

        <RunnerDotColoring
          densityRadiusMeters={densityRadiusMeters}
          maxDensityColorValue={maxDensityColorValue}
          onDensityRadiusChange={(radius) => {
            if (!Number.isFinite(radius)) return;
            setDensityRadiusMeters(Math.max(2, Math.min(20, Math.round(radius))));
          }}
          onMaxDensityColorValueChange={(value) => {
            if (!Number.isFinite(value)) return;
            setMaxDensityColorValue(Math.max(1, Math.min(200, Math.round(value))));
          }}
        />

        <RouteCongestionStats
          segmentLengthMeters={segmentLengthMeters}
          heatMetric={heatMetric}
          showRouteHeatmap={showRouteHeatmap}
          onSegmentLengthChange={(value) => {
            if (!Number.isFinite(value)) return;
            setSegmentLengthMeters(Math.max(1, Math.min(100, Math.round(value))));
          }}
          onHeatMetricChange={(value) => setHeatMetric(value)}
          onShowRouteHeatmapChange={(value) => setShowRouteHeatmap(value)}
        />

        <div className="panel">
          <h2>Status</h2>
          <div>Waves: {waves.length}</div>
          <div>Runners: {runners.length}</div>
        </div>
      </aside>

      <MapView
        routeData={routeData}
        runners={runners}
        simTime={simTime}
        playing={playing}
        densityRadiusMeters={densityRadiusMeters}
        maxDensityColorValue={maxDensityColorValue}
        segmentLengthMeters={segmentLengthMeters}
        heatMetric={heatMetric}
        showRouteHeatmap={showRouteHeatmap}
      />
    </div>
  );
}
