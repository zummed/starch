// ─── Object Types ───────────────────────────────────────────────

export type ObjectType = 'box' | 'circle' | 'label' | 'table' | 'line' | 'path' | 'group';

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
  depth?: number;        // explicit render order (higher = on top); auto-computed from group nesting
  visible?: boolean;     // default true; when false, only shown in debug mode
  follow?: string;       // ID of a line or path to follow
  pathProgress?: number; // 0–1 position along the followed path
}
