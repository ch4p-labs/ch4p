import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { ChartComponent } from '@ch4p/canvas';

type ChartShape = Ch4pShape<'ch4p-chart'>;

/** Simple SVG-based bar chart renderer. */
function SimpleBarChart({ comp, w, h }: { comp: ChartComponent; w: number; h: number }) {
  // Defensive: bail gracefully if data is missing or malformed.
  if (!comp.data?.datasets || !comp.data?.labels) {
    return (
      <div style={{ padding: 16, color: '#999', fontSize: 13 }}>
        Chart: missing data
      </div>
    );
  }

  const padding = { top: 30, right: 20, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const allValues = comp.data.datasets.flatMap((ds) => ds.values);
  const maxVal = Math.max(...allValues, 1);
  const barCount = comp.data.labels.length;
  const groupWidth = chartW / Math.max(barCount, 1);
  const barWidth = (groupWidth * 0.7) / Math.max(comp.data.datasets.length, 1);

  const colors = ['#4263eb', '#f76707', '#37b24d', '#ae3ec9', '#f03e3e'];

  return (
    <svg width={w} height={h} style={{ fontFamily: '-apple-system, sans-serif' }}>
      {comp.title && (
        <text x={w / 2} y={18} textAnchor="middle" fontSize={13} fontWeight={600} fill="#333">
          {comp.title}
        </text>
      )}
      {/* Y-axis line */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartH} stroke="#ddd" />
      {/* X-axis line */}
      <line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke="#ddd" />

      {/* Bars */}
      {comp.data.datasets.map((ds, dsIdx) =>
        ds.values.map((val, i) => {
          const barH = (val / maxVal) * chartH;
          const x = padding.left + i * groupWidth + dsIdx * barWidth + (groupWidth - barWidth * comp.data.datasets.length) / 2;
          const y = padding.top + chartH - barH;
          return (
            <rect
              key={`${dsIdx}-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              fill={ds.color ?? colors[dsIdx % colors.length]}
              rx={2}
              opacity={0.85}
            />
          );
        }),
      )}

      {/* X-axis labels */}
      {comp.data.labels.map((label, i) => (
        <text
          key={i}
          x={padding.left + i * groupWidth + groupWidth / 2}
          y={padding.top + chartH + 20}
          textAnchor="middle"
          fontSize={10}
          fill="#666"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export class ChartShapeUtil extends BaseBoxShapeUtil<ChartShape> {
  static override type = 'ch4p-chart' as const;

  override getDefaultProps(): ChartShape['props'] {
    return {
      w: 400,
      h: 280,
      component: { id: '', type: 'chart', chartType: 'bar', data: { labels: [], datasets: [] } },
    };
  }

  override component(shape: ChartShape) {
    const comp = shape.props.component as ChartComponent;
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          pointerEvents: 'all',
        }}
      >
        <SimpleBarChart comp={comp} w={shape.props.w} h={shape.props.h} />
      </div>
    );
  }

  override indicator(shape: ChartShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
