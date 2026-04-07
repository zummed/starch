/**
 * Click-to-edit popup plugin.
 *
 * When the user clicks on a value in the DSL, this plugin detects the
 * schema type at that position and shows the appropriate widget popup
 * (ColorPicker, NumberSlider, EnumDropdown, etc.).
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createRoot, type Root } from 'react-dom/client';
import { createElement, useState, useCallback, useRef, type ReactElement } from 'react';
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { type AstNode, nodeAt, findCompound } from '../../dsl/astTypes';
import {
  getPropertySchema,
  getAvailableProperties,
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
  getSchemaDefault,
  DocumentSchema,
  unwrap,
  type SchemaType,
} from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { getShapeDefinition, listSets } from '../../templates/registry';
import type { z } from 'zod';
import { getDsl } from '../../dsl/dslMeta';

/**
 * Resolve a template prop schema from a `tplprops:templateName.propName` path.
 *
 * Template names can be unqualified (`box`) or qualified (`core.box`).
 * For unqualified names, we search all registered shape sets.
 */
function resolveTemplatePropSchema(schemaPath: string): z.ZodType | null {
  // The schemaPath format is: tplprops:<templateName>.<propName>
  // After localSchemaPath strips "objects.", we get something like:
  //   tplprops:box.w  or  tplprops:core.box.w
  const tplMatch = schemaPath.match(/^tplprops:(.+)\.(\w+)$/);
  if (!tplMatch) return null;

  const templateName = tplMatch[1];
  const propName = tplMatch[2];

  // Try qualified name first: "setName.shapeName"
  if (templateName.includes('.')) {
    const dotIdx = templateName.indexOf('.');
    const setName = templateName.slice(0, dotIdx);
    const shapeName = templateName.slice(dotIdx + 1);
    const def = getShapeDefinition(setName, shapeName);
    if (def) {
      const propSchema = (def.props as any).shape?.[propName];
      if (propSchema) return propSchema;
    }
    return null;
  }

  // Unqualified name: search all sets
  for (const set of listSets()) {
    const def = set.shapes.get(templateName);
    if (def) {
      const propSchema = (def.props as any).shape?.[propName];
      if (propSchema) return propSchema;
    }
  }
  return null;
}

/** Resolve a schema path against NodeSchema first, then DocumentSchema, then template props. */
function resolvePropertySchema(path: string): z.ZodType | null {
  return getPropertySchema(path, NodeSchema)
    ?? getPropertySchema(path, DocumentSchema)
    ?? resolveTemplatePropSchema(path);
}

/** List available properties at a path, trying both roots. */
function resolveAvailableProperties(path: string) {
  const nodeProps = getAvailableProperties(path, NodeSchema);
  if (nodeProps.length > 0) return nodeProps;
  return getAvailableProperties(path, DocumentSchema);
}
import type { Color } from '../../types/properties';
import { ColorPicker } from '../views/widgets/ColorPicker';
import { NumberSlider } from '../views/widgets/NumberSlider';
import { EnumDropdown } from '../views/widgets/EnumDropdown';
import { AnchorEditor } from '../views/widgets/AnchorEditor';

/** Serialize a Color value to DSL text. */
function colorToDsl(color: Color): string {
  if (typeof color === 'string') return color; // named or hex
  if (typeof color === 'object' && color !== null) {
    if ('h' in color && 's' in color && 'l' in color) {
      const c = color as { h: number; s: number; l: number; a?: number };
      return c.a !== undefined ? `hsl ${c.h} ${c.s} ${c.l} a=${c.a}` : `hsl ${c.h} ${c.s} ${c.l}`;
    }
    if ('r' in color && 'g' in color && 'b' in color) {
      const c = color as { r: number; g: number; b: number; a?: number };
      return c.a !== undefined ? `rgb ${c.r} ${c.g} ${c.b} a=${c.a}` : `rgb ${c.r} ${c.g} ${c.b}`;
    }
    if ('name' in color) {
      const c = color as { name: string; a?: number };
      return c.a !== undefined ? `${c.name} a=${c.a}` : c.name;
    }
    if ('hex' in color) {
      const c = color as { hex: string; a?: number };
      return c.a !== undefined ? `${c.hex} a=${c.a}` : c.hex;
    }
  }
  return String(color);
}

