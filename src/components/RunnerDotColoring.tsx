import CollapsiblePanel from './CollapsiblePanel';

type RunnerDotColoringProps = {
  densityRadiusMeters: number;
  thresholdRunnerDensity: number;
  onDensityRadiusChange: (radius: number) => void;
  onThresholdRunnerDensityChange: (value: number) => void;
};

export default function RunnerDotColoring({
  densityRadiusMeters,
  thresholdRunnerDensity,
  onDensityRadiusChange,
  onThresholdRunnerDensityChange,
}: RunnerDotColoringProps) {
  return (
    <CollapsiblePanel title="Runner-Centric Density Parameters">
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
      <div className="microcopy">How far each runner &quot;looks&quot; to count neighbors.</div>
      <div className="row">
        <label htmlFor="threshold-runner-density">
          Threshold runner density (runners/m): {thresholdRunnerDensity}
        </label>
        <input
          id="threshold-runner-density"
          type="range"
          min={0}
          max={10}
          step={1}
          value={thresholdRunnerDensity}
          onChange={(e) => onThresholdRunnerDensityChange(Number(e.target.value))}
        />
      </div>
      <div className="microcopy">Density at which dots become fully red.</div>
    </CollapsiblePanel>
  );
}
