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
import { parseDsl } from '../dsl/parser';
import { generateDsl } from '../dsl/generator';
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

  // View format: JSON5 is always canonical in _text; DSL is a generated view
  private _viewFormat: 'json5' | 'dsl' = 'json5';

  // Last successfully parsed raw scene data (for DSL generation)
  private _lastValidRaw: any = null;

  constructor(debounceMs = 100) {
    this._debounceMs = debounceMs;
  }

  // ── Getters ──

  get realModel(): ModelState { return this._realModel; }
  get text(): string { return this._text; }
  get validationErrors(): ZodError | null { return this._validationErrors; }
  get viewFormat(): 'json5' | 'dsl' { return this._viewFormat; }

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

  // ── View Format (DSL ↔ JSON5) ──

  setViewFormat(format: 'json5' | 'dsl'): void {
    this._viewFormat = format;
  }

  /** Generate DSL text from the last valid model. */
  getDslText(): string {
    if (this._lastValidRaw) {
      return generateDsl(this._lastValidRaw);
    }
    // Fallback: try to parse current JSON5 text
    try {
      const raw = JSON5.parse(this._text);
      return generateDsl(raw);
    } catch {
      return '// Unable to generate DSL\n';
    }
  }

  /** Get the display text for the current view format. */
  getDisplayText(): string {
    if (this._viewFormat === 'dsl') {
      return this.getDslText();
    }
    return this._text;
  }

  /**
   * Apply a DSL edit: parse DSL → serialize to JSON5 → update _text → promote.
   * Called when the user edits in DSL mode.
   */
  applyDslEdit(dslText: string): void {
    if (this._updating) return;

    // Debounced: parse DSL, convert to JSON5, then promote
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      try {
        const raw = parseDsl(dslText);
        const json5Text = JSON5.stringify(raw, null, 2);
        this._text = json5Text;
        this._parseAndPromote(json5Text);
      } catch (e) {
        // DSL parse failed — report as validation error but keep last valid model
        if (e instanceof Error) {
          this._validationErrors = null;
          this._emitValidation(null);
        }
      }
    }, this._debounceMs);
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
      // Store raw parsed data for DSL generation
      try {
        this._lastValidRaw = JSON5.parse(text);
      } catch {
        // If text was DSL (not JSON5), parse it as DSL for raw storage
        try {
          this._lastValidRaw = parseDsl(text);
        } catch {
          // Keep previous raw
        }
      }
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