export const clickPopupKey = new PluginKey('clickPopup');

/** Offset from ProseMirror position to text position. */
const PM_OFFSET = 1;

interface PopupState {
  active: boolean;
  schemaType: SchemaType;
  schemaPath: string;
  value: unknown;
  from: number;  // PM position of the value start
  to: number;    // PM position of the value end
  coords: { left: number; top: number };
}

const EMPTY: PopupState = {
  active: false, schemaType: 'unknown', schemaPath: '',
  value: undefined, from: 0, to: 0, coords: { left: 0, top: 0 },
};

/**
 * Check whether a value's schemaPath corresponds to a key inside a
 * dimension/joined positional hint on the compound.  These values
 * are encoded as a single token (e.g., "100x50") and must not be
 * edited individually — the compound popup handles them as a group.
 */
function isJoinedPositional(compoundSchemaPath: string, valueSchemaPath: string): boolean {
  const schema = resolvePropertySchema(compoundSchemaPath);
  if (!schema) return false;
  const hints = getDsl(unwrap(schema));
  if (!hints?.positional) return false;

  const prefix = compoundSchemaPath + '.';
  if (!valueSchemaPath.startsWith(prefix)) return false;
  const key = valueSchemaPath.slice(prefix.length);

  return hints.positional.some(hint =>
    (hint.format === 'dimension' || hint.format === 'joined') &&
    hint.keys.includes(key),
  );
}

/**
 * Find a direct value child whose schemaPath matches the compound's.
 * This identifies "whole value" nodes (e.g., "red" in "fill red" has
 * schemaPath='fill', same as the compound) vs sub-component nodes
 * (e.g., "255" in "fill rgb 255 0 0" has schemaPath='fill.r').
 */
function findDirectValue(compound: AstNode, schemaPath: string): AstNode | null {
  for (const child of compound.children) {
    if (child.dslRole === 'value' && child.schemaPath === schemaPath) return child;
  }
  return null;
}

/** Find a kwarg-value descendant with the given schemaPath inside a compound. */
function findKwargValue(compound: AstNode, schemaPath: string): AstNode | null {
  for (const child of compound.children) {
    if (child.dslRole === 'kwarg-value' && child.schemaPath === schemaPath) return child;
    const found = findKwargValue(child, schemaPath);
    if (found) return found;
  }
  return null;
}

