import JSON5 from 'json5';
import type { Node } from '../types/node';
import type { AnimConfig } from '../types/animation';
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

export function parseScene(input: string): ParsedScene {
  registerBuiltinTemplates();

  const raw = JSON5.parse(input);

  const styles = raw.styles ?? {};
  const animate = raw.animate as AnimConfig | undefined;
  const background = raw.background as string | undefined;
  const viewport = raw.viewport;
  const images = raw.images as Record<string, string> | undefined;

  // Expand templates (if any objects use template syntax)
  const expanded = expandTemplates(raw.objects ?? []);

  // Merge styles
  const styled = Object.keys(styles).length > 0
    ? resolveStyles(expanded, styles)
    : expanded;

  // Validate
  validateTree(styled, styles);

  // Generate track paths
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
