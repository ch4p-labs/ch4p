import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { TextFieldComponent } from '@ch4p/canvas';

type TextFieldShape = Ch4pShape<'ch4p-text_field'>;

export class TextFieldShapeUtil extends BaseBoxShapeUtil<TextFieldShape> {
  static override type = 'ch4p-text_field' as const;

  override getDefaultProps(): TextFieldShape['props'] {
    return {
      w: 280,
      h: 48,
      component: { id: '', type: 'text_field' },
    };
  }

  override component(shape: TextFieldShape) {
    const comp = shape.props.component as TextFieldComponent;
    const isMultiline = comp.multiline;

    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: 'flex',
          alignItems: 'stretch',
          pointerEvents: 'all',
        }}
      >
        {isMultiline ? (
          <textarea
            placeholder={comp.placeholder}
            defaultValue={comp.value}
            style={{
              width: '100%',
              height: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #dee2e6',
              fontSize: 14,
              fontFamily: '-apple-system, sans-serif',
              resize: 'none',
              outline: 'none',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <input
            type="text"
            placeholder={comp.placeholder}
            defaultValue={comp.value}
            style={{
              width: '100%',
              height: '100%',
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #dee2e6',
              fontSize: 14,
              fontFamily: '-apple-system, sans-serif',
              outline: 'none',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
      </div>
    );
  }

  override indicator(shape: TextFieldShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
