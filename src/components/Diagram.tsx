import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import type { SceneObject, DiagramHandle, Chapter, AnimConfig, StarchEvent, EasingName } from '../core/types';
import { Scene } from '../core/Scene';
import { parseDSL } from '../parser/parser';
import { buildTimeline } from '../engine/timeline';
import { extractEffects } from '../engine/effects';
import { createEvaluator, getActiveChapter } from '../engine/evaluator';
import { computeRenderOrder } from '../engine/renderOrder';
import { findCamera, resolveCamera, type ViewBox } from '../engine/camera';
import { SvgCanvas } from '../renderer/svg/SvgCanvas';
import { createRenderObject } from '../renderer/renderObject';

export interface DiagramProps {
  scene?: Scene;
  dsl?: string;
  autoplay?: boolean;
  speed?: number;
  debug?: boolean;
  onChapterEnter?: (event: StarchEvent) => void;
  onChapterExit?: (event: StarchEvent) => void;
  onEvent?: (event: StarchEvent) => void;
}

function useDiagramCore(props: DiagramProps) {
  const fallback = useRef({
    objects: {} as Record<string, SceneObject>,
    animConfig: { duration: 5, loop: true, keyframes: [], chapters: [] } as AnimConfig,
    styles: {} as Record<string, Record<string, unknown>>,
  });

  const evaluatorRef = useRef(createEvaluator());

  const parsed = useMemo(() => {
    try {
      let result;
      if (props.scene) {
        result = {
          objects: props.scene.getObjects(),
          animConfig: props.scene.getAnimConfig(),
          styles: props.scene.getStyles(),
        };
      } else if (props.dsl) {
        result = parseDSL(props.dsl);
      } else {
        result = fallback.current;
      }
      fallback.current = result;
      return result;
    } catch {
      // Return last valid parse while user is mid-edit
      return fallback.current;
    }
  }, [props.scene, props.dsl]);

  const { objects, animConfig } = parsed;
  const styles = ('styles' in parsed) ? (parsed as { styles?: Record<string, Record<string, unknown>> }).styles ?? {} : {};
  const diagramName = ('name' in parsed) ? (parsed as { name?: string }).name : undefined;
  const diagramBackground = ('background' in parsed) ? (parsed as { background?: string }).background : undefined;
  const diagramViewport = ('viewport' in parsed) ? (parsed as { viewport?: { width: number; height: number } }).viewport : undefined;
  const tracks = useMemo(() => buildTimeline(animConfig, objects, styles), [animConfig, objects, styles]);
  const effects = useMemo(() => extractEffects(animConfig), [animConfig]);
  // Recreate evaluator when effects or styles change
  useMemo(() => { evaluatorRef.current = createEvaluator(effects, styles); }, [effects, styles]);
  const duration = animConfig.duration ?? 5;
  const chapters = animConfig.chapters;

  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(props.autoplay ?? false);
  const [speed, setSpeed] = useState(props.speed ?? 1);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastChapterRef = useRef<Chapter | undefined>(undefined);

  useEffect(() => {
    setSpeed(props.speed ?? 1);
  }, [props.speed]);

  // Chapter detection
  useEffect(() => {
    const active = getActiveChapter(chapters, time);
    const prev = lastChapterRef.current;

    if (active && active !== prev) {
      if (prev) {
        const exitEvent: StarchEvent = { type: 'chapterExit', chapter: prev, time };
        props.onChapterExit?.(exitEvent);
        props.onEvent?.(exitEvent);
        props.scene?.emit(exitEvent);
      }
      const enterEvent: StarchEvent = { type: 'chapterEnter', chapter: active, time };
      props.onChapterEnter?.(enterEvent);
      props.onEvent?.(enterEvent);
      props.scene?.emit(enterEvent);

      if (playing && prev !== undefined) {
        setPlaying(false);
      }
      lastChapterRef.current = active;
    }
  }, [time, chapters, playing, props]);

  // Playback
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const dt = ((now - lastFrameRef.current) / 1000) * speed;
      lastFrameRef.current = now;
      setTimeState((prev) => {
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

  const seek = useCallback(
    (t: number) => {
      evaluatorRef.current.reset();
      setTimeState(t);
      lastChapterRef.current = getActiveChapter(chapters, t);
    },
    [chapters],
  );

  const nextChapter = useCallback(() => {
    const sorted = [...chapters].sort((a, b) => a.time - b.time);
    const next = sorted.find((ch) => ch.time > time + 0.01);
    if (next) {
      seek(next.time);
      setPlaying(true);
    }
  }, [chapters, time, seek]);

  const prevChapter = useCallback(() => {
    const sorted = [...chapters].sort((a, b) => b.time - a.time);
    const prev = sorted.find((ch) => ch.time < time - 0.1);
    if (prev) {
      seek(prev.time);
      setPlaying(true);
    }
  }, [chapters, time, seek]);

  const goToChapter = useCallback(
    (id: string) => {
      const ch = chapters.find((c) => c.id === id);
      if (ch) {
        seek(ch.time);
        setPlaying(true);
      }
    },
    [chapters, seek],
  );

  const animatedProps = useMemo(
    () => evaluatorRef.current(objects, tracks, time),
    [objects, tracks, time],
  );

  const renderOrder = useMemo(
    () => computeRenderOrder(objects, animatedProps),
    [objects, animatedProps],
  );

  // Resolve camera viewBox with smooth target blending
  const vpW = diagramViewport?.width ?? 800;
  const vpH = diagramViewport?.height ?? 500;
  const cameraViewBox: ViewBox | null = useMemo(() => {
    const cam = findCamera(objects, animatedProps);
    if (!cam) return null;

    // Find block boundary times for blending camera target transitions
    const camTracks = Object.keys(tracks).filter(k => k.startsWith(cam.id + '.'));
    if (camTracks.length > 0) {
      const allTimes = new Set<number>();
      for (const k of camTracks) {
        for (const kf of tracks[k]) allTimes.add(kf.time);
      }
      const blockTimes = [...allTimes].sort((a, b) => a - b);

      let prevBlock = 0, nextBlock = blockTimes[blockTimes.length - 1] || 0;
      for (const bt of blockTimes) {
        if (bt <= time) prevBlock = bt;
        if (bt > time) { nextBlock = bt; break; }
      }

      if (time > prevBlock && time < nextBlock && prevBlock !== nextBlock) {
        // Compute from/to props at block boundaries
        const fromResult = evaluatorRef.current(objects, tracks, prevBlock);
        const toResult = evaluatorRef.current(objects, tracks, nextBlock);
        const fromCamProps = fromResult[cam.id] || {};
        const toCamProps = toResult[cam.id] || {};
        const rawT = (time - prevBlock) / (nextBlock - prevBlock);

        // Find the easing from the camera track keyframe at nextBlock
        let easing: EasingName = 'easeInOut';
        for (const k of camTracks) {
          const kfs = tracks[k];
          for (const kf of kfs) {
            if (Math.abs(kf.time - nextBlock) < 0.001 && kf.easing !== 'linear') {
              easing = kf.easing;
              break;
            }
          }
          if (easing !== 'easeInOut') break;
        }

        return resolveCamera(cam.props, animatedProps, objects, vpW, vpH, {
          fromProps: fromCamProps,
          toProps: toCamProps,
          fromAllProps: fromResult,
          toAllProps: toResult,
          rawT,
          easing,
        });
      }
    }

    return resolveCamera(cam.props, animatedProps, objects, vpW, vpH);
  }, [objects, animatedProps, tracks, time, vpW, vpH]);

  return {
    name: diagramName,
    background: diagramBackground,
    viewport: diagramViewport,
    cameraViewBox,
    time,
    duration,
    playing,
    speed,
    chapters,
    activeChapter: getActiveChapter(chapters, time),
    objects,
    animatedProps,
    renderOrder,
    pct: duration > 0 ? (time / duration) * 100 : 0,
    seek,
    setPlaying,
    setSpeed,
    play: useCallback(() => setPlaying(true), []),
    pause: useCallback(() => setPlaying(false), []),
    nextChapter,
    prevChapter,
    goToChapter,
  };
}

/**
 * Hook version of Diagram for full layout control.
 */
export function useDiagram(props: DiagramProps) {
  return useDiagramCore(props);
}

/**
 * Self-contained Diagram component with SVG canvas.
 */
export const Diagram = forwardRef<DiagramHandle, DiagramProps>(function Diagram(props, ref) {
  const diagram = useDiagramCore(props);
  const debug = props.debug ?? false;

  useImperativeHandle(
    ref,
    () => ({
      play: diagram.play,
      pause: diagram.pause,
      seek: diagram.seek,
      nextChapter: diagram.nextChapter,
      prevChapter: diagram.prevChapter,
      goToChapter: diagram.goToChapter,
    }),
    [diagram.play, diagram.pause, diagram.seek, diagram.nextChapter, diagram.prevChapter, diagram.goToChapter],
  );

  const renderObject = useMemo(
    () => createRenderObject(diagram.animatedProps, diagram.objects, debug),
    [diagram.animatedProps, diagram.objects, debug],
  );

  return (
    <SvgCanvas>
      {diagram.renderOrder.map(([id, obj]) => renderObject(id, obj))}
    </SvgCanvas>
  );
});
