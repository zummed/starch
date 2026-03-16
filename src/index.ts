// Main API
export { StarchDiagram } from './StarchDiagram';
export type { StarchDiagramOptions } from './StarchDiagram';

// Core
export { Scene } from './core/Scene';
export type {
  ObjectType,
  NamedAnchor,
  FloatAnchor,
  AnchorPoint,
  BaseProps,
  BoxProps,
  CircleProps,
  LabelProps,
  TableProps,
  LineProps,
  PathProps,
  GroupProps,
  LayoutDirection,
  LayoutJustify,
  LayoutAlign,
  SceneObject,
  EasingName,
  Keyframe,
  Chapter,
  AnimConfig,
  TrackKeyframe,
  Tracks,
  StarchEventType,
  StarchEvent,
  StarchEventHandler,
  DiagramHandle,
} from './core/types';

// Schemas & Colours
export { parseShape, VALID_TYPES, LabelSchema } from './core/schemas';
export { resolveColour, deriveFill, resolveColourShortcut } from './core/colours';

// Layout
export { applyGroupLayouts } from './engine/layout';

// Engine (for advanced usage)
export { EASINGS, applyEasing } from './engine/easing';
export { resolveAnchor, scaleAroundAnchor, scaledCenter, anchorWorldPosition } from './engine/anchor';
export { interpolate, lerpColor } from './engine/interpolate';
export { buildTimeline } from './engine/timeline';
export { evaluateAnimatedProps, getActiveChapter } from './engine/evaluator';
export { computeRenderOrder } from './engine/renderOrder';

// Parser
export { parseDSL, parseJSON } from './parser/parser';
export { expandShorthands } from './parser/shorthands';

// Edge geometry
export { getObjectBounds, edgePoint, edgePointAtAnchor } from './renderer/EdgeGeometry';
