import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { CodeBlockComponent } from '@ch4p/canvas';

type CodeBlockShape = Ch4pShape<'ch4p-code_block'>;

export class CodeBlockShapeUtil extends BaseBoxShapeUtil<CodeBlockShape> {
  static override type = 'ch4p-code_block' as const;

  override getDefaultProps(): CodeBlockShape['props'] {
    return {
      w: 400,
      h: 250,
      component: { id: '', type: 'code_block', code: '' },
    };
  }

  override component(shape: CodeBlockShape) {
    const comp = shape.props.component as CodeBlockComponent;
    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#1e1e2e',
          borderRadius: 10,
          overflow: 'hidden',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'all',
        }}
      >
        <div
          style={{
            padding: '8px 14px',
            background: '#2d2d44',
            fontSize: 11,
            color: '#8888aa',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{comp.title ?? 'Code'}</span>
          <span>{comp.language ?? ''}</span>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.5,
            color: '#cdd6f4',
            overflow: 'auto',
            flex: 1,
          }}
        >
          <code>{comp.code}</code>
        </pre>
      </div>
    );
  }

  override indicator(shape: CodeBlockShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
