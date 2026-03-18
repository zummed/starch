// ─── Object Types ───────────────────────────────────────────────

export type ObjectType = 'box' | 'circle' | 'label' | 'table' | 'line' | 'path' | 'camera' | 'textblock' | 'point';

// Named anchor presets (cardinal + ordinal + legacy names)
export type NamedAnchor =
  | 'center'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'topleft' | 'topright' | 'bottomleft' | 'bottomright'
  | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

// Float-based anchor: x and y in [0, 1] where (0,0) = top-left, (1,1) = bottom-right
export interface FloatAnchor {
  x: number; // 0–1
  y: number; // 0–1
}

export type AnchorPoint = NamedAnchor | FloatAnchor;

// ─── Layout Types ───────────────────────────────────────────────

export type LayoutDirection = 'row' | 'column';
export type LayoutJustify = 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';

// ─── Base Props ─────────────────────────────────────────────────

export interface BaseProps {
  x: number;
  y: number;
  opacity?: number;    // 0–1, default 1
  scale?: number;      // default 1
  anchor?: AnchorPoint; // default 'center'
  colour?: string;     // shortcut → fill (duller) + stroke
  fill?: string;
  stroke?: string;
  text?: string;
  textColor?: string;
  textSize?: number;
  textOffset?: [number, number]; // [dx, dy] pixel offset for text
  depth?: number;        // explicit render order (higher = on top)
  visible?: boolean;     // default true
  follow?: string;       // ID of a line or path to follow
  pathProgress?: number; // 0–1 position along the followed path
  rotation?: number;     // degrees, default 0

  // ─── Flex container properties ──────────────────
  direction?: LayoutDirection;
  gap?: number;
  justify?: LayoutJustify;
  align?: LayoutAlign;
  wrap?: boolean;
  padding?: number;

  // ─── Flex child properties ──────────────────────
  group?: string;        // ID of the container this object belongs to
  order?: number;        // sort order within container (definition order breaks ties)
  grow?: number;         // proportion of extra space to absorb
  shrink?: number;       // proportion of overflow to absorb
  alignSelf?: LayoutAlign; // per-item cross-axis override

  // ─── Cascade control ────────────────────────────
  cascadeOpacity?: boolean;  // default true
  cascadeScale?: boolean;    // default true
  cascadeRotation?: boolean; // default true
}
