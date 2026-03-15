import React, { useEffect, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useDiagram } from './components/Diagram';
import type { DiagramProps } from './components/Diagram';
import type { StarchEvent, DiagramHandle } from './core/types';
import { SvgCanvas } from './renderer/svg/SvgCanvas';
import { createRenderObject } from './renderer/renderObject';

// ─── Internal React bridge component ────────────────────────────

interface EmbedBridgeProps extends DiagramProps {
  element: StarchDiagramElement;
}

function EmbedBridge({ element, ...props }: EmbedBridgeProps) {
  const diagram = useDiagram(props);
  const debug = props.debug ?? false;

  // Sync handle methods to the element
  useEffect(() => {
    element._handle = {
      play: diagram.play,
      pause: diagram.pause,
      seek: diagram.seek,
      nextChapter: diagram.nextChapter,
      prevChapter: diagram.prevChapter,
      goToChapter: diagram.goToChapter,
    };
  }, [element, diagram.play, diagram.pause, diagram.seek, diagram.nextChapter, diagram.prevChapter, diagram.goToChapter]);

  // Sync read-only state to the element
  useEffect(() => {
    element._state = {
      time: diagram.time,
      duration: diagram.duration,
      playing: diagram.playing,
      speed: diagram.speed,
      chapters: diagram.chapters,
      activeChapter: diagram.activeChapter,
    };
  }, [element, diagram.time, diagram.duration, diagram.playing, diagram.speed, diagram.chapters, diagram.activeChapter]);

  // Fire custom DOM events for chapter changes
  const lastChapterRef = useRef(diagram.activeChapter);
  useEffect(() => {
    const prev = lastChapterRef.current;
    const current = diagram.activeChapter;
    if (current !== prev) {
      if (prev) {
        const event: StarchEvent = { type: 'chapterExit', chapter: prev, time: diagram.time };
        element.dispatchEvent(new CustomEvent('starch:chapterexit', { detail: event, bubbles: true }));
        element.dispatchEvent(new CustomEvent('starch:event', { detail: event, bubbles: true }));
      }
      if (current) {
        const event: StarchEvent = { type: 'chapterEnter', chapter: current, time: diagram.time };
        element.dispatchEvent(new CustomEvent('starch:chapterenter', { detail: event, bubbles: true }));
        element.dispatchEvent(new CustomEvent('starch:event', { detail: event, bubbles: true }));
      }
      lastChapterRef.current = current;
    }
  }, [diagram.activeChapter, diagram.time, element]);

  // Render using shared utility
  const renderObject = useMemo(
    () => createRenderObject(diagram.animatedProps, diagram.objects, debug),
    [diagram.animatedProps, diagram.objects, debug],
  );

  return (
    <SvgCanvas>
      {diagram.renderOrder.map(([id, obj]) => renderObject(id, obj))}
    </SvgCanvas>
  );
}

// ─── Custom Element ─────────────────────────────────────────────

interface DiagramState {
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  chapters: unknown[];
  activeChapter: unknown;
}

class StarchDiagramElement extends HTMLElement {
  static observedAttributes = ['src', 'autoplay', 'speed', 'debug'];

  _root: Root | null = null;
  _handle: DiagramHandle | null = null;
  _state: DiagramState = {
    time: 0, duration: 0, playing: false, speed: 1, chapters: [], activeChapter: undefined,
  };

  private _dsl = '';
  private _container: HTMLElement | null = null;

  connectedCallback() {
    // Guard against reconnect — shadow root persists after disconnect
    let shadow = this.shadowRoot;
    if (!shadow) {
      shadow = this.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `:host { display: block; width: 100%; height: 400px; }`;
      shadow.appendChild(style);

      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      shadow.appendChild(container);
      this._container = container;
    }

    const container = this._container || shadow.querySelector('div');
    if (!container) return;

    const src = this.getAttribute('src');
    if (src) {
      this._fetchAndMount(src, container as HTMLElement);
    } else {
      this._dsl = this.textContent?.trim() || '';
      this._mount(container as HTMLElement);
    }
  }

  disconnectedCallback() {
    this._root?.unmount();
    this._root = null;
    this._handle = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (!this._root) return;

    // Re-fetch DSL if src changes
    if (name === 'src' && newValue && newValue !== oldValue) {
      const container = this._container || this.shadowRoot?.querySelector('div');
      if (container) {
        this._fetchAndMount(newValue, container as HTMLElement);
      }
      return;
    }

    this._render();
  }

  private _fetchAndMount(src: string, container: HTMLElement) {
    fetch(src)
      .then((r) => r.text())
      .then((dsl) => {
        this._dsl = dsl;
        this._mount(container);
      })
      .catch((err) => console.error('[starch-diagram] Failed to fetch src:', err));
  }

  private _mount(container: HTMLElement) {
    if (!this._root) {
      this._root = createRoot(container);
    }
    this._render();
  }

  private _render() {
    if (!this._root) return;

    const props: DiagramProps = {
      dsl: this._dsl,
      autoplay: this.hasAttribute('autoplay'),
      speed: parseFloat(this.getAttribute('speed') || '1') || 1,
      debug: this.hasAttribute('debug'),
    };

    this._root.render(
      React.createElement(EmbedBridge, { ...props, element: this }),
    );
  }

  // ── Imperative API ──

  play() { this._handle?.play(); }
  pause() { this._handle?.pause(); }
  seek(time: number) { this._handle?.seek(time); }
  nextChapter() { this._handle?.nextChapter(); }
  prevChapter() { this._handle?.prevChapter(); }
  goToChapter(id: string) { this._handle?.goToChapter(id); }

  // ── Read-only state getters ──

  get time() { return this._state.time; }
  get duration() { return this._state.duration; }
  get playing() { return this._state.playing; }
  get speed() { return this._state.speed; }
  get chapters() { return this._state.chapters; }
  get activeChapter() { return this._state.activeChapter; }
}

// TypeScript support for the custom element
declare global {
  interface HTMLElementTagNameMap {
    'starch-diagram': StarchDiagramElement;
  }
}

if (!customElements.get('starch-diagram')) {
  customElements.define('starch-diagram', StarchDiagramElement);
}
