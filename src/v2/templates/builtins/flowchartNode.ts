import type { Node } from '../../types/node';
import { createNode } from '../../types/node';
import { parseColor } from '../../types/color';
import type { HslColor } from '../../types/properties';

/**
 * Flowchart node: a Mermaid-style node with header bar, title, subtitle,
 * optional status indicator, and connection ports.
 */
export function flowchartNodeTemplate(id: string, props: Record<string, unknown>): Node {
  const w = (props.w as number) ?? 160;
  const h = (props.h as number) ?? 80;
  const title = (props.title as string) ?? '';
  const subtitle = (props.subtitle as string) ?? '';
  const headerHeight = 28;
  const radius = (props.radius as number) ?? 6;
  const status = props.status as string | undefined; // "success", "error", "warning", "active"

  let stroke: HslColor = { h: 210, s: 60, l: 50 };
  let headerFill: HslColor = { h: 210, s: 60, l: 35 };
  let bodyFill: HslColor = { h: 210, s: 20, l: 15 };

  if (props.colour || props.color) {
    const raw = (props.colour ?? props.color) as unknown;
    const hsl = typeof raw === 'string' ? parseColor(raw) : raw as HslColor;
    stroke = hsl;
    headerFill = { h: hsl.h, s: Math.round(hsl.s * 0.8), l: Math.round(hsl.l * 0.7) };
    bodyFill = { h: hsl.h, s: Math.round(hsl.s * 0.3), l: Math.round(hsl.l * 0.2) };
  }

  const statusColors: Record<string, HslColor> = {
    success: { h: 120, s: 70, l: 45 },
    error: { h: 0, s: 80, l: 50 },
    warning: { h: 40, s: 90, l: 50 },
    active: { h: 210, s: 80, l: 55 },
  };

  const children: Node[] = [
    // Body background
    createNode({
      id: `${id}.body`,
      rect: { w, h, radius },
      fill: bodyFill,
      stroke: { ...stroke, width: 2 },
    }),
    // Header bar
    createNode({
      id: `${id}.header`,
      rect: { w: w - 4, h: headerHeight, radius: Math.max(0, radius - 2) },
      fill: headerFill,
      transform: { x: w / 2, y: headerHeight / 2 + 2 },
    }),
    // Title text
    createNode({
      id: `${id}.title`,
      text: { content: title, size: 13, bold: true, align: 'middle' },
      fill: { h: 0, s: 0, l: 95 },
      transform: { x: w / 2, y: headerHeight / 2 + 2 },
    }),
  ];

  // Subtitle
  if (subtitle) {
    children.push(createNode({
      id: `${id}.subtitle`,
      text: { content: subtitle, size: 11, align: 'middle' },
      fill: { h: 0, s: 0, l: 70 },
      transform: { x: w / 2, y: headerHeight + (h - headerHeight) / 2 },
    }));
  }

  // Status indicator
  if (status && statusColors[status]) {
    children.push(createNode({
      id: `${id}.status`,
      ellipse: { rx: 5, ry: 5 },
      fill: statusColors[status],
      transform: { x: w - 15, y: 15 },
    }));
  }

  return createNode({
    id,
    children,
    ...(props.transform ? { transform: props.transform as any } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity as number } : {}),
    ...(props.style ? { style: props.style as string } : {}),
  });
}
