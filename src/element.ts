/**
 * `<starch-diagram>` custom element.
 * Wraps StarchDiagram with a shadow-DOM host, playback controls, an error
 * overlay, and attribute/DOM-property driven DSL loading.
 */
import { StarchDiagram } from './StarchDiagram';
import type { StarchEvent, LoadResult } from './StarchDiagram';
import { buildEditUrl, PLAYGROUND_URL, isPlaygroundMessage } from './editing';

export class StarchDiagramElement extends HTMLElement {
  static observedAttributes = ['src', 'autoplay', 'speed', 'editable', 'edit-url'];

  private _diagram: StarchDiagram | null = null;
  private _container: HTMLElement | null = null;
  private _playBtn: HTMLElement | null = null;
  private _editBtn: HTMLElement | null = null;
  private _errorOverlay: HTMLElement | null = null;

  /** The last DSL applied (via textContent, src fetch, or setDSL/dsl). */
  private _dsl: string | null = null;
  /** DSL set before the diagram exists yet — applied once mounted, taking precedence over textContent. */
  private _pendingDsl: string | null = null;

  /** The popup window opened by the edit button, if one is currently open. */
  private _editPopup: Window | null = null;
  private _onMessage = (event: MessageEvent) => {
    if (!this._editPopup || event.source !== this._editPopup) return;
    if (!isPlaygroundMessage(event.data)) return;

    if (event.data.type === 'save') {
      const result = this.setDSL(event.data.dsl);
      if (result?.ok) {
        this.dispatchEvent(new CustomEvent('starch:edit', { detail: { dsl: event.data.dsl }, bubbles: true }));
      }
      return;
    }

    if (event.data.type === 'cancel') {
      this._editPopup = null;
      return;
    }

    // 'ready': the popup gets its DSL via the URL hash; no init reply needed.
  };

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
        .starch-error {
          display: none;
          position: absolute; top: 0; left: 0; right: 0;
          padding: 8px;
          font-family: monospace; font-size: 12px;
          color: #f87171;
          background: rgba(20, 4, 4, 0.85);
          white-space: pre-wrap;
          pointer-events: none;
        }
      `;
      shadow.appendChild(style);

      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      shadow.appendChild(container);
      this._container = container;

      const errorOverlay = document.createElement('div');
      errorOverlay.className = 'starch-error';
      shadow.appendChild(errorOverlay);
      this._errorOverlay = errorOverlay;

      // Playback controls
      const controls = document.createElement('div');
      controls.className = 'starch-controls';

      const editBtn = document.createElement('button');
      editBtn.className = 'starch-btn';
      editBtn.innerHTML = '&#9998;';
      editBtn.title = 'Edit';
      editBtn.addEventListener('click', () => {
        this._openEditor();
      });
      this._editBtn = editBtn;

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

    // Initial state for the editable button: attributeChangedCallback may
    // have fired for a pre-existing `editable` attribute before the shadow
    // DOM (and thus the button) existed, so sync explicitly here too.
    this._syncEditButton();

    window.addEventListener('message', this._onMessage);

    const container = this._container || shadow.querySelector('div');
    if (!container) return;

    const src = this.getAttribute('src');
    if (src) {
      this._fetchAndMount(src, container as HTMLElement);
    } else {
      // Defer: connectedCallback fires before child text nodes are parsed.
      // _dsl covers re-connects (e.g. the element moved in the DOM) where a
      // property-set DSL never existed as text content.
      requestAnimationFrame(() => {
        const dsl = this._pendingDsl ?? this._dsl ?? (this.textContent?.trim() || '');
        this._mount(container as HTMLElement, dsl);
      });
    }
  }

  disconnectedCallback() {
    window.removeEventListener('message', this._onMessage);
    this._diagram?.destroy();
    this._diagram = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === 'editable') {
      this._syncEditButton();
      return;
    }
    if (name === 'edit-url') {
      // Read lazily (via getAttribute) when building the edit URL; nothing to sync here.
      return;
    }

    if (!this._diagram) return;

    if (name === 'src' && newValue && newValue !== oldValue) {
      fetch(newValue)
        .then(r => r.text())
        .then(dsl => this.setDSL(dsl))
        .catch(err => {
          console.error('[starch-diagram] Failed to fetch src:', err);
          this._showError(`Failed to fetch src: ${err}`);
        });
      return;
    }

    if (name === 'speed') {
      this._diagram.setSpeed(parseFloat(newValue || '1') || 1);
      return;
    }

    if (name === 'autoplay') {
      if (newValue !== null) {
        this.play();
      } else {
        this.pause();
      }
    }
  }

  private _fetchAndMount(src: string, container: HTMLElement) {
    fetch(src)
      .then(r => r.text())
      .then(dsl => this._mount(container, dsl))
      .catch(err => {
        console.error('[starch-diagram] Failed to fetch src:', err);
        this._showError(`Failed to fetch src: ${err}`);
      });
  }

  private _mount(container: HTMLElement, dsl: string) {
    if (this._diagram) {
      this.setDSL(dsl);
      return;
    }

    this._diagram = new StarchDiagram(container, {
      autoplay: this.hasAttribute('autoplay'),
      speed: parseFloat(this.getAttribute('speed') || '1') || 1,
      onEvent: (event: StarchEvent) => {
        this.dispatchEvent(new CustomEvent(`starch:${event.type.toLowerCase()}`, { detail: event, bubbles: true }));
        this.dispatchEvent(new CustomEvent('starch:event', { detail: event, bubbles: true }));
        this._updatePlayBtn();
      },
    });

    // Subscribe before the first load, so a parse failure on the initial
    // DSL shows the overlay the same way a later setDSL() failure does —
    // every load (initial or not) goes through setDSL() below.
    this._diagram.on('error', (event: StarchEvent) => {
      this._showError(event.message ?? 'Unknown error');
    });

    this.setDSL(dsl);
    this._updatePlayBtn();
  }

  private _updatePlayBtn() {
    if (!this._playBtn || !this._diagram) return;
    this._playBtn.innerHTML = this._diagram.playing ? '&#9646;&#9646;' : '&#9654;';
    this._playBtn.title = this._diagram.playing ? 'Pause' : 'Play';
  }

  private _showError(message: string) {
    if (!this._errorOverlay) return;
    this._errorOverlay.textContent = message;
    this._errorOverlay.style.display = 'block';
  }

  private _hideError() {
    if (!this._errorOverlay) return;
    this._errorOverlay.style.display = 'none';
  }

  /** Adds/removes the edit button from the controls, matching the `editable` attribute. */
  private _syncEditButton() {
    const editBtn = this._editBtn;
    const controls = this.shadowRoot?.querySelector('.starch-controls');
    if (!editBtn || !controls) return;

    const shouldShow = this.hasAttribute('editable');
    const isShown = editBtn.parentElement === controls;
    if (shouldShow && !isShown) {
      controls.insertBefore(editBtn, controls.firstChild);
    } else if (!shouldShow && isShown) {
      editBtn.remove();
    }
  }

  private _openEditor() {
    const dsl = this.dsl ?? this.textContent?.trim() ?? '';
    if (!dsl) {
      this._showError('Nothing to edit yet');
      return;
    }

    const url = buildEditUrl(dsl, this.getAttribute('edit-url') ?? PLAYGROUND_URL);
    let popup = window.open(url, 'starch-edit', 'popup,width=1280,height=860');
    if (!popup) {
      // Popup features blocked (e.g. by a popup blocker) — retry as a plain tab.
      popup = window.open(url, 'starch-edit');
    }
    if (!popup) {
      this._showError('Could not open the playground editor. Check your popup blocker.');
      return;
    }
    this._editPopup = popup;
  }

  // ── Imperative API ──

  play() { this._diagram?.play(); this._updatePlayBtn(); }
  pause() { this._diagram?.pause(); this._updatePlayBtn(); }
  seek(time: number) { this._diagram?.seek(time); }
  nextChapter() { this._diagram?.nextChapter(); }
  prevChapter() { this._diagram?.prevChapter(); }
  goToChapter(id: string) { this._diagram?.goToChapter(id); }

  /** Set the DSL. Applies immediately if the diagram is mounted; otherwise applied on mount. Returns the LoadResult once mounted, undefined if deferred. */
  setDSL(dsl: string): LoadResult | undefined {
    this._dsl = dsl;
    if (!this._diagram) {
      this._pendingDsl = dsl;
      return undefined;
    }
    this._pendingDsl = null;
    const result = this._diagram.setDSL(dsl);
    if (result.ok) {
      this._hideError();
    } else {
      this._showError(result.error);
    }
    return result;
  }

  get dsl(): string | null { return this._dsl; }
  set dsl(value: string) { this.setDSL(value); }

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
