import type { Node } from '../types/node';
import type { ConstraintResult } from './solver';
import { Solver } from './solver';
import { getWorldPosition } from '../renderer/geometry';

/** A single child's resolved placement, extracted from solved variables. */
export interface ChildPlacement {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** The one layout strategy interface: generate constraints, don't place directly. */
export type ConstraintStrategy = (node: Node, children: Node[]) => ConstraintResult;

const strategies = new Map<string, ConstraintStrategy>();

export function registerLayoutStrategy(name: string, strategy: ConstraintStrategy): void {
  strategies.set(name, strategy);
}

export function getLayoutStrategy(name: string): ConstraintStrategy | undefined {
  return strategies.get(name);
}

/**
 * Collect all nodes in the tree that declare layout.slot === containerId,
 * regardless of where they sit structurally.
 */
function collectSlotMembers(roots: Node[], containerId: string): Node[] {
  const members: Node[] = [];
  function walk(nodes: Node[]): void {
    for (const node of nodes) {
      if (node.layout?.slot === containerId) {
        members.push(node);
      }
      walk(node.children);
    }
  }
  walk(roots);
  return members;
}

/**
 * A container's layout children (2c): its own children minus skipped
 * structural nodes and minus children whose slot names a different
 * container, plus slot members declared anywhere in the tree. A node whose
 * slot happens to equal its own actual parent is both — it's deduped to one
 * entry, still flagged as a slot member (its world/local conversion is a
 * no-op in that case, see applyLayoutPlacements).
 */
export function collectLayoutChildren(container: Node, allRoots: Node[]): { children: Node[]; slotMemberIds: Set<string> } {
  const ownChildren = container.children.filter(c => {
    if (c.layout?.skip === true) return false;
    if (c.layout?.slot !== undefined && c.layout.slot !== container.id) return false;
    return true;
  });
  const slotMembers = collectSlotMembers(allRoots, container.id);
  const ownIds = new Set(ownChildren.map(c => c.id));
  const extraMembers = slotMembers.filter(m => !ownIds.has(m.id));

  return {
    children: [...ownChildren, ...extraMembers],
    slotMemberIds: new Set(slotMembers.map(m => m.id)),
  };
}

/** Find a node's actual structural parent (undefined if it's a root). */
function findParent(roots: Node[], childId: string): Node | undefined {
  function walk(nodes: Node[]): Node | undefined {
    for (const node of nodes) {
      if (node.children.some(c => c.id === childId)) return node;
      const found = walk(node.children);
      if (found) return found;
    }
    return undefined;
  }
  return walk(roots);
}

export function findNode(nodes: Node[], id: string): Node | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Run layout and return the computed placements for all layout containers.
 * Does NOT apply positions — the caller decides how to use them.
 */
export interface LayoutResult {
  nodeId: string;
  targetX: number;
  targetY: number;
  targetW?: number;
  targetH?: number;
  isSlotMember: boolean;
}

/**
 * Extract per-child placements from a container's solved variables.
 * Returns ChildPlacement in the container's own local frame — slot-member
 * world conversion happens one level up, where we know the container id.
 */
function extractPlacements(children: Node[], variables: Map<string, import('./solver').Variable>): ChildPlacement[] {
  const placements: ChildPlacement[] = [];
  for (const child of children) {
    const cxVar = variables.get(`${child.id}.centerX`);
    const cyVar = variables.get(`${child.id}.centerY`);
    if (!cxVar || !cyVar) continue;

    const placement: ChildPlacement = { id: child.id, x: cxVar.value, y: cyVar.value };

    const wVar = variables.get(`${child.id}.width`);
    const hVar = variables.get(`${child.id}.height`);
    if (wVar) {
      const intrinsicW = child.rect?.w ?? (child.ellipse ? child.ellipse.rx * 2 : undefined);
      if (intrinsicW !== undefined && Math.abs(wVar.value - intrinsicW) > 1e-9) placement.w = wVar.value;
    }
    if (hVar) {
      const intrinsicH = child.rect?.h ?? (child.ellipse ? child.ellipse.ry * 2 : undefined);
      if (intrinsicH !== undefined && Math.abs(hVar.value - intrinsicH) > 1e-9) placement.h = hVar.value;
    }

    placements.push(placement);
  }
  return placements;
}

export function computeLayoutPlacements(roots: Node[]): LayoutResult[] {
  const results: LayoutResult[] = [];

  // Bottom-up: a container's children (including nested containers) are
  // fully processed — and, if they auto-size, given a final rect — before
  // the container itself runs its strategy.
  function processNode(node: Node): void {
    for (const child of node.children) processNode(child);

    const layoutType = node.layout?.type;
    if (!layoutType) return;
    const strategy = getLayoutStrategy(layoutType);
    if (!strategy) return;

    const { children: layoutChildren, slotMemberIds } = collectLayoutChildren(node, roots);
    const result = strategy(node, layoutChildren);

    if (result.containerSize) {
      if (!node.rect) {
        (node as any).rect = { w: result.containerSize.w, h: result.containerSize.h };
      } else {
        node.rect.w = result.containerSize.w;
        node.rect.h = result.containerSize.h;
      }
    }

    if (layoutChildren.length === 0) return;

    const solver = new Solver();
    for (const c of result.constraints) solver.addConstraint(c);
    const solveResult = solver.solve();
    if (solveResult.status === 'conflict') {
      console.warn(`[layout] container "${node.id}": ${solveResult.conflicts} conflicting constraint(s), some placements may be wrong`);
    }
    if (solveResult.freeVariables.length > 0) {
      console.warn(`[layout] container "${node.id}": ${solveResult.freeVariables.length} unconstrained variable(s) — ${solveResult.freeVariables.join(', ')}`);
    }

    const containerWorld = getWorldPosition(roots, node.id) ?? { x: 0, y: 0 };
    const placements = extractPlacements(layoutChildren, result.variables);

    for (const p of placements) {
      const isSlot = slotMemberIds.has(p.id);
      results.push({
        nodeId: p.id,
        targetX: isSlot ? p.x + containerWorld.x : p.x,
        targetY: isSlot ? p.y + containerWorld.y : p.y,
        targetW: p.w,
        targetH: p.h,
        isSlotMember: isSlot,
      });
    }
  }

  for (const root of roots) processNode(root);
  return results;
}

/**
 * Convert a node's world-frame coordinates (relative to the document root)
 * into its actual structural parent's local frame (translation only).
 * Slot members are solved in their target container's world frame — this
 * is the one place that projects that back down into wherever the node
 * actually lives in the tree, shared by render-time placement and the
 * timeline's per-keyframe-time layout solves.
 */
export function worldToParentLocal(roots: Node[], nodeId: string, worldX: number, worldY: number): { x: number; y: number } {
  const parent = findParent(roots, nodeId);
  const parentWorld = parent ? (getWorldPosition(roots, parent.id) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
  return { x: worldX - parentWorld.x, y: worldY - parentWorld.y };
}

/**
 * Apply layout placements directly to nodes.
 * Used for simple cases (direct children, no animation needed).
 */
export function applyLayoutPlacements(roots: Node[], placements: LayoutResult[], layoutAnimatedNodeIds?: Set<string>): void {
  for (const p of placements) {
    // Skip any node whose position/size is driven by system-emitted
    // animation tracks (timeline slot expansion) — applying fresh layout
    // here would fight the interpolated keyframes every frame.
    if (layoutAnimatedNodeIds?.has(p.nodeId)) continue;

    const node = findNode(roots, p.nodeId);
    if (!node) continue;

    let x = p.targetX;
    let y = p.targetY;
    if (p.isSlotMember) {
      // targetX/Y are world coordinates (relative to the target container) —
      // convert into this node's actual structural parent's local frame.
      const local = worldToParentLocal(roots, p.nodeId, x, y);
      x = local.x;
      y = local.y;
    }

    if (!node.transform) (node as any).transform = {};
    node.transform!.x = x;
    node.transform!.y = y;
    if (p.targetW !== undefined) {
      if (node.rect) node.rect.w = p.targetW;
      else if (node.ellipse) node.ellipse.rx = p.targetW / 2;
    }
    if (p.targetH !== undefined) {
      if (node.rect) node.rect.h = p.targetH;
      else if (node.ellipse) node.ellipse.ry = p.targetH / 2;
    }
  }
}

/** Check if any node in the tree declares a layout container. */
function hasLayoutContainers(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.layout?.type) return true;
    if (node.children.length > 0 && hasLayoutContainers(node.children)) return true;
  }
  return false;
}

/** Convenience: compute and apply in one step */
export function runLayout(roots: Node[], layoutAnimatedNodeIds?: Set<string>): void {
  if (!hasLayoutContainers(roots)) return;
  const placements = computeLayoutPlacements(roots);
  applyLayoutPlacements(roots, placements, layoutAnimatedNodeIds);
}
