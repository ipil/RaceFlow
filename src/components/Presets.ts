import type { Wave } from '../sim/sim';

const KM_PER_MILE = 1.609344;

function paceFromMinMile(minutes: number, seconds: number): number {
  return (minutes * 60 + seconds) / KM_PER_MILE;
}

export const DEFAULT_WAVES: Wave[] = [
  {
    id: 'wave-1',
    startTimeSeconds: 600,
    runnerCount: 89,
    minPaceSecPerKm: paceFromMinMile(5, 51),
    maxPaceSecPerKm: paceFromMinMile(8, 30),
  },
  {
    id: 'wave-2',
    startTimeSeconds: 900,
    runnerCount: 158,
    minPaceSecPerKm: paceFromMinMile(8, 31),
    maxPaceSecPerKm: paceFromMinMile(11, 0),
  },
  {
    id: 'wave-3',
    startTimeSeconds: 1200,
    runnerCount: 462,
    minPaceSecPerKm: paceFromMinMile(11, 0),
    maxPaceSecPerKm: paceFromMinMile(20, 0),
  },
];

export const DEFAULT_MAP_OPTIONS = [
  { id: 'north-first', label: 'Heart to Start 5K - north first', url: '/default-north-first.gpx' },
  { id: 'south-first', label: 'Heart to Start 5K - south first', url: '/default-south-first.gpx' },
  { id: '10k-north-first', label: 'Heart to Start 10K - North First', url: '/default-10k-north-first.gpx' },
  { id: '10k-south-first', label: 'Heart to Start 10K - South First', url: '/default-10k-south-first.gpx' },
] as const;

export type CoursePreset = {
  id: string;
  selectedDefaultMapUrl: string;
  waves: Wave[];
};

export function cloneDefaultWaves(): Wave[] {
  return DEFAULT_WAVES.map((w) => ({ ...w }));
}

export function createDefaultCoursePresets(): CoursePreset[] {
  const baseWave = DEFAULT_WAVES[0];
  return [
    {
      id: 'course-1',
      selectedDefaultMapUrl: DEFAULT_MAP_OPTIONS[0].url,
      waves: cloneDefaultWaves(),
    },
    {
      id: 'course-2',
      selectedDefaultMapUrl: '/default-10k-north-first.gpx',
      waves: [
        {
          id: 'wave-1',
          startTimeSeconds: 0,
          runnerCount: 450,
          minPaceSecPerKm: baseWave.minPaceSecPerKm,
          maxPaceSecPerKm: baseWave.maxPaceSecPerKm,
        },
      ],
    },
  ];
}
