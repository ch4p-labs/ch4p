import { BaseBoxShapeUtil } from 'tldraw';
import { type Ch4pShape, safeRender } from './base';
import type { StatusComponent } from '@ch4p/canvas';

type StatusShape = Ch4pShape<'ch4p-status'>;

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  idle: { bg: '#f8f9fa', fg: '#868e96', dot: '#adb5bd' },
  thinking: { bg: '#fff3bf', fg: '#e67700', dot: '#fcc419' },
  executing: { bg: '#d3f9d8', fg: '#2b8a3e', dot: '#51cf66' },
  complete: { bg: '#d0ebff', fg: '#1864ab', dot: '#339af0' },
  error: { bg: '#ffe0e0', fg: '#c92a2a', dot: '#fa5252' },
};

export class StatusShapeUtil extends BaseBoxShapeUtil<StatusShape> {
  static override type = 'ch4p-status' as const;

  override getDefaultProps(): StatusShape['props'] {
    return {
      w: 200,
      h: 60,
      component: { id: '', type: 'status', state: 'idle' },
    };
  }

  override component(shape: StatusShape) {
    const comp = shape.props.component as StatusComponent;
    const colors = STATUS_COLORS[comp.state] ?? STATUS_COLORS.idle!;
    return safeRender('status', shape.props.w, shape.props.h, () => (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: colors.bg,
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: '-apple-system, sans-serif',
          pointerEvents: 'all',
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: colors.dot,
            animation: comp.state === 'thinking' ? 'pulse 1.5s infinite' : undefined,
          }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.fg, textTransform: 'capitalize' }}>
            {comp.state}
          </div>
          {comp.message && (
            <div style={{ fontSize: 11, color: colors.fg, opacity: 0.8, marginTop: 2 }}>
              {comp.message}
            </div>
          )}
        </div>
      </div>
    ));
  }

  override indicator(shape: StatusShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
