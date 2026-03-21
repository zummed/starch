import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { Node as StarchNode } from '../../types/node';
import type { AnimConfig } from '../../types/animation';
import type { Chapter } from '../../../core/types';
import { parseScene, type ParsedScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';
import { evaluateAllTracks } from '../../animation/evaluator';
import { applyTrackValues } from '../../animation/applyTracks';
import { computeLayoutPlacements, applyLayoutPlacements, registerStrategy, type LayoutResult } from '../../layout/registry';
import { flexStrategy } from '../../layout/flex';
import { absoluteStrategy } from '../../layout/absolute';
import { computeViewBox, type ViewBox } from '../../renderer/camera';
import { emitFrame } from '../../renderer/emitter';
import { SvgRenderBackend } from '../../renderer/svgBackend';
import type { RenderBackend } from '../../renderer/backend';

// Register layout strategies (idempotent)
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);

function findNodeInTree(nodes: StarchNode[], id: string): StarchNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNodeInTree(n.children, id);
    if (found) return found;
  }
  return undefined;
}

export interface V2DiagramProps {
  dsl: string;
  autoplay?: boolean;
  speed?: number;
  debug?: boolean;
  onTimeUpdate?: (time: number) => void;
  viewportOverride?: ViewBox | null;
}

export function useV2Diagram(props: V2DiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backendRef = useRef<RenderBackend | null>(null);
  const mountedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  // Track previous layout positions for smooth slot transitions
  const layoutCache = useRef<Map<string, { x: number; y: number; slot?: string }>>(new Map());

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(props.autoplay ?? false);
  const [speed, setSpeed] = useState(props.speed ?? 1);

  // Parse scene
  const fallbackRef = useRef<ParsedScene | null>(null);
  const scene = useMemo(() => {
    try {
      const parsed = parseScene(props.dsl);
      fallbackRef.current = parsed;
      return parsed;
    } catch {
      return fallbackRef.current ?? {
        nodes: [],
        styles: {},
        trackPaths: [],
      };
    }
  }, [props.dsl]);

  const animConfig: AnimConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [] };
  const duration = animConfig.duration ?? 5;
  const chapters: Chapter[] = animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];
  const viewport = scene.viewport;
  const vpW = typeof viewport === 'object' && viewport ? (viewport as { width: number }).width ?? 800 : 800;
  const vpH = typeof viewport === 'object' && viewport ? (viewport as { height: number }).height ?? 500 : 500;

  // Build timeline (once per DSL change)
  const tracks = useMemo(() => buildTimeline(animConfig), [animConfig]);

  // Store latest values in refs so render() always has current data
  const sceneRef = useRef(scene);
  const tracksRef = useRef(tracks);
  const vpRef = useRef({ w: vpW, h: vpH });
  const viewportOverrideRef = useRef(props.viewportOverride);
  sceneRef.current = scene;
  tracksRef.current = tracks;
  vpRef.current = { w: vpW, h: vpH };
  viewportOverrideRef.current = props.viewportOverride;

  // Render function — always reads from refs
  const render = useCallback((t: number) => {
    const backend = backendRef.current;
    if (!backend || !mountedRef.current) return;

    const currentScene = sceneRef.current;
    const currentTracks = tracksRef.current;
    const { w, h } = vpRef.current;

    const values = evaluateAllTracks(currentTracks, t);
    const animated = applyTrackValues(currentScene.nodes, values);

    // Compute layout placements
    const placements = computeLayoutPlacements(animated);

    // Blend slot member positions for smooth transitions
    const cache = layoutCache.current;
    const blended: typeof placements = placements.map(p => {
      if (!p.isSlotMember) return p;

      const prev = cache.get(p.nodeId);
      const node = findNodeInTree(animated, p.nodeId);
      const currentSlot = node?.slot;

      if (prev && prev.slot !== currentSlot) {
        // Slot just changed — start blending from previous position
        // Use exponential blend: ~95% in 20 frames
        const bx = prev.x + (p.targetX - prev.x) * 0.12;
        const by = prev.y + (p.targetY - prev.y) * 0.12;
        cache.set(p.nodeId, { x: bx, y: by, slot: currentSlot });
        return { ...p, targetX: bx, targetY: by };
      }

      if (prev && (Math.abs(prev.x - p.targetX) > 0.5 || Math.abs(prev.y - p.targetY) > 0.5)) {
        // Still blending toward target
        const bx = prev.x + (p.targetX - prev.x) * 0.12;
        const by = prev.y + (p.targetY - prev.y) * 0.12;
        cache.set(p.nodeId, { x: bx, y: by, slot: currentSlot });
        return { ...p, targetX: bx, targetY: by };
      }

      // At rest — update cache
      cache.set(p.nodeId, { x: p.targetX, y: p.targetY, slot: currentSlot });
      return p;
    });

    applyLayoutPlacements(animated, blended);

    let viewBox: ViewBox | undefined;
    if (viewportOverrideRef.current) {
      viewBox = viewportOverrideRef.current;
    } else {
      const cameraNode = animated.find(n => n.camera);
      if (cameraNode) {
        viewBox = computeViewBox(cameraNode, animated, { x: 0, y: 0, w, h });
      }
    }

    emitFrame(backend, animated, animated, viewBox);
  }, []);

  // Mount/unmount backend
  useEffect(() => {
    if (!containerRef.current) return;
    const backend = new SvgRenderBackend();
    backend.mount(containerRef.current);
    backendRef.current = backend;
    mountedRef.current = true;

    // Initial render
    render(time);

    return () => {
      mountedRef.current = false;
      backend.destroy();
      backendRef.current = null;
    };
  }, []);

  // Re-render when scene/tracks/time/viewport change
  useEffect(() => {
    render(time);
  }, [time, scene, tracks, props.viewportOverride]);

  // Playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const dt = ((now - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = now;
      setTime(prev => {
        let next = prev + dt;
        if (next >= duration) {
          if (animConfig.loop ?? true) {
            next = next % duration;
          } else {
            next = duration;
            setPlaying(false);
          }
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, duration, animConfig.loop]);

  const seek = useCallback((t: number) => {
    setTime(Math.max(0, Math.min(t, duration)));
  }, [duration]);

  return {
    containerRef,
    time,
    duration,
    playing,
    speed,
    chapters,
    viewport: viewport ? { width: vpW, height: vpH } : undefined,
    background: scene.background,
    seek,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    setPlaying,
    setSpeed,
  };
}
