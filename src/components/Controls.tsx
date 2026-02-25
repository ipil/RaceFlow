import { useMemo } from 'react';

type ControlsProps = {
  simTime: number;
  maxTime: number;
  playing: boolean;
  speed: number;
  densityRadiusMeters: number;
  maxDensityColorValue: number;
  onPlayPause: () => void;
  onReset: () => void;
  onTimeChange: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onDensityRadiusChange: (radius: number) => void;
  onMaxDensityColorValueChange: (value: number) => void;
};

const SPEEDS = [10, 15, 20, 30, 50, 100];

function formatTime(tSec: number): string {
  const total = Math.max(0, Math.floor(tSec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Controls({
  simTime,
  maxTime,
  playing,
  speed,
  densityRadiusMeters,
  maxDensityColorValue,
  onPlayPause,
  onReset,
  onTimeChange,
  onSpeedChange,
  onDensityRadiusChange,
  onMaxDensityColorValueChange,
}: ControlsProps) {
  const timeLabel = useMemo(() => formatTime(simTime), [simTime]);

  return (
    <div className="panel">
      <h2>Simulation Controls</h2>
      <div className="row">
        <button type="button" onClick={onPlayPause}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="row controls-time">
        <label>Current time: {timeLabel}</label>
      </div>
      <div className="row">
        <label htmlFor="sim-time-range">Time</label>
        <input
          id="sim-time-range"
          type="range"
          min={0}
          max={Math.max(1, maxTime)}
          step={0.1}
          value={Math.min(simTime, Math.max(1, maxTime))}
          onChange={(e) => onTimeChange(Number(e.target.value))}
        />
      </div>
      <div className="row">
        <label htmlFor="sim-speed">Simulation Speed</label>
        <select
          id="sim-speed"
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="density-radius">Density radius (m)</label>
        <input
          id="density-radius"
          type="number"
          min={2}
          max={20}
          step={1}
          value={densityRadiusMeters}
          onChange={(e) => onDensityRadiusChange(Number(e.target.value))}
        />
      </div>
      <div className="row">
        <label htmlFor="max-density-color">Max density (number of runners)</label>
        <input
          id="max-density-color"
          type="number"
          min={1}
          max={200}
          step={1}
          value={maxDensityColorValue}
          onChange={(e) => onMaxDensityColorValueChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