function detectPopupAt(view: EditorView, pmPos: number): PopupState | null {
  const text = view.state.doc.textContent;
  const textPos = pmPos - PM_OFFSET;
  if (textPos < 0 || textPos >= text.length) return null;

  let ast;
  try {
    const { ast: ctx } = walkDocument(text);
    ast = leavesToAst(ctx.astLeaves(), text.length);
  } catch {
    return null;
  }

  const node = nodeAt(ast, textPos);
  if (!node) return null;

  // For keywords and compounds, use the node's own schemaPath
  // For values, walk up to the compound ancestor
  let schemaPath: string;
  let rangeFrom: number;
  let rangeTo: number;
  let popupValue: unknown = node.value;

  if (node.dslRole === 'keyword' || node.dslRole === 'compound') {
    schemaPath = node.schemaPath;
    const compound = node.dslRole === 'compound' ? node : findCompound(node);

    // If this compound resolves to a leaf widget type (color, number, enum),
    // clicking the keyword should target just the value portion so the
    // replacement doesn't delete the keyword (e.g., "fill red" → picking
    // blue should produce "fill blue", not just "blue").
    const compSchema = schemaPath ? resolvePropertySchema(schemaPath) : null;
    const compType = compSchema ? detectSchemaType(compSchema) : 'unknown';
    const valueChild = compound && ['color', 'number', 'enum', 'anchor', 'string'].includes(compType)
      ? findDirectValue(compound, schemaPath)
      : null;

    if (valueChild) {
      rangeFrom = valueChild.from;
      rangeTo = valueChild.to;
      popupValue = valueChild.value;
    } else {
      rangeFrom = compound?.from ?? node.from;
      rangeTo = compound?.to ?? node.to;
    }
  } else if (node.dslRole === 'value' || node.dslRole === 'kwarg-value') {
    const compound = findCompound(node);

    // Values that are part of a joined/dimension positional (e.g., "100" in
    // "rect 100x50") must redirect to the compound popup — editing one
    // component alone destroys the joined format.
    if (compound?.schemaPath && isJoinedPositional(compound.schemaPath, node.schemaPath)) {
      schemaPath = compound.schemaPath;
      rangeFrom = compound.from;
      rangeTo = compound.to;
    } else {
      // Prefer the node's own schemaPath when it resolves to a concrete
      // widget type (color, number, enum).  This ensures that e.g. clicking
      // a stroke color value ('stroke.color') opens a ColorPicker instead of
      // the compound-level object popup for 'stroke'.
      const ownSchema = node.schemaPath ? resolvePropertySchema(node.schemaPath) : null;
      const ownType = ownSchema ? detectSchemaType(ownSchema) : 'unknown';
      if (ownType !== 'unknown' && ['color', 'number', 'enum', 'anchor', 'string'].includes(ownType)) {
        schemaPath = node.schemaPath;
      } else if (compound?.schemaPath) {
        schemaPath = compound.schemaPath;
      } else {
        schemaPath = node.schemaPath;
      }
      rangeFrom = node.from;
      rangeTo = node.to;
    }
  } else if (node.dslRole === 'kwarg-key') {
    // Kwarg keys carry their own schemaPath (e.g., template props).
    // Target the sibling kwarg-value so the popup edits the value, not the key name.
    schemaPath = node.schemaPath;
    const compound = findCompound(node);
    const sibling = compound ? findKwargValue(compound, node.schemaPath) : null;
    if (sibling) {
      rangeFrom = sibling.from;
      rangeTo = sibling.to;
      popupValue = sibling.value;
    } else {
      rangeFrom = node.from;
      rangeTo = node.to;
    }
  } else {
    return null;
  }

  if (!schemaPath) return null;

  const schema = resolvePropertySchema(schemaPath);
  if (!schema) return null;

  const schemaType = detectSchemaType(schema);

  // Show popups for types that have widgets
  if (!['color', 'number', 'enum', 'object', 'anchor', 'string'].includes(schemaType)) return null;

  const coords = view.coordsAtPos(rangeFrom + PM_OFFSET);

  return {
    active: true,
    schemaType,
    schemaPath,
    value: popupValue,
    from: rangeFrom + PM_OFFSET,
    to: rangeTo + PM_OFFSET,
    coords: { left: coords.left, top: coords.bottom + 4 },
  };
}

// ---------------------------------------------------------------------------
// Compound popup component — shows sub-properties as editable fields
// ---------------------------------------------------------------------------

interface CompoundPopupProps {
  schemaPath: string;
  currentText: string;
  onReplace: (newText: string) => void;
  onClose: () => void;
}

/**
 * Parse compound DSL text into a map of property name → string value.
 *
 * Uses the schema's DSL hints to map positional values to property names.
 * For example, `stroke red width=2` → { color: 'red', width: '2' }.
 */
