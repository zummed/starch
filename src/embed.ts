import { StarchDiagram } from './StarchDiagram';
import type { DiagramHandle, Chapter, StarchEvent } from './core/types';

class StarchDiagramElement extends HTMLElement {
  static observedAttributes = ['src', 'autoplay', 'speed', 'debug'];

  private _diagram: StarchDiagram | null = null;
  private _container: HTMLElement | null = null;

  connectedCallback() {
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
      const dsl = this.textContent?.trim() || '';
      this._mount(container as HTMLElement, dsl);
    }
  }

  disconnectedCallback() {
    this._diagram?.destroy();
    this._diagram = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (!this._diagram) return;

    if (name === 'src' && newValue && newValue !== oldValue) {
      fetch(newValue)
        .then((r) => r.text())
        .then((dsl) => this._diagram?.setDSL(dsl))
        .catch((err) => console.error('[starch-diagram] Failed to fetch src:', err));
      return;
    }

    if (name === 'speed') {
      this._diagram.setSpeed(parseFloat(newValue || '1') || 1);
    } else if (name === 'debug') {
      this._diagram.setDebug(newValue !== null);
    }
  }

  private _fetchAndMount(src: string, container: HTMLElement) {
    fetch(src)
      .then((r) => r.text())
      .then((dsl) => this._mount(container, dsl))
      .catch((err) => console.error('[starch-diagram] Failed to fetch src:', err));
  }

  private _mount(container: HTMLElement, dsl: string) {
    if (this._diagram) {
      this._diagram.setDSL(dsl);
      return;
    }

    this._diagram = new StarchDiagram(container, {
      dsl,
      autoplay: this.hasAttribute('autoplay'),
      speed: parseFloat(this.getAttribute('speed') || '1') || 1,
      debug: this.hasAttribute('debug'),
      onEvent: (event: StarchEvent) => {
        this.dispatchEvent(new CustomEvent(`starch:${event.type.toLowerCase()}`, { detail: event, bubbles: true }));
        this.dispatchEvent(new CustomEvent('starch:event', { detail: event, bubbles: true }));
      },
    });
  }

  // ── Imperative API ──

  play() { this._diagram?.play(); }
  pause() { this._diagram?.pause(); }
  seek(time: number) { this._diagram?.seek(time); }
  nextChapter() { this._diagram?.nextChapter(); }
  prevChapter() { this._diagram?.prevChapter(); }
  goToChapter(id: string) { this._diagram?.goToChapter(id); }

  // ── Read-only state getters ──

  get time() { return this._diagram?.time ?? 0; }
  get duration() { return this._diagram?.duration ?? 0; }
  get playing() { return this._diagram?.playing ?? false; }
  get speed() { return this._diagram?.speed ?? 1; }
  get chapters() { return this._diagram?.chapters ?? []; }
  get activeChapter() { return this._diagram?.activeChapter; }
}

declare global {
  interface HTMLElementTagNameMap {
    'starch-diagram': StarchDiagramElement;
  }
}

if (!customElements.get('starch-diagram')) {
  customElements.define('starch-diagram', StarchDiagramElement);
}
