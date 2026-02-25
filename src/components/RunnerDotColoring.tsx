type RunnerDotColoringProps = {
  densityRadiusMeters: number;
  maxDensityColorValue: number;
  onDensityRadiusChange: (radius: number) => void;
  onMaxDensityColorValueChange: (value: number) => void;
};

export default function RunnerDotColoring({
  densityRadiusMeters,
  maxDensityColorValue,
  onDensityRadiusChange,
  onMaxDensityColorValueChange,
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
