// ── Main class ──
export { StarchDiagram } from './StarchDiagram';
export type { StarchDiagramOptions, StarchEvent, StarchEventHandler, StarchEventType } from './StarchDiagram';

// ── React hook ──
export { useV2Diagram } from './app/components/V2Diagram';
export type { V2DiagramProps } from './app/components/V2Diagram';

// ── Parsing ──
export { parseScene } from './parser/parser';
export type { ParsedScene } from './parser/parser';

// ── Animation ──
export { buildTimeline } from './animation/timeline';
export { evaluateAllTracks, evaluateTrack } from './animation/evaluator';
export { applyTrackValues, applyTrackValuesMut, cloneNodeTree } from './animation/applyTracks';

// ── Rendering ──
export { SvgRenderBackend } from './renderer/svgBackend';
export type { RenderBackend, RgbaColor, StrokeStyle, PathSegment } from './renderer/backend';
export { emitFrame } from './renderer/emitter';
export { computeViewBox, findActiveCamera } from './renderer/camera';
export type { ViewBox } from './renderer/camera';

// ── Layout ──
export { runLayout, registerStrategy } from './layout/registry';
export type { LayoutStrategy, ChildPlacement } from './layout/registry';

// ── Text ──
export { getTextMeasurer } from './text/measure';
export type { TextMeasurer, MeasuredText } from './text/measure';
export { measureTextNodes } from './text/measurePass';

// ── Types ──
export type { Node } from './types/node';
export type { AnimConfig, Chapter, KeyframeBlock, Tracks, TrackKeyframe } from './types/animation';
export type { Color, Stroke } from './types/properties';
