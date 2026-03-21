import JSON5 from 'json5';
import type { Node } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { parseColor } from '../types/color';
import type { HslColor } from '../types/properties';
import { expandTemplates } from '../templates/registry';
import { resolveStyles } from '../tree/resolve';
import { validateTree } from '../tree/validate';
import { generateTrackPaths } from '../tree/walker';
import { registerBuiltinTemplates } from '../templates/index';

export interface ParsedScene {
  nodes: Node[];
  styles: Record<string, any>;
  animate?: AnimConfig;
  background?: string;
  viewport?: string | { width: number; height: number };
  images?: Record<string, string>;
  trackPaths: string[];
}

function resolveColorValues(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(resolveColorValues);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if ((key === 'fill' || key === 'stroke' || key === 'color' || key === 'colour') && typeof value === 'string') {
      try {
        result[key] = parseColor(value);
      } catch {
        result[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      result[key] = resolveColorValues(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveColorStringsInStyles(styles: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, def] of Object.entries(styles)) {
    result[name] = resolveColorValues(def);
  }
  return result;
}

export function parseScene(input: string): ParsedScene {
  // Ensure builtins are registered
  registerBuiltinTemplates();

  const raw = JSON5.parse(input);

  // 1. Extract top-level properties
  const styles = resolveColorStringsInStyles(raw.styles ?? {});
  const animate = raw.animate as AnimConfig | undefined;
  const background = raw.background as string | undefined;
  const viewport = raw.viewport;
  const images = raw.images as Record<string, string> | undefined;

  // 2. Resolve color strings in objects
  const rawObjects = resolveColorValues(raw.objects ?? []);

  // 3. Expand templates
  const expanded = expandTemplates(rawObjects);

  // 4. Merge styles
  const styled = Object.keys(styles).length > 0
    ? resolveStyles(expanded, styles)
    : expanded;

  // 5. Validate
  validateTree(styled, styles);

  // 6. Generate track paths
  const trackPaths = generateTrackPaths(styled);

  return {
    nodes: styled,
    styles,
    animate,
    background,
    viewport,
    images,
    trackPaths,
  };
}
