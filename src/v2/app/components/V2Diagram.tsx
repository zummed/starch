import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { Node } from '../../types/node';
import type { AnimConfig, Tracks } from '../../types/animation';
import type { Chapter } from '../../../core/types';
import { parseScene, type ParsedScene } from '../../parser/parser';
import { buildTimeline } from '../../animation/timeline';
import { evaluateAllTracks } from '../../animation/evaluator';
import { applyTrackValues } from '../../animation/applyTracks';
import { runLayout, registerStrategy } from '../../layout/registry';
import { flexStrategy } from '../../layout/flex';
import { absoluteStrategy } from '../../layout/absolute';
import { computeViewBox, type ViewBox } from '../../renderer/camera';
import { emitFrame } from '../../renderer/emitter';
import { SvgRenderBackend } from '../../renderer/svgBackend';
import type { RenderBackend, RgbaColor } from '../../renderer/backend';

// Register layout strategies
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);

export interface V2DiagramHandle {
  play(): void;
  pause(): void;
  seek(time: number): void;
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  chapters: Chapter[];
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
  const chapters: Chapter[] = animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];
  const viewport = scene.viewport;
  const vpW = typeof viewport === 'object' && viewport ? (viewport as { width: number }).width ?? 800 : 800;
  const vpH = typeof viewport === 'object' && viewport ? (viewport as { height: number }).height ?? 500 : 500;

  // Build timeline (once per DSL change)
  const tracks = useMemo(() => buildTimeline(animConfig), [animConfig]);

  // Mount/unmount backend
  useEffect(() => {
    if (!containerRef.current) return;
    const backend = new SvgRenderBackend();
    backend.mount(containerRef.current);
    if (scene.background) {
      if (scene.background === 'transparent' || scene.background === 'none') {
        backend.setBackground('transparent');
      } else {
        // Parse background color (for now, just set via CSS)
        const svg = containerRef.current.querySelector('svg');
        if (svg) svg.style.background = scene.background;
      }
    }
    backendRef.current = backend;
    return () => {
      backend.destroy();
      backendRef.current = null;
    };
  }, []); // Only mount once

  // Render function
  const render = useCallback((t: number) => {
    const backend = backendRef.current;
    if (!backend) return;

    const values = evaluateAllTracks(tracks, t);
    const animated = applyTrackValues(scene.nodes, values);
    runLayout(animated);

    // Camera
    let viewBox: ViewBox | undefined;
    if (props.viewportOverride) {
      viewBox = props.viewportOverride;
    } else {
      const cameraNode = animated.find(n => n.camera);
      if (cameraNode) {
        viewBox = computeViewBox(cameraNode, animated, { x: 0, y: 0, w: vpW, h: vpH });
      }
    }

    emitFrame(backend, animated, animated, viewBox);
  }, [scene.nodes, tracks, vpW, vpH, props.viewportOverride]);

  // Render on time change
  useEffect(() => {
    render(time);
  }, [time, render]);

  // Re-render when DSL changes
  useEffect(() => {
    render(time);
  }, [props.dsl]);

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

  // Notify parent of time changes
  useEffect(() => {
    props.onTimeUpdate?.(time);
  }, [time]);

  const seek = useCallback((t: number) => {
    setTime(Math.max(0, Math.min(t, duration)));
  }, [duration]);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);

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
    play,
    pause,
    setPlaying,
    setSpeed,
  };
}
