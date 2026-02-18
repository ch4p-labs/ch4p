import { BaseBoxShapeUtil } from 'tldraw';
import { type Ch4pShape, safeRender } from './base';
import type { CardComponent } from '@ch4p/canvas';
import { interactionHandlers } from '../CanvasEditor';

type CardShape = Ch4pShape<'ch4p-card'>;

export class CardShapeUtil extends BaseBoxShapeUtil<CardShape> {
  static override type = 'ch4p-card' as const;

  override getDefaultProps(): CardShape['props'] {
    return {
      w: 320,
      h: 220,
      component: { id: '', type: 'card', title: '', body: '' },
    };
  }

  override component(shape: CardShape) {
    const comp = shape.props.component as CardComponent;
    const actions = Array.isArray(comp.actions) ? comp.actions : [];
    return safeRender('card', shape.props.w, shape.props.h, () => (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, sans-serif',
          pointerEvents: 'all',
        }}
      >
        {comp.imageUrl && (
          <img
            src={comp.imageUrl}
            alt=""
            style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }}
          />
        )}
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, color: '#1a1a2e' }}>
          {comp.title}
        </div>
        <div style={{ fontSize: 13, color: '#555', flex: 1, overflow: 'auto', lineHeight: 1.5 }}>
          {comp.body}
        </div>
        {actions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {actions.map((action) => (
              <button
                key={action.id}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  background: '#f5f5f5',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => interactionHandlers.onClick(comp.id, action.id)}
              >
                {action.text}
              </button>
            ))}
          </div>
        )}
      </div>
    ));
  }

  override indicator(shape: CardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
  }
}
