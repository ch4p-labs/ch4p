import { useRef, useCallback } from 'react';
import { BaseBoxShapeUtil } from 'tldraw';
import { type Ch4pShape, safeRender } from './base';
import type { FormComponent } from '@ch4p/canvas';
import { interactionHandlers } from '../CanvasEditor';

type FormShape = Ch4pShape<'ch4p-form'>;

export class FormShapeUtil extends BaseBoxShapeUtil<FormShape> {
  static override type = 'ch4p-form' as const;

  override getDefaultProps(): FormShape['props'] {
    return {
      w: 340,
      h: 280,
      component: { id: '', type: 'form', fields: [] },
    };
  }

  override component(shape: FormShape) {
    const comp = shape.props.component as FormComponent;
    const formRef = useRef<HTMLFormElement>(null);

    const fields = Array.isArray(comp.fields) ? comp.fields : [];

    const handleSubmit = useCallback(() => {
      const form = formRef.current;
      if (!form) return;
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        const el = form.elements.namedItem(field.name);
        if (el instanceof HTMLInputElement) {
          values[field.name] = el.type === 'checkbox' ? el.checked : el.value;
        } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          values[field.name] = el.value;
        }
      }
      interactionHandlers.onFormSubmit(comp.id, values);
    }, [comp.id, comp.fields]);

    return safeRender('form', shape.props.w, shape.props.h, () => (
      <form
        ref={formRef}
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'auto',
          fontFamily: '-apple-system, sans-serif',
          pointerEvents: 'all',
        }}
      >
        {comp.title && (
          <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a2e', marginBottom: 4 }}>
            {comp.title}
          </div>
        )}
        {fields.map((field) => (
          <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>
              {field.label}
              {field.required && <span style={{ color: '#e53e3e' }}> *</span>}
            </label>
            {field.fieldType === 'textarea' ? (
              <textarea
                name={field.name}
                placeholder={field.placeholder}
                defaultValue={field.defaultValue}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontSize: 13,
                  resize: 'vertical',
                  minHeight: 50,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : field.fieldType === 'select' ? (
              <select
                name={field.name}
                defaultValue={field.defaultValue}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontSize: 13,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.fieldType === 'checkbox' ? (
              <input
                name={field.name}
                type="checkbox"
                defaultChecked={field.defaultValue === 'true'}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              <input
                name={field.name}
                type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                placeholder={field.placeholder}
                defaultValue={field.defaultValue}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                  fontSize: 13,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: '#4263eb',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            marginTop: 4,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {comp.submitLabel ?? 'Submit'}
        </button>
      </form>
    ));
  }

  override indicator(shape: FormShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
