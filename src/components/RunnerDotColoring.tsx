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
    <div className="panel">
      <h2>Runner dot coloring</h2>
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
    </div>
  );
}
