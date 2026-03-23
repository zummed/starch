/**
 * ModelManager: single source of truth for the scene model.
 *
 * Two edit paths:
 *   setText(text, format) — from editor typing. Parses text, updates _json and _model.
 *                           Does NOT emit textChange (editor already has the text).
 *   updateProperty(path, value) — from popups. Mutates _json, regenerates text,
 *                                  emits both modelChange and textChange.
 */
import JSON5 from 'json5';
import type { Node } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { parseScene } from '../parser/parser';
import { parseDslWithHints } from '../dsl/parser';
import { generateDsl } from '../dsl/generator';
import type { FormatHints } from '../dsl/formatHints';
import { emptyFormatHints } from '../dsl/formatHints';
import type { ZodError } from 'zod';

export interface ModelState {
  nodes: Node[];
  styles: Record<string, any>;
  animate?: AnimConfig;
  background?: string;
  viewport?: string | { width: number; height: number };
  images?: Record<string, string>;
  trackPaths: string[];
}

type ModelChangeCallback = (state: ModelState) => void;
type TextChangeCallback = (text: string) => void;
type ValidationCallback = (errors: ZodError | Error | null) => void;

const EMPTY_STATE: ModelState = {
  nodes: [],
  styles: {},
  trackPaths: [],
};

export class ModelManager {
  private _json: any = {};
  private _model: ModelState = EMPTY_STATE;
  private _formatHints: FormatHints = emptyFormatHints();
  private _viewFormat: 'json5' | 'dsl' = 'json5';

  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceMs: number;

  private _modelListeners = new Set<ModelChangeCallback>();
  private _textListeners = new Set<TextChangeCallback>();
  private _validationListeners = new Set<ValidationCallback>();

  constructor(debounceMs = 100) {
    this._debounceMs = debounceMs;
  }

  // ── Getters ──

  get json(): any { return this._json; }
  get formatHints(): FormatHints { return this._formatHints; }
  get realModel(): ModelState { return this._model; }
  get viewFormat(): 'json5' | 'dsl' { return this._viewFormat; }

  // ── setText (from editor typing) — debounced, does NOT emit textChange ──

  setText(text: string, format: 'json5' | 'dsl'): void {
    if (this._debounceMs === 0) {
      this._processText(text, format);
      return;
    }
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._processText(text, format);
    }, this._debounceMs);
  }

  /** Immediate parse without debounce (for initial load before listeners exist). */
  setTextImmediate(text: string, format: 'json5' | 'dsl'): void {
    this._processText(text, format);
  }

  /** Load new content into an already-connected ModelManager.
   *  Processes text AND emits textChange so the editor updates. */
  loadText(text: string, format: 'json5' | 'dsl'): void {
    this._processText(text, format);
    this._emitText(this.getDisplayText());
  }

  // ── updateProperty (from popups) — mutates _json, emits modelChange + textChange ──

  updateProperty(path: string, value: unknown): void {
    // If _json is empty, no-op
    if (this._json == null || Object.keys(this._json).length === 0) return;

    setNestedValue(this._json, path.split('.'), value);

    try {
      const jsonStr = JSON5.stringify(this._json, null, 2);
      const scene = parseScene(jsonStr);
      this._model = {
        nodes: scene.nodes,
        styles: scene.styles,
        animate: scene.animate,
        background: scene.background,
        viewport: scene.viewport,
        images: scene.images,
        trackPaths: scene.trackPaths,
      };
      this._emitModel(this._model);
      this._emitText(this.getDisplayText());
    } catch (e) {
      // If parse fails after mutation, still emit textChange so editor updates
      this._emitText(this.getDisplayText());
    }
  }

  // ── View Format ──

  setViewFormat(format: 'json5' | 'dsl'): void {
    this._viewFormat = format;
    this._emitText(this.getDisplayText());
  }

  // ── Display Text ──

  getDisplayText(): string {
    if (this._viewFormat === 'dsl') {
      return generateDsl(this._json, { formatHints: this._formatHints });
    }
    return JSON5.stringify(this._json, null, 2);
  }

  // ── Events ──

  onModelChange(callback: ModelChangeCallback): () => void {
    this._modelListeners.add(callback);
    return () => this._modelListeners.delete(callback);
  }

  onTextChange(callback: TextChangeCallback): () => void {
    this._textListeners.add(callback);
    return () => this._textListeners.delete(callback);
  }

  onValidationChange(callback: ValidationCallback): () => void {
    this._validationListeners.add(callback);
    return () => this._validationListeners.delete(callback);
  }

  // ── Cleanup ──

  destroy(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._modelListeners.clear();
    this._textListeners.clear();
    this._validationListeners.clear();
  }

  // ── Internal ──

  private _processText(text: string, format: 'json5' | 'dsl'): void {
    // Auto-detect: if text starts with {, it's JSON5 regardless of format parameter.
    // This matches parseScene's auto-detection and handles samples/loads that
    // may contain JSON5 text even when the view format is set to DSL.
    const actualFormat = text.trim().startsWith('{') ? 'json5' : format;
    try {
      if (actualFormat === 'json5') {
        const parsed = JSON5.parse(text);
        this._json = parsed;
        // json5 path does NOT update formatHints
      } else {
        // DSL path: parse with hints
        const { scene, formatHints } = parseDslWithHints(text);
        this._json = scene;
        this._formatHints = formatHints;
      }

      // parseScene expects a string — serialize _json
      const jsonStr = JSON5.stringify(this._json, null, 2);
      const scene = parseScene(jsonStr);
      this._model = {
        nodes: scene.nodes,
        styles: scene.styles,
        animate: scene.animate,
        background: scene.background,
        viewport: scene.viewport,
        images: scene.images,
        trackPaths: scene.trackPaths,
      };

      this._emitValidation(null);
      this._emitModel(this._model);
    } catch (e) {
      // Parse failed — keep last valid _model and _formatHints
      if (e instanceof Error) {
        this._emitValidation(e);
      }
    }
  }

  private _emitModel(state: ModelState): void {
    for (const cb of this._modelListeners) cb(state);
  }

  private _emitText(text: string): void {
    for (const cb of this._textListeners) cb(text);
  }

  private _emitValidation(errors: ZodError | Error | null): void {
    for (const cb of this._validationListeners) cb(errors);
  }
}

// ── Utilities ──

export function setNestedValue(obj: any, keys: string[], value: unknown): void {
  if (keys.length === 0) return;
  if (keys.length === 1) {
    obj[keys[0]] = value;
    return;
  }
  const [head, ...rest] = keys;
  if (!(head in obj) || typeof obj[head] !== 'object') {
    obj[head] = {};
  }
  setNestedValue(obj[head], rest, value);
}

export function getNestedValue(obj: any, path: string): unknown {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}
