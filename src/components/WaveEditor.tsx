import type { Wave } from '../sim/sim';

type WaveEditorProps = {
  waves: Wave[];
  setWaves: (waves: Wave[]) => void;
  onGenerateRunners: () => void;
};

function updateWaveField(
  waves: Wave[],
  waveId: string,
  key: keyof Omit<Wave, 'id'>,
  value: number,
): Wave[] {
  return waves.map((wave) => (wave.id === waveId ? { ...wave, [key]: value } : wave));
}

export default function WaveEditor({ waves, setWaves, onGenerateRunners }: WaveEditorProps) {
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
        {waves.map((wave) => (
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
              <label>Min pace (sec/km)</label>
              <input
                type="number"
                value={wave.minPaceSecPerKm}
                min={60}
                step={1}
                onChange={(e) =>
                  setWaves(updateWaveField(waves, wave.id, 'minPaceSecPerKm', Number(e.target.value)))
                }
              />
            </div>
            <div className="row">
              <label>Max pace (sec/km)</label>
              <input
                type="number"
                value={wave.maxPaceSecPerKm}
                min={60}
                step={1}
                onChange={(e) =>
                  setWaves(updateWaveField(waves, wave.id, 'maxPaceSecPerKm', Number(e.target.value)))
                }
              />
            </div>
            <button
              type="button"
              onClick={() => removeWave(wave.id)}
              disabled={waves.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" onClick={addWave}>
          Add wave
        </button>
        <button type="button" onClick={onGenerateRunners}>
          Generate runners
        </button>
      </div>
    </div>
  );
}
