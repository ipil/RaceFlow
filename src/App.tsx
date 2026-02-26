import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import 'leaflet/dist/leaflet.css';
import MapView from './components/MapView';
import WaveEditor from './components/WaveEditor';
import Controls from './components/Controls';
import RouteCongestionStats from './components/RouteCongestionStats';
import RunnerDotColoring from './components/RunnerDotColoring';
import RunnerDensityLegend from './components/RunnerDensityLegend';
import {
  DEFAULT_MAP_OPTIONS,
  cloneDefaultWaves,
  createDefaultCoursePresets,
} from './components/Presets';
import CollapsiblePanel from './components/CollapsiblePanel';
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

type CourseState = {
  id: string;
  selectedDefaultMapUrl: string;
  routeData: RouteData | null;
  waves: Wave[];
  runners: Runner[];
  error: string | null;
};

function createCourse(courseNum: number): CourseState {
  return {
    id: `course-${courseNum}`,
    selectedDefaultMapUrl: DEFAULT_MAP_OPTIONS[0].url,
    routeData: null,
    waves: cloneDefaultWaves(),
    runners: [],
    error: null,
  };
}

function createDefaultCourses(): CourseState[] {
  return createDefaultCoursePresets().map((preset, idx) => ({
    ...createCourse(idx + 1),
    id: preset.id,
    selectedDefaultMapUrl: preset.selectedDefaultMapUrl,
    waves: preset.waves.map((w) => ({ ...w })),
  }));
}

const ONBOARDING_DISMISSED_KEY = 'raceflow_onboarding_dismissed';

async function loadPresetCoursesWithRoutes(courses: CourseState[]): Promise<CourseState[]> {
  const loaded = await Promise.all(
    courses.map(async (course) => {
      try {
        const resp = await fetch(course.selectedDefaultMapUrl);
        const text = await resp.text();
        const points = parseGpxToLatLngs(text);
        const built = buildCumulativeDistances(points);
        return {
          ...course,
          routeData: built,
          error: null,
          runners: generateRunners(course.waves).map((r) => ({
            ...r,
            id: `${course.id}-${r.id}`,
          })),
        };
      } catch {
        return {
          ...course,
          routeData: null,
          runners: [],
          error: 'Could not load default GPX route.',
        };
      }
    }),
  );

  return loaded;
}

