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

// Components
export { Diagram, useDiagram } from './components/Diagram';
export type { DiagramProps } from './components/Diagram';
export { Timeline } from './components/Timeline';
export { Editor } from './components/Editor';

// Engine (for advanced usage)
export { EASINGS, applyEasing } from './engine/easing';
export { resolveAnchor, scaleAroundAnchor, scaledCenter, anchorWorldPosition } from './engine/anchor';
export { interpolate, lerpColor } from './engine/interpolate';
export { buildTimeline } from './engine/timeline';
export { evaluateAnimatedProps, getActiveChapter } from './engine/evaluator';

// Parser
export { parseDSL, parseJSON } from './parser/parser';
export { expandShorthands } from './parser/shorthands';

// Renderers
export { SvgCanvas } from './renderer/svg/SvgCanvas';
export { BoxRenderer } from './renderer/svg/BoxRenderer';
export { CircleRenderer } from './renderer/svg/CircleRenderer';
export { LabelRenderer } from './renderer/svg/LabelRenderer';
export { TableRenderer } from './renderer/svg/TableRenderer';
export { LineRenderer } from './renderer/svg/LineRenderer';
export { PathRenderer } from './renderer/svg/PathRenderer';
export { GroupRenderer } from './renderer/svg/GroupRenderer';
export { getObjectBounds, edgePoint, edgePointAtAnchor } from './renderer/EdgeGeometry';
