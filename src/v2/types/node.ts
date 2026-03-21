import type { HslColor, Stroke, Transform, Dash, Layout, LayoutHint, Size } from './properties';

export interface RectGeom {
  w: number;
  h: number;
  radius?: number;
}

export interface EllipseGeom {
  rx: number;
  ry: number;
}

export interface TextGeom {
  content: string;
  size: number;
  lineHeight?: number;
  align?: 'start' | 'middle' | 'end';
  bold?: boolean;
  mono?: boolean;
}

export type PointRef = string | [number, number] | [string, number, number];

export interface PathGeom {
  points?: [number, number][];
  from?: PointRef;
  to?: PointRef;
  fromAnchor?: string | [number, number];
  toAnchor?: string | [number, number];
  closed?: boolean;
  smooth?: boolean;
  bend?: number;
  route?: [number, number][];
  radius?: number;
  drawProgress?: number;
}

export interface ImageGeom {
  src: string;
  fit?: 'contain' | 'cover' | 'fill';
  padding?: number;
  w: number;
  h: number;
}

export interface Node {
  id: string;
  children: Node[];
  visible: boolean;

  // Geometry (at most one)
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;

  // Visual properties (inheritable)
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;

  // Transform (composable)
  transform?: Transform;

  // Non-inheritable
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;

  // Styling
  style?: string;

  // Camera (special node)
  camera?: {
    target?: PointRef;
    zoom?: number;
    fit?: string[];
  };

  // Internal tracking
  _ownKeys?: Set<string>;
  _styleKeys?: Set<string>;
}

export interface NodeInput {
  id: string;
  children?: Node[];
  visible?: boolean;
  rect?: RectGeom;
  ellipse?: EllipseGeom;
  text?: TextGeom;
  path?: PathGeom;
  image?: ImageGeom;
  fill?: HslColor;
  stroke?: Stroke;
  opacity?: number;
  transform?: Transform;
  depth?: number;
  dash?: Dash;
  size?: Size;
  layout?: Layout;
  layoutHint?: LayoutHint;
  style?: string;
  camera?: { target?: PointRef; zoom?: number; fit?: string[] };
}

export function createNode(input: NodeInput): Node {
  return {
    ...input,
    children: input.children ?? [],
    visible: input.visible ?? true,
    _ownKeys: new Set(Object.keys(input).filter(k => k !== 'id' && k !== 'children')),
  };
}
