type RouteCongestionStatsProps = {
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  showRouteHeatmap: boolean;
  onSegmentLengthChange: (value: number) => void;
  onHeatMetricChange: (value: 'average' | 'max') => void;
  onShowRouteHeatmapChange: (value: boolean) => void;
};

export default function RouteCongestionStats({
  segmentLengthMeters,
  heatMetric,
  showRouteHeatmap,
  onSegmentLengthChange,
  onHeatMetricChange,
  onShowRouteHeatmapChange,
}: RouteCongestionStatsProps) {
  return (
    <div className="panel">
      <h2>Route Congestion Stats</h2>
      <div className="row">
        <label htmlFor="show-route-heatmap">Show route segment heat map</label>
        <input
          id="show-route-heatmap"
          type="checkbox"
          checked={showRouteHeatmap}
          onChange={(e) => onShowRouteHeatmapChange(e.target.checked)}
        />
      </div>
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
