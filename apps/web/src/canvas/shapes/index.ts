/**
 * Custom tldraw shape registrations for A2UI component types.
 *
 * Each A2UI component type (card, chart, form, etc.) gets a ShapeUtil
 * that knows how to render it inside the tldraw canvas.
 */

import { CardShapeUtil } from './CardShape';
import { CodeBlockShapeUtil } from './CodeBlockShape';
import { DataTableShapeUtil } from './DataTableShape';
import { FormShapeUtil } from './FormShape';
import { MarkdownShapeUtil } from './MarkdownShape';
import { ImageShapeUtil } from './ImageShape';
import { ChartShapeUtil } from './ChartShape';
import { StatusShapeUtil } from './StatusShape';
import { ProgressShapeUtil } from './ProgressShape';
import { ButtonShapeUtil } from './ButtonShape';
import { TextFieldShapeUtil } from './TextFieldShape';

/** All custom shape utils to register with tldraw. */
export const customShapeUtils = [
  CardShapeUtil,
  CodeBlockShapeUtil,
  DataTableShapeUtil,
  FormShapeUtil,
  MarkdownShapeUtil,
  ImageShapeUtil,
  ChartShapeUtil,
  StatusShapeUtil,
  ProgressShapeUtil,
  ButtonShapeUtil,
  TextFieldShapeUtil,
];
