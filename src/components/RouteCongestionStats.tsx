import CollapsiblePanel from './CollapsiblePanel';

type RouteCongestionStatsProps = {
  segmentLengthMeters: number;
  heatMetric: 'average' | 'max';
  averageRedThreshold: number;
  maxRedThreshold: number;
  onSegmentLengthChange: (value: number) => void;
  onHeatMetricChange: (value: 'average' | 'max') => void;
  onAverageRedThresholdChange: (value: number) => void;
  onMaxRedThresholdChange: (value: number) => void;
};

export default function RouteCongestionStats({
  segmentLengthMeters,
  heatMetric,
  averageRedThreshold,
  maxRedThreshold,
  onSegmentLengthChange,
  onHeatMetricChange,
  onAverageRedThresholdChange,
  onMaxRedThresholdChange,
}: RouteCongestionStatsProps) {
  return (
    <CollapsiblePanel title="Route-Centric Density Parameters">
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
          <label htmlFor="avg-red-threshold">
            Threshold segment density (runners/m): {averageRedThreshold}
          </label>
          <input
            id="avg-red-threshold"
            type="range"
            min={0}
            max={10}
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
            max={10}
            step={0.25}
            value={maxRedThreshold}
            onChange={(e) => onMaxRedThresholdChange(Number(e.target.value))}
          />
        </div>
      )}
    </CollapsiblePanel>
  );
}
