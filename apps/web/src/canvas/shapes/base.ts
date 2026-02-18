/**
 * Shared base utilities for A2UI custom shapes.
 */

import { createElement, type ReactElement } from 'react';
import { BaseBoxShapeUtil, type TLBaseShape } from 'tldraw';
import type { A2UIComponent } from '@ch4p/canvas';

/** Base props shape for all ch4p shapes. */
export interface Ch4pShapeProps {
  w: number;
  h: number;
  component: A2UIComponent;
}

/** Type alias for a ch4p tldraw shape. */
export type Ch4pShape<T extends string> = TLBaseShape<T, Ch4pShapeProps>;

/**
 * Wraps a shape render function in a try-catch so that individual shapes
 * degrade to an error placeholder instead of crashing tldraw entirely.
 */
export function safeRender(
  shapeType: string,
  w: number,
  h: number,
  renderFn: () => ReactElement,
): ReactElement {
  try {
    return renderFn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${shapeType}] Render error:`, err);
    return createElement('div', {
      style: {
        width: w,
        height: h,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f8f8',
        borderRadius: 8,
        border: '1px dashed #ccc',
        color: '#999',
        fontSize: 12,
        fontFamily: '-apple-system, sans-serif',
        padding: 12,
        textAlign: 'center' as const,
      },
    }, `${shapeType}: ${msg}`);
  }
}

/** Re-export for convenience. */
export { BaseBoxShapeUtil };
