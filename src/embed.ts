/**
 * Self-contained embed entry point.
 * Registers <starch-diagram> custom element for use in any webpage.
 *
 * Usage:
 *   <script src="starch-embed.iife.js"></script>
 *   <starch-diagram autoplay>
 *     box "hello" at 100 100
 *   </starch-diagram>
 */
import { StarchDiagram } from './StarchDiagram';
import type { StarchEvent } from './StarchDiagram';

class StarchDiagramElement extends HTMLElement {
  static observedAttributes = ['src', 'autoplay', 'speed'];

  private _diagram: StarchDiagram | null = null;
  private _container: HTMLElement | null = null;
  private _playBtn: HTMLElement | null = null;

  connectedCallback() {
    let shadow = this.shadowRoot;
    if (!shadow) {
      shadow = this.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        :host { display: block; width: 100%; height: 400px; position: relative; }
        .starch-controls {
          position: absolute; bottom: 8px; right: 8px;
          display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;
          pointer-events: none;
        }
        :host(:hover) .starch-controls { opacity: 1; pointer-events: auto; }
        .starch-btn {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(14, 17, 23, 0.8); border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; line-height: 1; padding: 0;
          transition: background 0.15s, color 0.15s;
        }
        .starch-btn:hover { background: rgba(14, 17, 23, 0.95); color: rgba(255,255,255,0.9); }
      `;
      shadow.appendChild(style);

      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      shadow.appendChild(container);
      this._container = container;

      // Playback controls
      const controls = document.createElement('div');
      controls.className = 'starch-controls';

      const restartBtn = document.createElement('button');
      restartBtn.className = 'starch-btn';
      restartBtn.innerHTML = '&#8634;';
      restartBtn.title = 'Restart';
      restartBtn.addEventListener('click', () => {
        this._diagram?.seek(0);
        this._diagram?.play();
        this._updatePlayBtn();
      });

      const playBtn = document.createElement('button');
      playBtn.className = 'starch-btn';
      playBtn.innerHTML = '&#9654;';
      playBtn.title = 'Play';
      playBtn.addEventListener('click', () => {
        if (!this._diagram) return;
        if (this._diagram.playing) {
          this._diagram.pause();
        } else {
          if (this._diagram.time >= this._diagram.duration - 0.01) {
            this._diagram.seek(0);
          }
          this._diagram.play();
        }
        this._updatePlayBtn();
      });
      this._playBtn = playBtn;

      controls.appendChild(restartBtn);
      controls.appendChild(playBtn);
      shadow.appendChild(controls);
    }

    const container = this._container || shadow.querySelector('div');
    if (!container) return;

    const src = this.getAttribute('src');
    if (src) {
      this._fetchAndMount(src, container as HTMLElement);
    } else {
      // Defer: connectedCallback fires before child text nodes are parsed
      requestAnimationFrame(() => {
        const dsl = this.textContent?.trim() || '';
        this._mount(container as HTMLElement, dsl);
      });
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
        .then(r => r.text())
        .then(dsl => this._diagram?.setDSL(dsl))
        .catch(err => console.error('[starch-diagram] Failed to fetch src:', err));
      return;
    }

    if (name === 'speed') {
      this._diagram.setSpeed(parseFloat(newValue || '1') || 1);
    }
  }

  private _fetchAndMount(src: string, container: HTMLElement) {
    fetch(src)
      .then(r => r.text())
      .then(dsl => this._mount(container, dsl))
      .catch(err => console.error('[starch-diagram] Failed to fetch src:', err));
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
      onEvent: (event: StarchEvent) => {
        this.dispatchEvent(new CustomEvent(`starch:${event.type.toLowerCase()}`, { detail: event, bubbles: true }));
        this.dispatchEvent(new CustomEvent('starch:event', { detail: event, bubbles: true }));
        this._updatePlayBtn();
      },
    });

    this._updatePlayBtn();
  }

  private _updatePlayBtn() {
    if (!this._playBtn || !this._diagram) return;
    this._playBtn.innerHTML = this._diagram.playing ? '&#9646;&#9646;' : '&#9654;';
    this._playBtn.title = this._diagram.playing ? 'Pause' : 'Play';
  }

  // ── Imperative API ──

  play() { this._diagram?.play(); this._updatePlayBtn(); }
  pause() { this._diagram?.pause(); this._updatePlayBtn(); }
  seek(time: number) { this._diagram?.seek(time); }
  nextChapter() { this._diagram?.nextChapter(); }
  prevChapter() { this._diagram?.prevChapter(); }
  goToChapter(id: string) { this._diagram?.goToChapter(id); }

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