function parseCompoundText(text: string, schemaPath: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const tokens = text.split(/\s+/);
  if (tokens.length === 0) return fields;

  // Extract kwargs first
  const kwargTokenIndices = new Set<number>();
  for (let i = 1; i < tokens.length; i++) {
    const eq = tokens[i].indexOf('=');
    if (eq > 0) {
      fields[tokens[i].slice(0, eq)] = tokens[i].slice(eq + 1);
      kwargTokenIndices.add(i);
    }
  }

  // Remaining tokens after keyword are positional
  const positionalTokens: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    if (!kwargTokenIndices.has(i)) positionalTokens.push(tokens[i]);
  }

  // Map positional tokens to properties using DSL hints.
  // unwrap() strips ZodOptional/ZodDefault wrappers so getDsl can find
  // the hints that were registered on the original (unwrapped) schema.
  const schema = resolvePropertySchema(schemaPath);
  const hints = schema ? getDsl(unwrap(schema)) : undefined;

  if (hints?.positional && positionalTokens.length > 0) {
    let tokenIdx = 0;
    for (const hint of hints.positional) {
      if (tokenIdx >= positionalTokens.length) break;
      if (hint.format === 'color') {
        // Color may span multiple tokens (e.g., `rgb 255 0 0` or `hsl 120 50 50`)
        // Consume tokens until we hit another positional hint boundary or run out
        const colorTokens: string[] = [];
        while (tokenIdx < positionalTokens.length) {
          colorTokens.push(positionalTokens[tokenIdx]);
          tokenIdx++;
          // Named/hex colors are single token; rgb/hsl consume 3 more
          const first = colorTokens[0];
          if (first === 'rgb' || first === 'hsl') {
            if (colorTokens.length >= 4) break;
          } else {
            break;
          }
        }
        if (hint.keys.length === 1) {
          fields[hint.keys[0]] = colorTokens.join(' ');
        }
      } else if (hint.format === 'dimension' || hint.format === 'joined') {
        // e.g., "100x50" or "100,200" — single token, multiple keys
        const token = positionalTokens[tokenIdx++];
        const sep = hint.separator || 'x';
        const parts = token.split(sep);
        for (let k = 0; k < hint.keys.length && k < parts.length; k++) {
          fields[hint.keys[k]] = parts[k];
        }
      } else {
        // Default: one token per key
        for (const key of hint.keys) {
          if (tokenIdx < positionalTokens.length) {
            fields[key] = positionalTokens[tokenIdx++];
          }
        }
      }
    }
  } else if (positionalTokens.length > 0) {
    // No hints — store positional tokens under numeric keys as fallback
    positionalTokens.forEach((t, i) => { fields[`_pos${i}`] = t; });
  }

  return fields;
}

/**
 * Rebuild compound DSL text from property values.
 */
function rebuildCompoundText(
  keyword: string,
  fields: Record<string, string>,
  schemaPath: string,
): string {
  const schema = resolvePropertySchema(schemaPath);
  const hints = schema ? getDsl(unwrap(schema)) : undefined;
  const parts: string[] = [keyword];

  const emittedKeys = new Set<string>();

  // Emit positional values in order
  if (hints?.positional) {
    for (const hint of hints.positional) {
      if (hint.format === 'color' && hint.keys.length === 1) {
        const val = fields[hint.keys[0]];
        if (val) { parts.push(val); emittedKeys.add(hint.keys[0]); }
      } else if (hint.format === 'dimension' || hint.format === 'joined') {
        const sep = hint.separator || 'x';
        const vals = hint.keys.map(k => fields[k]).filter(Boolean);
        if (vals.length === hint.keys.length) {
          parts.push(vals.join(sep));
          hint.keys.forEach(k => emittedKeys.add(k));
        }
      } else {
        for (const key of hint.keys) {
          const val = fields[key];
          if (val) { parts.push(val); emittedKeys.add(key); }
        }
      }
    }
  }

  // Emit kwargs
  const kwargNames = hints?.kwargs ?? [];
  // Emit declared kwargs first (in order), then any remaining
  for (const name of kwargNames) {
    const val = fields[name];
    if (val !== undefined && val !== '') {
      parts.push(`${name}=${val}`);
      emittedKeys.add(name);
    }
  }
  // Any remaining fields not yet emitted (shouldn't happen normally)
  for (const [name, val] of Object.entries(fields)) {
    if (!emittedKeys.has(name) && !name.startsWith('_pos') && val !== '') {
      parts.push(`${name}=${val}`);
    }
  }

  return parts.join(' ');
}

