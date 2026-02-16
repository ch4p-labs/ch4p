import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { ProgressComponent } from '@ch4p/canvas';

type ProgressShape = Ch4pShape<'ch4p-progress'>;

export class ProgressShapeUtil extends BaseBoxShapeUtil<ProgressShape> {
  static override type = 'ch4p-progress' as const;

  override getDefaultProps(): ProgressShape['props'] {
    return {
      w: 260,
      h: 60,
      component: { id: '', type: 'progress', value: 0 },
    };
  }

  override component(shape: ProgressShape) {
    const comp = shape.props.component as ProgressComponent;
    const max = comp.max ?? 100;
    const pct = Math.min(100, Math.max(0, (comp.value / max) * 100));

    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 6,
          fontFamily: '-apple-system, sans-serif',
          pointerEvents: 'all',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
          <span>{comp.status ?? 'Progress'}</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div style={{ height: 6, background: '#e9ecef', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: pct >= 100 ? '#37b24d' : '#4263eb',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>
    );
  }

  override indicator(shape: ProgressShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
