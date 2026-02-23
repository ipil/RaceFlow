export type Wave = {
  id: string;
  startTimeSeconds: number;
  runnerCount: number;
  minPaceSecPerKm: number;
  maxPaceSecPerKm: number;
};

export type Runner = {
  id: string;
  waveId: string;
  startTimeSeconds: number;
  paceSecPerKm: number;
};

export function generateRunners(waves: Wave[]): Runner[] {
  const totalCount = waves.reduce((sum, wave) => sum + Math.max(0, wave.runnerCount), 0);
  const runners = new Array<Runner>(totalCount);
  let index = 0;

  for (const wave of waves) {
    const minPace = Math.min(wave.minPaceSecPerKm, wave.maxPaceSecPerKm);
    const maxPace = Math.max(wave.minPaceSecPerKm, wave.maxPaceSecPerKm);
    const span = maxPace - minPace;

    for (let i = 0; i < wave.runnerCount; i += 1) {
      const pace = minPace + Math.random() * span;
      runners[index] = {
        id: `${wave.id}-runner-${i + 1}`,
        waveId: wave.id,
        startTimeSeconds: wave.startTimeSeconds,
        paceSecPerKm: pace,
      };
      index += 1;
    }
  }

  return runners;
}

export function runnerDistanceMeters(
  runner: Runner,
  tSec: number,
  routeLenMeters: number,
): number {
  const elapsed = Math.max(0, tSec - runner.startTimeSeconds);
  const speedMps = 1000 / runner.paceSecPerKm;
  const d = elapsed * speedMps;
  if (d <= 0) return 0;
  if (d >= routeLenMeters) return routeLenMeters;
  return d;
}

export function densityBins(
  distances: number[],
  binSize = 10,
  smoothNeighborBins = true,
): number[] {
  if (distances.length === 0) return [];

  let maxDist = 0;
  for (let i = 0; i < distances.length; i += 1) {
    if (distances[i] > maxDist) maxDist = distances[i];
  }

  const binCount = Math.max(1, Math.floor(maxDist / binSize) + 1);
  const bins = new Uint16Array(binCount);
  const idxs = new Uint32Array(distances.length);

  for (let i = 0; i < distances.length; i += 1) {
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor(distances[i] / binSize)));
    idxs[i] = idx;
    bins[idx] += 1;
  }

  const out = new Array<number>(distances.length);
  if (!smoothNeighborBins) {
    for (let i = 0; i < distances.length; i += 1) {
      out[i] = bins[idxs[i]];
    }
    return out;
  }

  const smoothed = new Float32Array(binCount);
  for (let i = 0; i < binCount; i += 1) {
    const left = i > 0 ? bins[i - 1] : bins[i];
    const center = bins[i];
    const right = i < binCount - 1 ? bins[i + 1] : bins[i];
    smoothed[i] = (left + center + right) / 3;
  }

  for (let i = 0; i < distances.length; i += 1) {
    out[i] = smoothed[idxs[i]];
  }

  return out;
}
