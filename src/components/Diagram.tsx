import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import type { Node } from '../v2/types/node';
import type { AnimConfig, Tracks } from '../v2/types/animation';
import type { DiagramHandle, Chapter, StarchEvent } from '../core/types';
import { Scene } from '../core/Scene';
import { parseScene, type ParsedScene } from '../v2/parser/parser';
import { buildTimeline } from '../v2/animation/timeline';
import { evaluateAllTracks } from '../v2/animation/evaluator';
import { applyTrackValues } from '../v2/animation/applyTracks';
import { runLayout, registerStrategy } from '../v2/layout/registry';
import { flexStrategy } from '../v2/layout/flex';
import { absoluteStrategy } from '../v2/layout/absolute';
import { computeViewBox, type ViewBox } from '../v2/renderer/camera';
import { renderTree, type RenderNode } from '../v2/renderer/renderTree';
import { getActiveChapter } from '../engine/evaluator';
import { convertOldFormat } from '../v2/parser/compat';
import JSON5 from 'json5';
import { SvgCanvas } from '../renderer/svg/SvgCanvas';
import { hslToCSS } from '../v2/renderer/hslToCSS';

// Register layout strategies
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);

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

interface ParsedV2 {
  nodes: Node[];
  styles: Record<string, any>;
  animConfig: AnimConfig;
  background?: string;
  viewport?: { width: number; height: number };
}

function parseInput(props: DiagramProps): ParsedV2 {
  const fallback: ParsedV2 = {
    nodes: [],
    styles: {},
    animConfig: { duration: 5, loop: true, keyframes: [], chapters: [] },
  };

  if (props.dsl) {
    try {
      const scene = parseScene(props.dsl);
      return {
        nodes: scene.nodes,
        styles: scene.styles,
        animConfig: scene.animate ?? fallback.animConfig,
        background: scene.background,
        viewport: typeof scene.viewport === 'object' ? scene.viewport as { width: number; height: number } : undefined,
      };
    } catch {
      // Try v1 compat
      try {
        const raw = JSON5.parse(props.dsl);
        const converted = convertOldFormat(raw);
        const scene = parseScene(JSON.stringify(converted));
        return {
          nodes: scene.nodes,
          styles: scene.styles,
          animConfig: scene.animate ?? fallback.animConfig,
          background: scene.background,
        };
      } catch {
        return fallback;
      }
    }
  }

  if (props.scene) {
    const objects = props.scene.getObjects();
    const styles = props.scene.getStyles();
    const animConfig = props.scene.getAnimConfig();
    const raw = {
      objects: Object.values(objects).map(obj => ({ type: obj.type, id: obj.id, ...obj.props })),
      styles,
      animate: animConfig,
    };
    try {
      const converted = convertOldFormat(raw);
      const scene = parseScene(JSON.stringify(converted));
      return {
        nodes: scene.nodes,
        styles: scene.styles,
        animConfig: scene.animate ?? fallback.animConfig,
      };
    } catch {
      return fallback;
    }
  }

  return fallback;
}

/** Render a RenderNode tree to React SVG elements */
function RenderNodeComponent({ node }: { node: RenderNode }): React.ReactElement {
  const gProps: Record<string, string | number> = {};
  if (node.groupTransform) gProps.transform = node.groupTransform;
  if (node.opacity < 1) gProps.opacity = node.opacity;

  return (
    <g key={node.id} data-id={node.id} {...gProps}>
      {node.geometry && (() => {
        const { tag, attrs } = node.geometry;
        const svgAttrs: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(attrs)) {
          // Convert kebab-case to React camelCase for common SVG attrs
          const reactKey = k === 'stroke-width' ? 'strokeWidth'
            : k === 'text-anchor' ? 'textAnchor'
            : k === 'dominant-baseline' ? 'dominantBaseline'
            : k === 'font-size' ? 'fontSize'
            : k === 'font-weight' ? 'fontWeight'
            : k === 'font-family' ? 'fontFamily'
            : k === 'stroke-dasharray' ? 'strokeDasharray'
            : k === 'stroke-dashoffset' ? 'strokeDashoffset'
            : k === 'stroke-linecap' ? 'strokeLinecap'
            : k;
          svgAttrs[reactKey] = v;
        }

        if (tag === 'text') {
          return <text {...svgAttrs}>{node.textContent}</text>;
        }

        // React requires self-closing for these
        const Tag = tag as any;
        return <Tag {...svgAttrs} />;
      })()}
      {node.children.map(child => (
        <RenderNodeComponent key={child.id} node={child} />
      ))}
    </g>
  );
}

function useDiagramCore(props: DiagramProps) {
  const fallbackRef = useRef<ParsedV2 | null>(null);

  const parsed = useMemo(() => {
    const result = parseInput(props);
    if (result.nodes.length > 0) {
      fallbackRef.current = result;
    }
    return fallbackRef.current ?? result;
  }, [props.scene, props.dsl]);

  const { nodes, animConfig, background, viewport } = parsed;
  const tracks = useMemo(() => buildTimeline(animConfig), [animConfig]);
  const duration = animConfig.duration ?? 5;
  const chapters: Chapter[] = animConfig.chapters?.map(c => ({ id: c.name, name: c.name, title: c.name, time: c.time })) ?? [];

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
      setTimeState(t);
      lastChapterRef.current = getActiveChapter(chapters, t);
    },
    [chapters],
  );

  const nextChapter = useCallback(() => {
    const sorted = [...chapters].sort((a, b) => a.time - b.time);
    const next = sorted.find((ch) => ch.time > time + 0.01);
    if (next) { seek(next.time); setPlaying(true); }
  }, [chapters, time, seek]);

  const prevChapter = useCallback(() => {
    const sorted = [...chapters].sort((a, b) => b.time - a.time);
    const prev = sorted.find((ch) => ch.time < time - 0.1);
    if (prev) { seek(prev.time); setPlaying(true); }
  }, [chapters, time, seek]);

  const goToChapter = useCallback(
    (id: string) => {
      const ch = chapters.find((c) => c.id === id);
      if (ch) { seek(ch.time); setPlaying(true); }
    },
    [chapters, seek],
  );

  // Evaluate animation and build render tree
  const renderNodes = useMemo(() => {
    const values = evaluateAllTracks(tracks, time);
    const animated = applyTrackValues(nodes, values);
    runLayout(animated);
    return renderTree(animated);
  }, [nodes, tracks, time]);

  // Camera
  const vpW = viewport?.width ?? 800;
  const vpH = viewport?.height ?? 500;
  const cameraViewBox: ViewBox | null = useMemo(() => {
    const values = evaluateAllTracks(tracks, time);
    const animated = applyTrackValues(nodes, values);
    const cameraNode = animated.find(n => n.camera);
    if (!cameraNode) return null;
    return computeViewBox(cameraNode, animated, { x: 0, y: 0, w: vpW, h: vpH });
  }, [nodes, tracks, time, vpW, vpH]);

  return {
    background,
    viewport,
    cameraViewBox,
    time,
    duration,
    playing,
    speed,
    chapters,
    activeChapter: getActiveChapter(chapters, time),
    renderNodes,
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

  const vb = diagram.cameraViewBox;

  return (
    <SvgCanvas
      background={diagram.background}
      viewBox={vb ? { x: vb.x, y: vb.y, width: vb.w, height: vb.h } : undefined}
    >
      {diagram.renderNodes.map(node => (
        <RenderNodeComponent key={node.id} node={node} />
      ))}
    </SvgCanvas>
  );
});
