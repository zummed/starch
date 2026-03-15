import type { SceneObject } from '../types';

// ─── State Machine Types ──────────────────────────────────────

export interface StateMachineState {
  label: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  textSize?: number;
  radius?: number;
}

export interface StateMachineTransition {
  from: string;
  to: string;
  label?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

export interface StateMachineProps {
  x: number;
  y: number;
  states: Record<string, StateMachineState>;
  transitions: StateMachineTransition[];
  initialState?: string;
  finalStates?: string[];

  // Layout
  direction?: 'horizontal' | 'vertical';
  spacing?: number;

  // State styling defaults
  stateFill?: string;
  stateStroke?: string;
  stateTextColor?: string;
  stateWidth?: number;
  stateHeight?: number;
  stateRadius?: number;

  // Transition styling defaults
  transitionStroke?: string;

  // Initial/final marker styling
  markerRadius?: number;
  markerFill?: string;
  markerStroke?: string;
}

// ─── Expansion ────────────────────────────────────────────────

/**
 * Separator used in generated object IDs.
 * Pattern: `{compositeId}__{category}__{name}`
 */
const SEP = '__';

export function stateId(compositeId: string, name: string): string {
  return `${compositeId}${SEP}state${SEP}${name}`;
}

export function transitionId(compositeId: string, from: string, to: string): string {
  return `${compositeId}${SEP}transition${SEP}${from}${SEP}${to}`;
}

export function initialMarkerId(compositeId: string): string {
  return `${compositeId}${SEP}initial`;
}

export function initialArrowId(compositeId: string): string {
  return `${compositeId}${SEP}initial${SEP}arrow`;
}

export function finalMarkerId(compositeId: string, name: string): string {
  return `${compositeId}${SEP}final${SEP}${name}`;
}

/**
 * Expand a StateMachine composite into primitive SceneObjects.
 *
 * Returns a record of all generated objects keyed by their IDs.
 * The caller (Scene) adds these to the scene's object map.
 */
export function expandStateMachine(
  id: string,
  props: StateMachineProps,
): Record<string, SceneObject> {
  const objects: Record<string, SceneObject> = {};

  const {
    x,
    y,
    states,
    transitions,
    initialState,
    finalStates = [],
    direction = 'horizontal',
    spacing = 160,
    stateFill = '#ffffff',
    stateStroke = '#333333',
    stateTextColor = '#333333',
    stateWidth = 120,
    stateHeight = 44,
    stateRadius = 8,
    transitionStroke = '#333333',
    markerRadius = 8,
    markerFill = '#333333',
    markerStroke = '#333333',
  } = props;

  const stateNames = Object.keys(states);

  // ── Compute positions for states ──────────────────

  const statePositions: Record<string, { x: number; y: number }> = {};
  stateNames.forEach((name, index) => {
    if (direction === 'horizontal') {
      statePositions[name] = {
        x: x + index * spacing,
        y: y,
      };
    } else {
      statePositions[name] = {
        x: x,
        y: y + index * spacing,
      };
    }
  });

  // ── Create state boxes ────────────────────────────

  for (const [name, state] of Object.entries(states)) {
    const pos = statePositions[name];
    const isFinal = finalStates.includes(name);

    objects[stateId(id, name)] = {
      type: 'box',
      id: stateId(id, name),
      props: {
        x: pos.x,
        y: pos.y,
        w: stateWidth,
        h: stateHeight,
        text: state.label,
        fill: state.fill ?? stateFill,
        stroke: state.stroke ?? stateStroke,
        strokeWidth: isFinal ? 3 : 2,
        radius: state.radius ?? stateRadius,
        textColor: state.textColor ?? stateTextColor,
        textSize: state.textSize ?? 14,
      } as never,
    };
  }

  // ── Create initial state marker ───────────────────

  if (initialState && statePositions[initialState]) {
    const targetPos = statePositions[initialState];
    const markerOffset = spacing * 0.4;

    let markerX: number, markerY: number;
    if (direction === 'horizontal') {
      markerX = targetPos.x - markerOffset;
      markerY = targetPos.y;
    } else {
      markerX = targetPos.x;
      markerY = targetPos.y - markerOffset;
    }

    const mkrId = initialMarkerId(id);
    objects[mkrId] = {
      type: 'circle',
      id: mkrId,
      props: {
        x: markerX,
        y: markerY,
        r: markerRadius,
        fill: markerFill,
        stroke: markerStroke,
        strokeWidth: 0,
      } as never,
    };

    // Arrow from marker to initial state
    const arrId = initialArrowId(id);
    objects[arrId] = {
      type: 'line',
      id: arrId,
      props: {
        from: mkrId,
        to: stateId(id, initialState),
        stroke: transitionStroke,
        strokeWidth: 2,
        arrow: true,
      } as never,
    };
  }

  // ── Create final state markers (outer ring) ───────

  for (const name of finalStates) {
    if (!statePositions[name]) continue;
    const pos = statePositions[name];

    // Place a circle marker after the final state
    const markerOffset = spacing * 0.4;
    let markerX: number, markerY: number;
    if (direction === 'horizontal') {
      markerX = pos.x + markerOffset;
      markerY = pos.y;
    } else {
      markerX = pos.x;
      markerY = pos.y + markerOffset;
    }

    // Outer ring (unfilled circle)
    const fmId = finalMarkerId(id, name);
    objects[fmId] = {
      type: 'circle',
      id: fmId,
      props: {
        x: markerX,
        y: markerY,
        r: markerRadius + 4,
        fill: 'none',
        stroke: markerStroke,
        strokeWidth: 2,
      } as never,
    };

    // Inner filled dot
    const innerDotId = `${fmId}${SEP}dot`;
    objects[innerDotId] = {
      type: 'circle',
      id: innerDotId,
      props: {
        x: markerX,
        y: markerY,
        r: markerRadius,
        fill: markerFill,
        stroke: markerStroke,
        strokeWidth: 0,
      } as never,
    };

    // Arrow from state to final marker
    const arrId = `${fmId}${SEP}arrow`;
    objects[arrId] = {
      type: 'line',
      id: arrId,
      props: {
        from: stateId(id, name),
        to: fmId,
        stroke: transitionStroke,
        strokeWidth: 2,
        arrow: true,
      } as never,
    };
  }

  // ── Create transitions ────────────────────────────

  for (const t of transitions) {
    if (!statePositions[t.from] || !statePositions[t.to]) continue;

    const tId = transitionId(id, t.from, t.to);
    objects[tId] = {
      type: 'line',
      id: tId,
      props: {
        from: stateId(id, t.from),
        to: stateId(id, t.to),
        stroke: t.stroke ?? transitionStroke,
        strokeWidth: t.strokeWidth ?? 2,
        arrow: true,
        label: t.label,
        dashed: t.dashed ?? false,
      } as never,
    };
  }

  return objects;
}
