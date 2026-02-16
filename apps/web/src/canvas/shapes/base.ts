/**
 * Shared base utilities for A2UI custom shapes.
 */

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

/** Re-export for convenience. */
export { BaseBoxShapeUtil };
