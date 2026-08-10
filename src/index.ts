// ── Main class ──
export { StarchDiagram } from './StarchDiagram';
export type { StarchDiagramOptions, StarchEvent, StarchEventHandler, StarchEventType, LoadResult } from './StarchDiagram';

// ── Static rendering ──
export { renderToSVG } from './renderStatic';
export type { RenderToSVGOptions } from './renderStatic';

// ── Edit-in-playground round trip ──
export { PLAYGROUND_URL, buildEditUrl, encodeDslToHash, decodeDslFromHash, isPlaygroundMessage, isHostMessage } from './editing';
export type { PlaygroundMessage, HostMessage } from './editing';

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
export { computeViewBox, findActiveCamera, computeAutoFitViewBox } from './renderer/camera';
export type { ViewBox } from './renderer/camera';

// ── Layout ──
export { runLayout, registerLayoutStrategy } from './layout';
export type { ChildPlacement } from './layout';

// ── Text ──
export { getTextMeasurer } from './text/measure';
export type { TextMeasurer, MeasuredText } from './text/measure';
export { measureTextNodes } from './text/measurePass';

// ── Types ──
export type { Node } from './types/node';
export type { AnimConfig, Chapter, KeyframeBlock, Tracks, TrackKeyframe } from './types/animation';
export type { Color, Stroke } from './types/properties';
