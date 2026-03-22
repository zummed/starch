/**
 * ModelManager: coordinates the model lifecycle.
 * - Holds real model (valid Node[]) and staging state
 * - Text input flows through staging → validation → promotion
 * - Direct model mutations (from popups) re-serialize to text
 * - Canvas always renders the real model
 */
import JSON5 from 'json5';
import type { Node, NodeInput } from '../types/node';
import type { AnimConfig } from '../types/animation';
import { parseScene, type ParsedScene } from '../parser/parser';
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
type ValidationCallback = (errors: ZodError | null) => void;

const EMPTY_STATE: ModelState = {
  nodes: [],
  styles: {},
  trackPaths: [],
};

export class ModelManager {
  private _realModel: ModelState = EMPTY_STATE;
  private _text = '';
  private _validationErrors: ZodError | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceMs: number;

  private _modelListeners = new Set<ModelChangeCallback>();
  private _textListeners = new Set<TextChangeCallback>();
  private _validationListeners = new Set<ValidationCallback>();

  // Track whether the last change came from text or model to avoid loops
  private _updating = false;

  constructor(debounceMs = 100) {
    this._debounceMs = debounceMs;
  }

  // ── Getters ──

  get realModel(): ModelState { return this._realModel; }
  get text(): string { return this._text; }
  get validationErrors(): ZodError | null { return this._validationErrors; }

  // ── Text input (from editor) ──

  setText(text: string): void {
    if (this._updating) return;
    this._text = text;

    // Debounced parse → validate → promote
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._parseAndPromote(text);
    }, this._debounceMs);
  }

  /** Immediate parse without debounce (for initial load, sample selection) */
  setTextImmediate(text: string): void {
    if (this._updating) return;
    this._text = text;
    this._emitText(text);
    this._parseAndPromote(text);
  }

  // ── Direct model mutation (from popups, visual builder) ──

  updateProperty(path: string, value: unknown): void {
    // Parse current text, apply the change, re-serialize
    try {
      const raw = JSON5.parse(this._text);
      setNestedValue(raw, path.split('.'), value);
      const newText = JSON5.stringify(raw, null, 2);
      this._updating = true;
      this._text = newText;
      this._emitText(newText);
      this._parseAndPromote(newText);
      this._updating = false;
    } catch {
      // If current text is invalid, ignore the mutation
    }
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

  private _parseAndPromote(text: string): void {
    try {
      const scene = parseScene(text);
      this._realModel = {
        nodes: scene.nodes,
        styles: scene.styles,
        animate: scene.animate,
        background: scene.background,
        viewport: scene.viewport,
        images: scene.images,
        trackPaths: scene.trackPaths,
      };
      this._validationErrors = null;
      this._emitValidation(null);
      this._emitModel(this._realModel);
    } catch (e) {
      // Parse failed — keep last valid model, report error
      if (e instanceof Error && 'issues' in e) {
        this._validationErrors = e as unknown as ZodError;
        this._emitValidation(this._validationErrors);
      } else {
        // JSON5 parse error or other
        this._validationErrors = null;
        this._emitValidation(null);
      }
    }
  }

  private _emitModel(state: ModelState): void {
    for (const cb of this._modelListeners) cb(state);
  }

  private _emitText(text: string): void {
    for (const cb of this._textListeners) cb(text);
  }

  private _emitValidation(errors: ZodError | null): void {
    for (const cb of this._validationListeners) cb(errors);
  }
}

// ── Utility ──

function setNestedValue(obj: any, keys: string[], value: unknown): void {
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
