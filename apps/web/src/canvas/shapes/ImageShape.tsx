import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { ImageComponent } from '@ch4p/canvas';

type ImageShape = Ch4pShape<'ch4p-image'>;

export class ImageShapeUtil extends BaseBoxShapeUtil<ImageShape> {
  static override type = 'ch4p-image' as const;

  override getDefaultProps(): ImageShape['props'] {
    return {
      w: 300,
      h: 200,
      component: { id: '', type: 'image', src: '' },
    };
  }

  override component(shape: ImageShape) {
    const comp = shape.props.component as ImageComponent;
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          background: '#f0f0f0',
          pointerEvents: 'all',
        }}
      >
        {comp.src ? (
          <img
            src={comp.src}
            alt={comp.alt ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#888',
              fontSize: 14,
            }}
          >
            No image
          </div>
        )}
      </div>
    );
  }

  override indicator(shape: ImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
