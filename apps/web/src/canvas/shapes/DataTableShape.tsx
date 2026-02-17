import { BaseBoxShapeUtil } from 'tldraw';
import type { Ch4pShape } from './base';
import type { DataTableComponent } from '@ch4p/canvas';

type DataTableShape = Ch4pShape<'ch4p-data_table'>;

export class DataTableShapeUtil extends BaseBoxShapeUtil<DataTableShape> {
  static override type = 'ch4p-data_table' as const;

  override getDefaultProps(): DataTableShape['props'] {
    return {
      w: 500,
      h: 300,
      component: { id: '', type: 'data_table', columns: [], rows: [] },
    };
  }

  override component(shape: DataTableShape) {
    const comp = shape.props.component as DataTableComponent;
    const columns = Array.isArray(comp.columns) ? comp.columns : [];
    const rows = Array.isArray(comp.rows) ? comp.rows : [];

    if (columns.length === 0) {
      return (
        <div style={{ padding: 16, color: '#999', fontSize: 13, fontFamily: '-apple-system, sans-serif' }}>
          Table: no columns defined
        </div>
      );
    }

    return (
      <div
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, sans-serif',
          pointerEvents: 'all',
        }}
      >
        {comp.title && (
          <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 14, borderBottom: '1px solid #eee' }}>
            {comp.title}
          </div>
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: '#f8f9fa',
                      borderBottom: '2px solid #e9ecef',
                      fontWeight: 600,
                      color: '#495057',
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ padding: '6px 12px', color: '#333' }}>
                      {String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  override indicator(shape: DataTableShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
