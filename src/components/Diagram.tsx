import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import type { SceneObject, DiagramHandle, Chapter, StarchEvent } from '../core/types';
import { Scene } from '../core/Scene';
import { parseDSL } from '../parser/parser';
import { buildTimeline } from '../engine/timeline';
import { evaluateAnimatedProps, getActiveChapter } from '../engine/evaluator';
import { SvgCanvas } from '../renderer/svg/SvgCanvas';
import { BoxRenderer } from '../renderer/svg/BoxRenderer';
import { CircleRenderer } from '../renderer/svg/CircleRenderer';
import { TextRenderer } from '../renderer/svg/TextRenderer';
import { TableRenderer } from '../renderer/svg/TableRenderer';
import { LineRenderer } from '../renderer/svg/LineRenderer';
import { PathRenderer } from '../renderer/svg/PathRenderer';
import { GroupRenderer } from '../renderer/svg/GroupRenderer';

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
  const parsed = useMemo(() => {
    if (props.scene) {
      return {
        objects: props.scene.getObjects(),
        animConfig: props.scene.getAnimConfig(),
      };
    }
    if (props.dsl) {
      return parseDSL(props.dsl);
    }
    return {
      objects: {} as Record<string, SceneObject>,
      animConfig: { duration: 5, loop: true, keyframes: [], chapters: [] as Chapter[] },
    };
  }, [props.scene, props.dsl]);

  const { objects, animConfig } = parsed;
  const tracks = useMemo(() => buildTimeline(animConfig), [animConfig]);
  const duration = animConfig.duration;
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
          if (animConfig.loop) {
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

  const animatedProps = useMemo(
    () => evaluateAnimatedProps(objects, tracks, time),
    [objects, tracks, time],
  );

  const renderOrder = useMemo(() => {
    const entries = Object.entries(objects);
    const texts = entries.filter(([, o]) => o.type === 'text');
    const paths = entries.filter(([, o]) => o.type === 'path');
    const lines = entries.filter(([, o]) => o.type === 'line');
    const shapes = entries.filter(
      ([, o]) =>
        o.type !== 'text' && o.type !== 'line' && o.type !== 'path' && o.type !== 'group',
    );
    const groups = entries.filter(([, o]) => o.type === 'group');
    return [...texts, ...paths, ...lines, ...shapes, ...groups];
  }, [objects]);

  return {
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
    }),
    [diagram.play, diagram.pause, diagram.seek, diagram.nextChapter, diagram.prevChapter],
  );

  const renderObject = useCallback(
    (id: string, obj: SceneObject): React.ReactNode => {
      const p = (diagram.animatedProps[id] || obj.props) as Record<string, unknown>;
      switch (obj.type) {
        case 'box':
          return <BoxRenderer key={id} props={p} />;
        case 'circle':
          return <CircleRenderer key={id} props={p} />;
        case 'text':
          return <TextRenderer key={id} props={p} />;
        case 'table':
          return <TableRenderer key={id} props={p} />;
        case 'line':
          return (
            <LineRenderer
              key={id}
              id={id}
              props={p}
              objects={diagram.objects}
              allProps={diagram.animatedProps}
            />
          );
        case 'path':
          return <PathRenderer key={id} props={p} debug={debug} />;
        case 'group':
          return (
            <GroupRenderer
              key={id}
              props={p}
              objects={diagram.objects}
              allProps={diagram.animatedProps}
              renderObject={renderObject}
            />
          );
        default:
          return null;
      }
    },
    [diagram.animatedProps, diagram.objects, debug],
  );

  return (
    <SvgCanvas>
      {diagram.renderOrder.map(([id, obj]) => renderObject(id, obj))}
    </SvgCanvas>
  );
});
