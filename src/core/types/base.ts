// ─── Object Types ───────────────────────────────────────────────

export type ObjectType = 'box' | 'circle' | 'text' | 'table' | 'line' | 'path' | 'group';

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
}
