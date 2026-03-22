import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { AnimConfig } from '../../types/animation';
import type { Chapter } from '../../types/animation';
import { parseScene, type ParsedScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';
import { evaluateAllTracks } from '../../animation/evaluator';
import { applyTrackValues } from '../../animation/applyTracks';
import { runLayout, registerStrategy } from '../../layout/registry';
import { flexStrategy } from '../../layout/flex';
import { absoluteStrategy } from '../../layout/absolute';
import { computeViewBox, findActiveCamera, type ViewBox } from '../../renderer/camera';
import { emitFrame } from '../../renderer/emitter';
import { SvgRenderBackend } from '../../renderer/svgBackend';
import type { RenderBackend } from '../../renderer/backend';

// Register layout strategies (idempotent)
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);


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
  const chapters: Chapter[] = animConfig.chapters ?? [];
  const keyframeTimes = useMemo(() => {
    const times = (animConfig.keyframes ?? []).map(kf => kf.time).filter(t => t >= 0 && t <= duration);
    return [...new Set(times)].sort((a, b) => a - b);
  }, [animConfig.keyframes, duration]);
  const viewport = scene.viewport;

  // Expose camera ratio for preview container constraint
  const cameraRatio = useMemo(() => {
    const cam = findActiveCamera(scene.nodes);
    return cam?.camera?.ratio ?? null;
  }, [scene.nodes]);
  const vpW = typeof viewport === 'object' && viewport ? (viewport as { width: number }).width ?? 800 : 800;
  const vpH = typeof viewport === 'object' && viewport ? (viewport as { height: number }).height ?? 500 : 500;

  // Build timeline (once per DSL change) — pass nodes so slot tracks get expanded
  const { tracks, animatedSlotNodeIds } = useMemo(() => buildTimeline(animConfig, scene.nodes), [animConfig, scene.nodes]);

  // Auto-fit viewBox: when no camera, compute bounds across all keyframe times
  const autoFitViewBox = useMemo((): ViewBox | null => {
    if (findActiveCamera(scene.nodes)) return null; // has camera, don't auto-fit

    // Collect sample times: 0, each keyframe time, and duration
    const times = new Set<number>([0, duration]);
    for (const kf of animConfig.keyframes ?? []) {
      if (kf.time >= 0 && kf.time <= duration) times.add(kf.time);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addBounds = (nodes: typeof scene.nodes, parentX: number, parentY: number) => {
      for (const n of nodes) {
        if (n.camera) continue;
        const px = parentX + (n.transform?.x ?? 0);
        const py = parentY + (n.transform?.y ?? 0);
        let w = 0, h = 0;
        if (n.rect) { w = n.rect.w; h = n.rect.h; }
        else if (n.ellipse) { w = n.ellipse.rx * 2; h = n.ellipse.ry * 2; }

        else if (n.text) { w = (n.text.content?.length ?? 0) * (n.text.size ?? 14) * 0.6; h = (n.text.size ?? 14); }
        if (w > 0 || h > 0) {
          minX = Math.min(minX, px - w / 2);
          minY = Math.min(minY, py - h / 2);
          maxX = Math.max(maxX, px + w / 2);
          maxY = Math.max(maxY, py + h / 2);
        }
        if (n.children.length) addBounds(n.children, px, py);
      }
    };

    for (const t of times) {
      const values = evaluateAllTracks(tracks, t);
      const animated = applyTrackValues(scene.nodes, values);
      runLayout(animated, animatedSlotNodeIds);
      addBounds(animated, 0, 0);
    }

    if (minX === Infinity) return null;
    const margin = 30;
    return { x: minX - margin, y: minY - margin, w: (maxX - minX) + margin * 2, h: (maxY - minY) + margin * 2 };
  }, [scene.nodes, tracks, duration, animConfig.keyframes]);

  const autoFitRef = useRef(autoFitViewBox);
  autoFitRef.current = autoFitViewBox;

  // Store latest values in refs so render() always has current data
  const sceneRef = useRef(scene);
  const tracksRef = useRef(tracks);
  const slotIdsRef = useRef(animatedSlotNodeIds);
  const vpRef = useRef({ w: vpW, h: vpH });
  const viewportOverrideRef = useRef(props.viewportOverride);
  sceneRef.current = scene;
  tracksRef.current = tracks;
  slotIdsRef.current = animatedSlotNodeIds;
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
    runLayout(animated, slotIdsRef.current);

    let viewBox: ViewBox | undefined;
    if (viewportOverrideRef.current) {
      viewBox = viewportOverrideRef.current;
    } else {
      const cameraNode = findActiveCamera(animated);
      if (cameraNode) {
        viewBox = computeViewBox(cameraNode, { x: 0, y: 0, w, h });
      } else if (autoFitRef.current) {
        viewBox = autoFitRef.current;
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

  // Compute bounding box of all non-camera nodes for "fit all" (animation-aware)
  const computeFitAll = useCallback((): { x: number; y: number; zoom: number } => {
    const currentScene = sceneRef.current;
    const currentTracks = tracksRef.current;
    const dur = currentScene.animate?.duration ?? 5;
    const kfs = currentScene.animate?.keyframes ?? [];

    const times = new Set<number>([0, dur]);
    for (const kf of kfs) {
      if (kf.time >= 0 && kf.time <= dur) times.add(kf.time);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addBounds = (nodes: typeof currentScene.nodes, parentX: number, parentY: number) => {
      for (const n of nodes) {
        if (n.camera) continue;
        const px = parentX + (n.transform?.x ?? 0);
        const py = parentY + (n.transform?.y ?? 0);
        let w = 0, h = 0;
        if (n.rect) { w = n.rect.w; h = n.rect.h; }
        else if (n.ellipse) { w = n.ellipse.rx * 2; h = n.ellipse.ry * 2; }

        else if (n.text) { w = (n.text.content?.length ?? 0) * (n.text.size ?? 14) * 0.6; h = (n.text.size ?? 14); }
        if (w > 0 || h > 0) {
          minX = Math.min(minX, px - w / 2);
          minY = Math.min(minY, py - h / 2);
          maxX = Math.max(maxX, px + w / 2);
          maxY = Math.max(maxY, py + h / 2);
        }
        if (n.children.length) addBounds(n.children, px, py);
      }
    };

    for (const t of times) {
      const values = evaluateAllTracks(currentTracks, t);
      const animated = applyTrackValues(currentScene.nodes, values);
      runLayout(animated, slotIdsRef.current);
      addBounds(animated, 0, 0);
    }

    if (minX === Infinity) return { x: vpW / 2, y: vpH / 2, zoom: 1 };
    const margin = 40;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bw = (maxX - minX) + margin * 2;
    const bh = (maxY - minY) + margin * 2;
    const zoom = Math.min(vpW / bw, vpH / bh);
    return { x: cx, y: cy, zoom };
  }, [vpW, vpH]);

  return {
    containerRef,
    time,
    duration,
    playing,
    speed,
    chapters,
    keyframeTimes,
    viewport: viewport ? { width: vpW, height: vpH } : undefined,
    background: scene.background,
    cameraRatio,
    computeFitAll,
    seek,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    setPlaying,
    setSpeed,
  };
}
