import { BaseBoxShapeUtil } from 'tldraw';
import { type Ch4pShape, safeRender } from './base';
import type { MarkdownComponent } from '@ch4p/canvas';

type MarkdownShape = Ch4pShape<'ch4p-markdown'>;

export class MarkdownShapeUtil extends BaseBoxShapeUtil<MarkdownShape> {
  static override type = 'ch4p-markdown' as const;

  override getDefaultProps(): MarkdownShape['props'] {
    return {
      w: 350,
      h: 200,
      component: { id: '', type: 'markdown', content: '' },
    };
  }

  override component(shape: MarkdownShape) {
    const comp = shape.props.component as MarkdownComponent;
    return safeRender('markdown', shape.props.w, shape.props.h, () => (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          padding: 16,
          overflow: 'auto',
          fontFamily: '-apple-system, sans-serif',
          fontSize: 14,
          lineHeight: 1.6,
          color: '#333',
          pointerEvents: 'all',
          whiteSpace: 'pre-wrap',
        }}
      >
        {comp.content}
      </div>
    ));
  }

  override indicator(shape: MarkdownShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
