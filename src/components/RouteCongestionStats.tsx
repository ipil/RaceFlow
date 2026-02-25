type RouteCongestionStatsProps = {
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  showRouteHeatmap: boolean;
  averageRedThreshold: number;
  maxRedThreshold: number;
  onSegmentLengthChange: (value: number) => void;
  onHeatMetricChange: (value: 'average' | 'max') => void;
  onShowRouteHeatmapChange: (value: boolean) => void;
  onAverageRedThresholdChange: (value: number) => void;
  onMaxRedThresholdChange: (value: number) => void;
};

export default function RouteCongestionStats({
  segmentLengthMeters,
  heatMetric,
  showRouteHeatmap,
  averageRedThreshold,
  maxRedThreshold,
  onSegmentLengthChange,
  onHeatMetricChange,
  onShowRouteHeatmapChange,
  onAverageRedThresholdChange,
  onMaxRedThresholdChange,
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
      <div className="row">
        <label htmlFor="avg-red-threshold">Average density red value</label>
        <input
          id="avg-red-threshold"
          type="number"
          min={1}
          max={500}
          step={1}
          value={averageRedThreshold}
          onChange={(e) => onAverageRedThresholdChange(Number(e.target.value))}
        />
      </div>
      <div className="row">
        <label htmlFor="max-red-threshold">Maximum density red value</label>
        <input
          id="max-red-threshold"
          type="number"
          min={1}
          max={500}
          step={1}
          value={maxRedThreshold}
          onChange={(e) => onMaxRedThresholdChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