export default function App() {
  const nextCourseNumRef = useRef(3);
  const [courses, setCourses] = useState<CourseState[]>(createDefaultCourses);

  const [simTime, setSimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [densityRadiusMeters, setDensityRadiusMeters] = useState(15);
  const [thresholdRunnerDensity, setThresholdRunnerDensity] = useState(2);
  const [segmentLengthMeters, setSegmentLengthMeters] = useState(5);
  const [heatMetric, setHeatMetric] = useState<'average' | 'max'>('average');
  const [showRouteHeatmap, setShowRouteHeatmap] = useState(true);
  const [averageRedThreshold, setAverageRedThreshold] = useState(1.5);
  const [maxRedThreshold, setMaxRedThreshold] = useState(1.5);
  const [runId, setRunId] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);

  const maxTime = useMemo(() => {
    let maxFinish = 0;
    for (let c = 0; c < courses.length; c += 1) {
      const course = courses[c];
      if (!course.routeData || course.routeData.total <= 0) continue;
      for (let i = 0; i < course.runners.length; i += 1) {
        const r = course.runners[i];
        const finish = r.startTimeSeconds + (course.routeData.total / 1000) * r.paceSecPerKm;
        if (finish > maxFinish) maxFinish = finish;
      }
    }
    return Math.max(3600, Math.ceil(maxFinish));
  }, [courses]);

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

  const setCourseField = <K extends keyof CourseState>(
    courseId: string,
    key: K,
    value: CourseState[K],
  ) => {
    setCourses((prev) =>
      prev.map((course) => (course.id === courseId ? { ...course, [key]: value } : course)),
    );
  };

  const loadGpxTextForCourse = (courseId: string, gpxText: string) => {
    try {
      const points = parseGpxToLatLngs(gpxText);
      const built = buildCumulativeDistances(points);
      setCourses((prev) =>
        prev.map((course) =>
          course.id === courseId
            ? { ...course, routeData: built, error: null, runners: [] }
            : course,
        ),
      );
      setPlaying(false);
      setSimTime(0);
      setRunId((v) => v + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to parse GPX file.';
      setCourseField(courseId, 'error', message);
    }
  };

  const onUploadFile =
    (courseId: string): ChangeEventHandler<HTMLInputElement> =>
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      loadGpxTextForCourse(courseId, text);
      e.currentTarget.value = '';
    };

  const onLoadDefaultRoute = async (courseId: string, url: string) => {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      loadGpxTextForCourse(courseId, text);
    } catch {
      setCourseField(courseId, 'error', 'Could not load default GPX route.');
    }
  };

  useEffect(() => {
    for (let i = 0; i < courses.length; i += 1) {
      void onLoadDefaultRoute(courses[i].id, courses[i].selectedDefaultMapUrl);
    }
  }, []);

  const addCourse = () => {
    const n = nextCourseNumRef.current;
    nextCourseNumRef.current += 1;
    setCourses((prev) => [...prev, createCourse(n)]);
  };

  const removeCourse = (courseId: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    setPlaying(false);
    setSimTime(0);
    setRunId((v) => v + 1);
  };

  const onPlayPause = () => {
    if (playing) {
      setPlaying(false);
      return;
    }

    if (simTime === 0) {
      setCourses((prev) =>
        prev.map((course) => {
          if (!course.routeData || course.routeData.total <= 0) {
            return { ...course, runners: [] };
          }
          const generated = generateRunners(course.waves).map((r) => ({
            ...r,
            id: `${course.id}-${r.id}`,
          }));
          return { ...course, runners: generated };
        }),
      );
      setRunId((v) => v + 1);
    }
    setPlaying(true);
  };

  const onRunExampleSimulation = async () => {
    setPlaying(false);
    setSpeed(20);
    setSimTime(0);

    const presetCourses = createDefaultCourses();
    const loadedCourses = await loadPresetCoursesWithRoutes(presetCourses);
    setCourses(loadedCourses);
    setRunId((v) => v + 1);
    setPlaying(true);
  };

  const dismissOnboardingHint = () => {
    if (onboardingDismissed) return;
    setOnboardingDismissed(true);
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      // Ignore localStorage write failures.
    }
  };

  const totalRunners = useMemo(
    () => courses.reduce((sum, c) => sum + c.runners.length, 0),
    [courses],
  );

  const mapCourses = useMemo(
    () => courses.map((c) => ({ id: c.id, routeData: c.routeData, runners: c.runners })),
    [courses],
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Race Flow Visualizer</h1>

        <CollapsiblePanel title="README">
          <h3>Quick Start</h3>
          <p>
            Want a one-click demo? Use <strong>▶ Run Example Simulation</strong> in Simulation Controls.
          </p>
          <ol>
            <li><strong>Choose a Map</strong> — select a sample course or upload a <code>.gpx</code> file.</li>
            <li>
              <strong>Add Starting Waves</strong> — define when runners start and their pace ranges.
              (Default waves correspond to a race held on the sample courses.)
            </li>
            <li><strong>Press Play</strong> — watch congestion evolve along the course.</li>
          </ol>
          <p>Each dot represents a runner.<br />Dot color indicates local runner density.</p>

          <h3>What This Tool Simulates</h3>
          <p>
            The simulator models runners progressing along a race course over time.
            Each runner is assigned a pace randomly sampled from the pace range of its starting wave.
          </p>
          <p>Two complementary congestion views are available:</p>
          <ul>
            <li><strong>Runner-centric density (always enabled)</strong> — crowding experienced by individual runners.</li>
            <li><strong>Route-centric density (selectively enabled)</strong> — congestion patterns along the course itself.</li>
          </ul>

          <h3>Core Elements</h3>
          <h4>Runner Density</h4>
          <p>Runner density measures how crowded an area is.</p>
          <p>For a given runner:</p>
          <ul>
            <li>a circular neighborhood is defined using a selectable density radius</li>
            <li>nearby runners inside that radius are counted</li>
            <li>dot color represents the resulting number density</li>
          </ul>
          <p>Higher density -&gt; warmer colors.</p>

          <h4>Starting Waves</h4>
          <p>A starting wave specifies:</p>
          <ul>
            <li>start time</li>
            <li>number of runners</li>
            <li>fastest and slowest pace</li>
          </ul>
          <p>
            Each runner&apos;s pace is randomly drawn from the wave&apos;s pace range, producing realistic
            spreading and overtaking behavior.
          </p>

          <h3>Controls Reference</h3>
          <h4>Map Selection</h4>
          <p>Load an example course or upload a <code>.gpx</code> route.</p>
          <p>
            To simulate multiple courses at once, click <strong>Add course</strong>. Each added course has its own
            map selection and wave settings, and all courses run together on the same map view.
          </p>

          <h4>Simulation Speed</h4>
          <p>Controls how quickly simulated race time advances. Default: 20x real time.</p>

          <h4>Runner Dot Coloring (Runner-Centric View)</h4>
          <ul>
            <li><strong>Density radius (m)</strong> Radius used to count neighboring runners.</li>
            <li><strong>Threshold runner density</strong> Minimum density mapped to the maximum (red) color.</li>
          </ul>
          <p>Adjust these parameters to highlight different congestion scales.</p>

          <h4>Route Congestion Stats (Route-Centric View)</h4>
          <p>Enable the heat map to analyze congestion along the course.</p>
          <p>The route is divided into segments of configurable length.</p>
          <p>Visualization modes</p>
          <ul>
            <li><strong>Average Density</strong> Mean runner density across all frames in which runners occupy a segment.</li>
            <li><strong>Maximum Density</strong> Highest density observed in a segment up to the current simulation time.</li>
          </ul>
          <p><strong>Threshold segment density</strong> Minimum density mapped to the maximum (red) segment color.</p>

          <h3>Interpreting Results</h3>
          <p>
            Out-and-back sections naturally exhibit higher measured densities because runners occupy the same
            physical corridor in opposing directions. High density in these regions is not necessarily problematic.
            High density in regions where the path is relatively straight and/or wide is also generally not too
            problematic.
          </p>
          <p>
            The tool is most useful for identifying undesirable congestion, such as congestion occurring in narrow,
            constrained, or highly curved portions of a course.
          </p>
        </CollapsiblePanel>

        <section className="control-group">
          <h2>Simulation Setup</h2>
          <p className="control-group-copy">Map and waves are configured per course. Speed is in Simulation Controls.</p>
          <div className="row">
            <button type="button" onClick={addCourse}>Add course</button>
          </div>

          {courses.map((course, index) => (
            <CollapsiblePanel key={course.id} title={`Course ${index + 1}`} defaultOpen={index === 0}>
              <div className="row">
                <label htmlFor={`gpx-upload-${course.id}`}>Upload GPX</label>
                <input
                  id={`gpx-upload-${course.id}`}
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  onChange={onUploadFile(course.id)}
                />
              </div>
              <div className="row">
                <label htmlFor={`default-map-select-${course.id}`}>Select an Example Map</label>
                <select
                  id={`default-map-select-${course.id}`}
                  value={course.selectedDefaultMapUrl}
                  onChange={(e) => setCourseField(course.id, 'selectedDefaultMapUrl', e.target.value)}
                >
                  {DEFAULT_MAP_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.url}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row">
                <button
                  type="button"
                  onClick={() => void onLoadDefaultRoute(course.id, course.selectedDefaultMapUrl)}
                >
                  Load selected default map
                </button>
                <button
                  type="button"
                  disabled={courses.length === 1}
                  onClick={() => removeCourse(course.id)}
                >
                  Remove course
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
                Route length: {course.routeData ? `${course.routeData.total.toFixed(0)} m` : 'No route loaded'}
              </div>
              {course.error && <div style={{ color: '#b91c1c', marginTop: 6 }}>{course.error}</div>}

              <WaveEditor
                waves={course.waves}
                setWaves={(waves) => setCourseField(course.id, 'waves', waves)}
                collapsible={false}
              />
            </CollapsiblePanel>
          ))}
        </section>

        <section className="control-group">
          <h2>Visualization</h2>
          <p className="control-group-copy">Tune how runner dots and route segments are color-mapped.</p>
          <RunnerDotColoring
            densityRadiusMeters={densityRadiusMeters}
            thresholdRunnerDensity={thresholdRunnerDensity}
            onDensityRadiusChange={(radius) => {
              if (!Number.isFinite(radius)) return;
              setDensityRadiusMeters(Math.max(2, Math.min(20, Math.round(radius))));
            }}
            onThresholdRunnerDensityChange={(value) => {
              if (!Number.isFinite(value)) return;
              setThresholdRunnerDensity(Math.max(0, Math.min(10, Math.round(value))));
            }}
          />

          <RouteCongestionStats
            segmentLengthMeters={segmentLengthMeters}
            heatMetric={heatMetric}
            averageRedThreshold={averageRedThreshold}
            maxRedThreshold={maxRedThreshold}
            onSegmentLengthChange={(value) => {
              if (!Number.isFinite(value)) return;
              setSegmentLengthMeters(Math.max(1, Math.min(100, Math.round(value))));
            }}
            onHeatMetricChange={(value) => setHeatMetric(value)}
            onAverageRedThresholdChange={(value) => {
              if (!Number.isFinite(value)) return;
              setAverageRedThreshold(Math.max(0, Math.min(10, value)));
            }}
            onMaxRedThresholdChange={(value) => {
              if (!Number.isFinite(value)) return;
              setMaxRedThreshold(Math.max(0, Math.min(10, value)));
            }}
          />
        </section>

        <CollapsiblePanel title="Status">
          <div>Courses: {courses.length}</div>
          <div>Total runners: {totalRunners}</div>
        </CollapsiblePanel>
      </aside>

      <div className="map-pane">
        <MapView
          courses={mapCourses}
          simTime={simTime}
          playing={playing}
          densityRadiusMeters={densityRadiusMeters}
          thresholdRunnerDensity={thresholdRunnerDensity}
          segmentLengthMeters={segmentLengthMeters}
          heatMetric={heatMetric}
          showRouteHeatmap={showRouteHeatmap}
          averageRedThreshold={averageRedThreshold}
          maxRedThreshold={maxRedThreshold}
          runId={runId}
        />
        <div className="floating-controls">
          <Controls
            simTime={simTime}
            maxTime={maxTime}
            playing={playing}
            speed={speed}
            showOnboardingHint={!onboardingDismissed}
            onRunExampleSimulation={() => void onRunExampleSimulation()}
            onDismissOnboardingHint={dismissOnboardingHint}
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
            showRouteHeatmap={showRouteHeatmap}
            onShowRouteHeatmapChange={(value) => setShowRouteHeatmap(value)}
          />
        </div>
        <RunnerDensityLegend />
      </div>
    </div>
  );
}