function CompoundPopup({ schemaPath, currentText, onReplace, onClose }: CompoundPopupProps) {
  const properties = resolveAvailableProperties(schemaPath);
  const keyword = currentText.split(/\s+/)[0] || schemaPath;

  const [fields, setFields] = useState<Record<string, string>>(() =>
    parseCompoundText(currentText, schemaPath),
  );

  // Throttle onReplace to once per animation frame so rapid slider
  // ticks don't cause a ProseMirror transaction on every call.
  const pendingText = useRef<string | null>(null);
  const rafId = useRef<number | null>(null);

  const flushReplace = useCallback(() => {
    if (pendingText.current !== null) {
      onReplace(pendingText.current);
      pendingText.current = null;
    }
    rafId.current = null;
  }, [onReplace]);

  const handleFieldChange = useCallback((name: string, value: string) => {
    setFields(prev => {
      const updated = { ...prev, [name]: value };
      pendingText.current = rebuildCompoundText(keyword, updated, schemaPath);
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(flushReplace);
      }
      return updated;
    });
  }, [keyword, schemaPath, flushReplace]);

  const visibleProps = properties
    .filter(p => p.name !== 'id' && p.name !== 'children')
    .slice(0, 8);
  const longestLabel = Math.max(...visibleProps.map(p => p.name.length), 4);

  return createElement('div', {
    className: 'compound-popup',
    style: { '--label-width': `${longestLabel}ch` } as any,
  },
    createElement('div', { className: 'compound-popup-title' }, schemaPath),
    ...visibleProps
      .map(prop => {
        const type = detectSchemaType(prop.schema);
        const raw = fields[prop.name] ?? '';
        // Fall back to schema default when the field isn't in the DSL text
        const schemaDef = raw === '' ? getSchemaDefault(prop.schema) : undefined;
        const val = raw !== '' ? raw : (schemaDef !== undefined ? String(schemaDef) : '');

        let widget: ReactElement;

        if (type === 'color') {
          widget = createElement(ColorPicker, {
            value: val || 'gray',
            onChange: (c: Color) => handleFieldChange(prop.name, colorToDsl(c)),
          });
        } else if (type === 'number') {
          const constraints = getNumberConstraints(prop.schema);
          widget = createElement(NumberSlider, {
            value: parseFloat(val) || 0,
            min: constraints?.min,
            max: constraints?.max,
            step: constraints?.step,
            onChange: (n: number) => handleFieldChange(prop.name, String(n)),
          });
        } else if (type === 'enum') {
          widget = createElement(EnumDropdown, {
            value: val,
            options: getEnumValues(prop.schema) ?? [],
            onChange: (v: string) => handleFieldChange(prop.name, v),
          });
        } else if (type === 'anchor') {
          widget = createElement(AnchorEditor, {
            value: val || 'center',
            onChange: (v: unknown) => {
              // Named anchors → string, custom → serialize tuple
              if (typeof v === 'string') handleFieldChange(prop.name, v);
              else if (Array.isArray(v)) handleFieldChange(prop.name, `(${v.join(',')})`);
              else handleFieldChange(prop.name, String(v));
            },
          });
        } else {
          widget = createElement('input', {
            type: 'text',
            value: val,
            placeholder: prop.description || prop.name,
            onChange: (e: any) => handleFieldChange(prop.name, e.target.value),
            onKeyDown: (e: any) => e.stopPropagation(),
            className: 'compound-popup-input',
          });
        }

        return createElement('div', {
          key: prop.name,
          className: 'compound-popup-field',
        },
          createElement('label', { className: 'compound-popup-label' }, prop.name),
          widget,
        );
      }),
  );
}

// ---------------------------------------------------------------------------
// Popup DOM
// ---------------------------------------------------------------------------

class PopupView {
  private container: HTMLDivElement;
  private root: Root | null = null;
  private view: EditorView;
  private state: PopupState = EMPTY;

  constructor(view: EditorView) {
    this.view = view;
    this.container = document.createElement('div');
    this.container.className = 'starch-popup-container';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);

