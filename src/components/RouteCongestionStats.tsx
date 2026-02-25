type RouteCongestionStatsProps = {
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  onSegmentLengthChange: (value: number) => void;
  onHeatMetricChange: (value: 'average' | 'max') => void;
};

export default function RouteCongestionStats({
  segmentLengthMeters,
  heatMetric,
  onSegmentLengthChange,
  onHeatMetricChange,
}: RouteCongestionStatsProps) {
  return (
    <div className="panel">
      <h2>Route Congestion Stats</h2>
      <div className="row">
        <label htmlFor="segment-length">Segment length (m)</label>
        <input
          id="segment-length"
          type="number"
          min={1}
          max={100}
          step={1}
          value={segmentLengthMeters}
          onChange={(e) => onSegmentLengthChange(Number(e.target.value))}
        />
      </div>
      <div className="row">
        <label htmlFor="heat-metric">Route heat map metric</label>
        <select
          id="heat-metric"
          value={heatMetric}
          onChange={(e) => onHeatMetricChange(e.target.value as 'average' | 'max')}
        >
          <option value="average">Average density</option>
          <option value="max">Maximum density</option>
        </select>
      </div>
    </div>
  );
}
