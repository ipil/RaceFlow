import type { Wave } from '../sim/sim';

type WaveEditorProps = {
  waves: Wave[];
  setWaves: (waves: Wave[]) => void;
};

function updateWaveField(
  waves: Wave[],
  waveId: string,
  key: keyof Omit<Wave, 'id'>,
  value: number,
): Wave[] {
  return waves.map((wave) => (wave.id === waveId ? { ...wave, [key]: value } : wave));
}

const KM_PER_MILE = 1.609344;
const MINUTE_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 4);
const SECOND_OPTIONS = Array.from({ length: 60 }, (_, i) => i);

function secPerKmToMinMile(secPerKm: number): { minutes: number; seconds: number } {
  const secPerMile = Math.max(60, Math.round(secPerKm * KM_PER_MILE));
  return {
    minutes: Math.floor(secPerMile / 60),
    seconds: secPerMile % 60,
  };
}

function minMileToSecPerKm(minutes: number, seconds: number): number {
  const clampedSeconds = Math.max(0, Math.min(59, seconds));
  const secPerMile = Math.max(60, minutes * 60 + clampedSeconds);
  return secPerMile / KM_PER_MILE;
}

export default function WaveEditor({ waves, setWaves }: WaveEditorProps) {
  const addWave = () => {
    const nextId = `wave-${waves.length + 1}`;
    setWaves([
      ...waves,
      {
        id: nextId,
        startTimeSeconds: waves.length * 120,
        runnerCount: 100,
        minPaceSecPerKm: 280,
        maxPaceSecPerKm: 420,
      },
    ]);
  };

  const removeWave = (waveId: string) => {
    setWaves(waves.filter((w) => w.id !== waveId));
  };

  return (
    <div className="panel">
      <h2>Wave Editor</h2>
      <div className="waves-list">
        {waves.map((wave) => {
          const minPace = secPerKmToMinMile(wave.minPaceSecPerKm);
          const maxPace = secPerKmToMinMile(wave.maxPaceSecPerKm);

          return (
            <div key={wave.id} className="wave-card">
              <strong>{wave.id}</strong>
            <div className="row">
              <label>Start (sec)</label>
              <input
                type="number"
                value={wave.startTimeSeconds}
                min={0}
                step={1}
                onChange={(e) =>
                  setWaves(updateWaveField(waves, wave.id, 'startTimeSeconds', Number(e.target.value)))
                }
              />
            </div>
            <div className="row">
              <label>Runner count</label>
              <input
                type="number"
                value={wave.runnerCount}
                min={0}
                step={1}
                onChange={(e) =>
                  setWaves(updateWaveField(waves, wave.id, 'runnerCount', Number(e.target.value)))
                }
              />
            </div>
            <div className="row">
              <label>Min pace (min/mile)</label>
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <select
                  aria-label={`${wave.id} min pace minutes`}
                  value={minPace.minutes}
                  onChange={(e) =>
                    setWaves(
                      updateWaveField(
                        waves,
                        wave.id,
                        'minPaceSecPerKm',
                        minMileToSecPerKm(Number(e.target.value), minPace.seconds),
                      ),
                    )
                  }
                >
                  {MINUTE_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${wave.id} min pace seconds`}
                  value={minPace.seconds}
                  onChange={(e) =>
                    setWaves(
                      updateWaveField(
                        waves,
                        wave.id,
                        'minPaceSecPerKm',
                        minMileToSecPerKm(minPace.minutes, Number(e.target.value)),
                      ),
                    )
                  }
                >
                  {SECOND_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {String(seconds).padStart(2, '0')} sec
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row">
              <label>Max pace (min/mile)</label>
              <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                <select
                  aria-label={`${wave.id} max pace minutes`}
                  value={maxPace.minutes}
                  onChange={(e) =>
                    setWaves(
                      updateWaveField(
                        waves,
                        wave.id,
                        'maxPaceSecPerKm',
                        minMileToSecPerKm(Number(e.target.value), maxPace.seconds),
                      ),
                    )
                  }
                >
                  {MINUTE_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${wave.id} max pace seconds`}
                  value={maxPace.seconds}
                  onChange={(e) =>
                    setWaves(
                      updateWaveField(
                        waves,
                        wave.id,
                        'maxPaceSecPerKm',
                        minMileToSecPerKm(maxPace.minutes, Number(e.target.value)),
                      ),
                    )
                  }
                >
                  {SECOND_OPTIONS.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {String(seconds).padStart(2, '0')} sec
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeWave(wave.id)}
              disabled={waves.length === 1}
            >
              Remove
            </button>
            </div>
          );
        })}
      </div>
      <div className="row">
        <button type="button" onClick={addWave}>
          Add wave
        </button>
      </div>
    </div>
  );
}