    // Close on click outside
    this.handleClickOutside = this.handleClickOutside.bind(this);
    document.addEventListener('mousedown', this.handleClickOutside);
  }

  private handleClickOutside(e: MouseEvent) {
    if (this.state.active && !this.container.contains(e.target as Node)) {
      this.close();
    }
  }

  show(state: PopupState) {
    this.state = state;
    this.container.style.display = 'block';
    this.container.style.left = `${state.coords.left}px`;
    this.container.style.top = `${state.coords.top}px`;

    if (!this.root) {
      this.root = createRoot(this.container);
    }

    this.renderWidget();
  }

  private renderWidget() {
    const { schemaType, schemaPath, value } = this.state;

    // Throttle editor dispatch to once per frame; update widget state
    // immediately so the slider/picker stays responsive.
    let pendingValue: unknown = undefined;
    let rafPending = false;

    const flushChange = () => {
      rafPending = false;
      if (pendingValue === undefined) return;
      const text = schemaType === 'color'
        ? colorToDsl(pendingValue as Color)
        : String(pendingValue);
      const tr = this.view.state.tr.replaceWith(
        this.state.from,
        this.state.to,
        this.view.state.schema.text(text),
      );
      this.view.dispatch(tr);
      this.state.to = this.state.from + text.length;
      pendingValue = undefined;
    };

    const handleChange = (newValue: unknown) => {
      this.state.value = newValue;
      pendingValue = newValue;
      // Re-render widget immediately for responsiveness
      this.renderWidget();
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(flushChange);
      }
    };

    let widget;

    if (schemaType === 'object') {
      widget = createElement(CompoundPopup, {
        schemaPath,
        currentText: this.view.state.doc.textBetween(this.state.from, this.state.to),
        onReplace: (newText: string) => {
          const tr = this.view.state.tr.insertText(newText, this.state.from, this.state.to);
          this.view.dispatch(tr);
          this.state.to = this.state.from + newText.length;
        },
        onClose: () => this.close(),
      });
    } else if (schemaType === 'color') {
      widget = createElement(ColorPicker, {
        value: value as any,
        onChange: handleChange,
      });
    } else if (schemaType === 'number') {
      const constraints = getNumberConstraints(
        resolvePropertySchema(schemaPath)!,
      );
      widget = createElement(NumberSlider, {
        value: typeof value === 'number' ? value : parseFloat(String(value)) || 0,
        min: constraints?.min,
        max: constraints?.max,
        step: constraints?.step,
        onChange: handleChange,
      });
    } else if (schemaType === 'enum') {
      const options = getEnumValues(
        resolvePropertySchema(schemaPath)!,
      ) ?? [];
      widget = createElement(EnumDropdown, {
        value: String(value ?? ''),
        options,
        onChange: handleChange,
      });
    } else if (schemaType === 'anchor') {
      widget = createElement(AnchorEditor, {
        value: value as any,
        onChange: handleChange,
      });
    } else if (schemaType === 'string') {
      widget = createElement('div', { style: { padding: 8, minWidth: 160 } },
        createElement('input', {
          type: 'text',
          value: String(value ?? ''),
          onMouseDown: (e: any) => e.stopPropagation(),
          onPointerDown: (e: any) => e.stopPropagation(),
          onKeyDown: (e: any) => e.stopPropagation(),
          onChange: (e: any) => handleChange(e.target.value),
          className: 'compound-popup-input',
          style: { width: '100%', boxSizing: 'border-box' },
          autoFocus: true,
        }),
      );
    }

    if (widget && this.root) {
      this.root.render(
        createElement('div', { className: 'starch-popup' }, widget),
      );
    }
  }

  close() {
    this.state = EMPTY;
    this.container.style.display = 'none';
    if (this.root) {
      this.root.render(null);
    }
    this.view.focus();
  }

  update(view: EditorView) {
    this.view = view;
  }

  destroy() {
    document.removeEventListener('mousedown', this.handleClickOutside);
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.container.remove();
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function clickPopupPlugin(): Plugin {
  let popupView: PopupView | null = null;

  return new Plugin({
    key: clickPopupKey,

    view(editorView) {
      popupView = new PopupView(editorView);
      return popupView;
    },

    props: {
      handleClick(view, pos, event) {
        // Only handle left clicks
        if (event.button !== 0) return false;

        const popup = detectPopupAt(view, pos);
        if (popup && popupView) {
          // Small delay so ProseMirror finishes handling the click first
          requestAnimationFrame(() => {
            popupView!.show(popup);
          });
          return false; // don't prevent default click behavior
        }

        return false;
      },

      handleKeyDown(view, event) {
        if (event.key === 'Escape' && popupView) {
          popupView.close();
          return true;
        }
        return false;
      },
    },
  });
}
