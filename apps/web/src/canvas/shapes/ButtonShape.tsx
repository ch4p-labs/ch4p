import { BaseBoxShapeUtil } from 'tldraw';
import { type Ch4pShape, safeRender } from './base';
import type { ButtonComponent } from '@ch4p/canvas';
import { interactionHandlers } from '../CanvasEditor';

type ButtonShape = Ch4pShape<'ch4p-button'>;

const VARIANT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  primary: { bg: '#4263eb', color: '#fff', border: 'none' },
  secondary: { bg: '#f8f9fa', color: '#495057', border: '1px solid #dee2e6' },
  danger: { bg: '#fa5252', color: '#fff', border: 'none' },
};

export class ButtonShapeUtil extends BaseBoxShapeUtil<ButtonShape> {
  static override type = 'ch4p-button' as const;

  override getDefaultProps(): ButtonShape['props'] {
    return {
      w: 140,
      h: 44,
      component: { id: '', type: 'button', text: 'Button' },
    };
  }

  override component(shape: ButtonShape) {
    const comp = shape.props.component as ButtonComponent;
    const styles = VARIANT_STYLES[comp.variant ?? 'primary'] ?? VARIANT_STYLES.primary!;

    return safeRender('button', shape.props.w, shape.props.h, () => (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'all',
        }}
      >
        <button
          disabled={comp.disabled}
          style={{
            width: '100%',
            height: '100%',
            background: comp.disabled ? '#e9ecef' : styles.bg,
            color: comp.disabled ? '#adb5bd' : styles.color,
            border: styles.border,
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: comp.disabled ? 'not-allowed' : 'pointer',
            fontFamily: '-apple-system, sans-serif',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => interactionHandlers.onClick(comp.id, comp.actionId)}
        >
          {comp.text}
        </button>
      </div>
    ));
  }

  override indicator(shape: ButtonShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
