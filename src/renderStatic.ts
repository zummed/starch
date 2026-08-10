/**
 * Static SVG rendering — parses a starch DSL scene and renders a single
 * frame to a self-contained SVG string, with no animation loop or
 * container element management involved.
 *
 * Strict counterpart to StarchDiagram's event-based error handling: parse
 * errors are not caught here, they propagate to the caller.
 */
import { parseScene } from './parser/parser';
import { buildTimeline } from './animation/timeline';
import { evaluateAllTracks } from './animation/evaluator';
import { applyTrackValues } from './animation/applyTracks';
import { measureTextNodes } from './text/measurePass';
import { getTextMeasurer } from './text/measure';
import { computeViewBox, findActiveCamera, computeAutoFitViewBox } from './renderer/camera';
import { emitFrame } from './renderer/emitter';
import { SvgRenderBackend } from './renderer/svgBackend';
import { colorToRgba } from './types/color';
import type { Color } from './types/properties';

export interface RenderToSVGOptions {
  /** Time (seconds) to render. Defaults to the animation duration — the fully-drawn end state. Clamped to [0, duration]. */
  time?: number;
}

/**
 * Render a starch DSL scene to a static SVG string. Mirrors the same
 * parse → build timeline → evaluate → apply → render pipeline
 * StarchDiagram uses per frame, but for a single point in time, into a
 * detached container.
 *
 * Requires a DOM (`document`) — used to build the SVG element tree and to
 * measure text — so this only runs in a browser or a Node environment
 * with a DOM shim (e.g. happy-dom, jsdom).
 */
export function renderToSVG(dsl: string, options: RenderToSVGOptions = {}): string {
  if (typeof document === 'undefined') {
    throw new Error('renderToSVG requires a DOM (document is undefined) — run in a browser, or in Node with a DOM shim such as happy-dom or jsdom.');
  }

  const scene = parseScene(dsl, getTextMeasurer());
  const animConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [] };
  const duration = animConfig.duration ?? 5;
  const time = Math.max(0, Math.min(options.time ?? duration, duration));

  const { tracks, baseNodes } = buildTimeline(animConfig, scene.nodes);
  const values = evaluateAllTracks(tracks, time);
  const animated = applyTrackValues(baseNodes, values);
  // Layout itself is solved once in buildTimeline; text still needs its
  // own measurement pass since the animated content may have changed size.
  measureTextNodes(animated, getTextMeasurer());

  const vp = scene.viewport as { width?: number; height?: number } | undefined;
  const viewport = { w: vp?.width ?? 800, h: vp?.height ?? 500 };

  // Compute viewbox from camera or auto-fit, same as StarchDiagram._render.
  const cameraNode = findActiveCamera(animated);
  const viewBox = cameraNode
    ? computeViewBox(cameraNode, { x: 0, y: 0, ...viewport })
    : computeAutoFitViewBox(animated);

  const container = document.createElement('div');
  const backend = new SvgRenderBackend();
  backend.mount(container);

  // Apply background
  if (scene.background) {
    try {
      backend.setBackground(colorToRgba(scene.background as Color));
    } catch {
      backend.setBackground('transparent');
    }
  } else {
    backend.setBackground('transparent');
  }

  emitFrame(backend, animated, animated, viewBox);
  const svg = container.innerHTML;
  backend.destroy();

  return svg;
}
