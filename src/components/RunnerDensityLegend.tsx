export default function RunnerDensityLegend() {
  return (
    <div className="runner-legend" aria-hidden="true">
      <div className="runner-legend-header">
        <span>Runner dot density</span>
        <button
          type="button"
          className="runner-legend-info"
          title="Dot color shows local runner density from lower (green-ish) to higher (red)."
          aria-label="Runner density legend info"
        >
          i
        </button>
      </div>
      <div className="runner-legend-bar" />
      <div className="runner-legend-labels">
        <span>Low density</span>
        <span>High density</span>
      </div>
    </div>
  );
}
