type RouteCongestionStatsProps = {
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  averageMode: 'active_avg' | 'p90' | 'top30' | 'window';
  showRouteHeatmap: boolean;
  averageRedThreshold: number;
  maxRedThreshold: number;
  onSegmentLengthChange: (value: number) => void;
  onHeatMetricChange: (value: 'average' | 'max') => void;
  onAverageModeChange: (value: 'active_avg' | 'p90' | 'top30' | 'window') => void;
  onShowRouteHeatmapChange: (value: boolean) => void;
  onAverageRedThresholdChange: (value: number) => void;
  onMaxRedThresholdChange: (value: number) => void;
};

export default function RouteCongestionStats({
  segmentLengthMeters,
  heatMetric,
  averageMode,
  showRouteHeatmap,
  averageRedThreshold,
  maxRedThreshold,
  onSegmentLengthChange,
  onHeatMetricChange,
  onAverageModeChange,
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
        <label>Route heat map metric</label>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="heat-metric"
              checked={heatMetric === 'average'}
              onChange={() => onHeatMetricChange('average')}
            />
            Average density
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="radio"
              name="heat-metric"
              checked={heatMetric === 'max'}
              onChange={() => onHeatMetricChange('max')}
            />
            Maximum density
          </label>
        </div>
      </div>
      {heatMetric === 'average' && (
        <div className="row">
          <label htmlFor="average-mode">Average density mode</label>
          <select
            id="average-mode"
            value={averageMode}
            onChange={(e) =>
              onAverageModeChange(e.target.value as 'active_avg' | 'p90' | 'top30' | 'window')
            }
          >
            <option value="active_avg">Active-time average</option>
            <option value="p90">90th percentile (non-zero)</option>
            <option value="top30">Top 30% mean (non-zero)</option>
            <option value="window">Rolling window average</option>
          </select>
        </div>
      )}
      {heatMetric === 'average' && (
        <div className="row">
          <label htmlFor="avg-red-threshold">
            Threshold segment density (runners/m): {averageRedThreshold}
          </label>
          <input
            id="avg-red-threshold"
            type="range"
            min={0}
            max={20}
            step={0.25}
            value={averageRedThreshold}
            onChange={(e) => onAverageRedThresholdChange(Number(e.target.value))}
          />
        </div>
      )}
      {heatMetric === 'max' && (
        <div className="row">
          <label htmlFor="max-red-threshold">
            Threshold segment density (runners/m): {maxRedThreshold}
          </label>
          <input
            id="max-red-threshold"
            type="range"
            min={0}
            max={20}
            step={0.25}
            value={maxRedThreshold}
            onChange={(e) => onMaxRedThresholdChange(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  );
}
