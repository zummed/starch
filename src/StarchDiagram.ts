/**
 * Vanilla JS API for rendering and animating starch diagrams.
 * Framework-agnostic — works in any webpage with a container element.
 */
import type { AnimConfig, Chapter, Tracks } from './types/animation';
import type { Node } from './types/node';
import type { Color } from './types/properties';
import type { RenderBackend } from './renderer/backend';
import type { ViewBox } from './renderer/camera';
import { parseScene, type ParsedScene } from './parser/parser';
import { buildTimeline } from './animation/timeline';
import { evaluateAllTracks } from './animation/evaluator';
import { applyTrackValues } from './animation/applyTracks';
import { measureTextNodes } from './text/measurePass';
import { getTextMeasurer } from './text/measure';
import { runLayout, registerStrategy } from './layout/registry';
import { flexStrategy } from './layout/flex';
import { absoluteStrategy } from './layout/absolute';
import { computeViewBox, findActiveCamera } from './renderer/camera';
import { emitFrame } from './renderer/emitter';
import { SvgRenderBackend } from './renderer/svgBackend';
import { colorToRgba } from './types/color';

// Register layout strategies (idempotent — Map.set overwrites)
registerStrategy('flex', flexStrategy);
registerStrategy('absolute', absoluteStrategy);

export type StarchEventType = 'chapterEnter' | 'chapterExit' | 'ended';
export interface StarchEvent {
  type: StarchEventType;
  chapter?: Chapter;
  time: number;
}
export type StarchEventHandler = (event: StarchEvent) => void;

export interface StarchDiagramOptions {
  dsl?: string;
  autoplay?: boolean;
  speed?: number;
  onEvent?: StarchEventHandler;
}

export class StarchDiagram {
  private _container: HTMLElement;
  private _backend: RenderBackend;

  private _scene: ParsedScene = { nodes: [], styles: {}, trackPaths: [] };
  private _animConfig: AnimConfig = { duration: 5, loop: true, keyframes: [] };
  private _tracks: Tracks = new Map();
  private _animatedSlotNodeIds = new Set<string>();
  private _viewport = { w: 800, h: 500 };

  private _time = 0;
  private _playing = false;
  private _speed = 1;
  private _lastChapter: Chapter | undefined = undefined;
  private _rafId: number | null = null;
  private _lastFrame = 0;

  private _onEvent: StarchEventHandler | undefined;
  private _listeners = new Map<string, Set<StarchEventHandler>>();

  constructor(container: HTMLElement, options?: StarchDiagramOptions) {
    this._container = container;
    this._backend = new SvgRenderBackend();
    this._backend.mount(this._container);
    this._onEvent = options?.onEvent;

    if (options) {
      this._speed = options.speed ?? 1;
      if (options.dsl) {
        this._loadDSL(options.dsl);
      }
      if (options.autoplay) {
        this.play();
      }
    }
  }

  // ── Read-only state ──

  get time(): number { return this._time; }
  get duration(): number { return this._animConfig.duration ?? 5; }
  get playing(): boolean { return this._playing; }
  get speed(): number { return this._speed; }
  get chapters(): Chapter[] { return this._animConfig.chapters ?? []; }

  get activeChapter(): Chapter | undefined {
    const chapters = this.chapters;
    if (!chapters.length) return undefined;
    const sorted = [...chapters].sort((a, b) => b.time - a.time);
    return sorted.find(ch => ch.time <= this._time);
  }

