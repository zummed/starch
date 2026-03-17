// Core
export { Scene } from './core/Scene';
export type {
  ObjectType, NamedAnchor, FloatAnchor, AnchorPoint, BaseProps,
  LayoutDirection, LayoutJustify, LayoutAlign,
  BoxProps, CircleProps, LabelProps, TableProps, LineProps, PathProps,
  SceneObject, EasingName, KeyframeBlock, ObjectChanges, Chapter, AnimConfig,
  TrackKeyframe, Tracks, StarchEventType, StarchEvent, StarchEventHandler, DiagramHandle,
} from './core/types';

// Engine
export { createEvaluator, evaluateAnimatedProps, getActiveChapter } from './engine/evaluator';
export { computeLayout } from './engine/layout';
export { buildTimeline } from './engine/timeline';
export { computeRenderOrder } from './engine/renderOrder';
export { EASINGS, applyEasing } from './engine/easing';
export { resolveAnchor, scaleAroundAnchor, scaledCenter, anchorWorldPosition } from './engine/anchor';
export { interpolate, lerpColor } from './engine/interpolate';

// Schemas & Colours
export { parseShape, VALID_TYPES, LabelSchema } from './core/schemas';
export { resolveColour, deriveFill, resolveColourShortcut } from './core/colours';

// Parser
export { parseDSL, parseJSON } from './parser/parser';
export { expandShorthands } from './parser/shorthands';

// Edge geometry
export { getObjectBounds, edgePoint, edgePointAtAnchor } from './renderer/EdgeGeometry';