  // ── Playback control ──

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this._lastFrame = performance.now();
    this._scheduleFrame();
  }

  pause(): void {
    this._playing = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  seek(time: number): void {
    this._time = Math.max(0, Math.min(time, this.duration));
    this._lastChapter = this.activeChapter;
    this._render();
  }

  setSpeed(speed: number): void {
    this._speed = speed;
  }

  nextChapter(): void {
    const sorted = [...this.chapters].sort((a, b) => a.time - b.time);
    const next = sorted.find(ch => ch.time > this._time + 0.01);
    if (next) {
      this.seek(next.time);
      this.play();
    }
  }

  prevChapter(): void {
    const sorted = [...this.chapters].sort((a, b) => b.time - a.time);
    const prev = sorted.find(ch => ch.time < this._time - 0.1);
    if (prev) {
      this.seek(prev.time);
      this.play();
    }
  }

  goToChapter(id: string): void {
    const ch = this.chapters.find(c => c.name === id);
    if (ch) {
      this.seek(ch.time);
      this.play();
    }
  }

  // ── Content ──

  setDSL(dsl: string): void {
    this._loadDSL(dsl);
    this._render();
  }

  // ── Events ──

  on(type: string, handler: StarchEventHandler): void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(handler);
  }

  off(type: string, handler: StarchEventHandler): void {
    this._listeners.get(type)?.delete(handler);
  }

  // ── Lifecycle ──

  destroy(): void {
    this.pause();
    this._backend.destroy();
    this._listeners.clear();
  }

  // ── Internal ──

  private _loadDSL(dsl: string): void {
    try {
      const scene = parseScene(dsl, getTextMeasurer());
      this._scene = scene;
      this._animConfig = scene.animate ?? { duration: 5, loop: true, keyframes: [] };

      const vp = scene.viewport as { width?: number; height?: number } | undefined;
      this._viewport = {
        w: vp?.width ?? 800,
        h: vp?.height ?? 500,
      };

      // Apply background
      if (scene.background) {
        try {
          this._backend.setBackground(colorToRgba(scene.background as Color));
        } catch {
          this._backend.setBackground('transparent');
        }
      } else {
        this._backend.setBackground('transparent');
      }
    } catch {
      return; // keep previous state on parse error
    }
    this._rebuild();
  }

  private _rebuild(): void {
    const result = buildTimeline(this._animConfig, this._scene.nodes);
    this._tracks = result.tracks;
    this._animatedSlotNodeIds = result.animatedSlotNodeIds;
  }

  private _scheduleFrame(): void {
    this._rafId = requestAnimationFrame(now => this._tick(now));
  }

  private _tick(now: number): void {
    if (!this._playing) return;

    const dt = ((now - this._lastFrame) / 1000) * this._speed;
    this._lastFrame = now;

    const dur = this.duration;
    let next = this._time + dt;
    if (next >= dur) {
      if (this._animConfig.loop ?? true) {
        next = next % dur;
      } else {
        next = dur;
        this._playing = false;
        this._emit({ type: 'ended', time: dur });
      }
    }
    this._time = next;

    this._checkChapters();
    this._render();

    if (this._playing) {
      this._scheduleFrame();
    }
  }

  private _checkChapters(): void {
    const active = this.activeChapter;
    const prev = this._lastChapter;

    if (active && active !== prev) {
      if (prev) {
        this._emit({ type: 'chapterExit', chapter: prev, time: this._time });
      }
      this._emit({ type: 'chapterEnter', chapter: active, time: this._time });
      this._lastChapter = active;
    }
  }

  private _emit(event: StarchEvent): void {
    this._onEvent?.(event);
    const handlers = this._listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) handler(event);
    }
    const allHandlers = this._listeners.get('event');
    if (allHandlers) {
      for (const handler of allHandlers) handler(event);
    }
  }

  private _render(): void {
    const values = evaluateAllTracks(this._tracks, this._time);
    const animated = applyTrackValues(this._scene.nodes, values);
    measureTextNodes(animated, getTextMeasurer());
    runLayout(animated, this._animatedSlotNodeIds);

    // Compute viewbox from camera or auto-fit
    let viewBox: ViewBox | undefined;
    const cameraNode = findActiveCamera(animated);
    if (cameraNode) {
      viewBox = computeViewBox(cameraNode, { x: 0, y: 0, ...this._viewport });
    } else {
      viewBox = this._computeAutoFit(animated);
    }

    emitFrame(this._backend, animated, animated, viewBox);
  }

  private _computeAutoFit(nodes: Node[]): ViewBox | undefined {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const addBounds = (nodeList: Node[], parentX: number, parentY: number) => {
      for (const n of nodeList) {
        if (n.camera) continue;
        const px = parentX + (n.transform?.x ?? 0);
        const py = parentY + (n.transform?.y ?? 0);
        let w = 0, h = 0;
        if (n.rect) { w = n.rect.w; h = n.rect.h; }
        else if (n.ellipse) { w = n.ellipse.rx * 2; h = n.ellipse.ry * 2; }
        else if (n.text && n._measured) { w = n._measured.width; h = n._measured.height; }
        else if (n.text) { w = (n.text.content?.length ?? 0) * (n.text.size ?? 14) * 0.6; h = (n.text.size ?? 14); }
        if (n.path?.points?.length) {
          for (const [ptx, pty] of n.path.points) {
            minX = Math.min(minX, px + ptx);
            minY = Math.min(minY, py + pty);
            maxX = Math.max(maxX, px + ptx);
            maxY = Math.max(maxY, py + pty);
          }
        }
        if (w > 0 || h > 0) {
          minX = Math.min(minX, px - w / 2);
          minY = Math.min(minY, py - h / 2);
          maxX = Math.max(maxX, px + w / 2);
          maxY = Math.max(maxY, py + h / 2);
        }
        if (n.children.length) addBounds(n.children, px, py);
      }
    };

    addBounds(nodes, 0, 0);
    if (minX === Infinity) return undefined;

    const margin = 30;
    return {
      x: minX - margin,
      y: minY - margin,
      w: (maxX - minX) + margin * 2,
      h: (maxY - minY) + margin * 2,
    };
  }
}
