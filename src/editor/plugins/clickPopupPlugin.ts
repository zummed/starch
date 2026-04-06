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
import { createElement, useState, type ReactElement } from 'react';
import { walkDocument } from '../../dsl/schemaWalker';
import { leavesToAst } from '../../dsl/astAdapter';
import { nodeAt, findCompound } from '../../dsl/astTypes';
import {
  getPropertySchema,
  getAvailableProperties,
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
  DocumentSchema,
  type SchemaType,
} from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { getShapeDefinition, listSets } from '../../templates/registry';
import type { z } from 'zod';

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

  if (node.dslRole === 'keyword' || node.dslRole === 'compound') {
    schemaPath = node.schemaPath;
    const compound = node.dslRole === 'compound' ? node : findCompound(node);
    rangeFrom = compound?.from ?? node.from;
    rangeTo = compound?.to ?? node.to;
  } else if (node.dslRole === 'value' || node.dslRole === 'kwarg-value') {
    const compound = findCompound(node);
    // For kwarg-values at node-line level (compound schemaPath is empty),
    // use the node's own schemaPath — this handles template props kwargs.
    schemaPath = (compound?.schemaPath) ? compound.schemaPath : node.schemaPath;
    rangeFrom = node.from;
    rangeTo = node.to;
  } else if (node.dslRole === 'kwarg-key') {
    // Kwarg keys carry their own schemaPath (e.g., template props)
    schemaPath = node.schemaPath;
    rangeFrom = node.from;
    rangeTo = node.to;
  } else {
    return null;
  }

  if (!schemaPath) return null;

  const schema = resolvePropertySchema(schemaPath);
  if (!schema) return null;

  const schemaType = detectSchemaType(schema);

  // Show popups for types that have widgets
  if (!['color', 'number', 'enum', 'object'].includes(schemaType)) return null;

  const coords = view.coordsAtPos(rangeFrom + PM_OFFSET);

  return {
    active: true,
    schemaType,
    schemaPath,
    value: node.value,
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

function CompoundPopup({ schemaPath, currentText, onReplace, onClose }: CompoundPopupProps) {
  const properties = resolveAvailableProperties(schemaPath);
  const [values, setValues] = useState<Record<string, string>>(() => {
    // Parse current text into field values (best-effort)
    const fields: Record<string, string> = {};
    // Simple parsing: extract key=value pairs and positional values
    const parts = currentText.split(/\s+/);
    // Skip the keyword (first part)
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('=')) {
        const [k, v] = part.split('=', 2);
        fields[k] = v;
      }
    }
    return fields;
  });

  const handleFieldChange = (name: string, value: string) => {
    const updated = { ...values, [name]: value };
    setValues(updated);

    // Rebuild the DSL text from the fields
    // Keep the keyword, update/add kwargs
    const parts = currentText.split(/\s+/);
    const keyword = parts[0] || schemaPath;

    // Collect positional parts (non-kwarg)
    const positionals = parts.slice(1).filter(p => !p.includes('='));

    // Build new text
    const kwargParts = Object.entries(updated)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}=${v}`);

    const newText = [keyword, ...positionals, ...kwargParts].join(' ');
    onReplace(newText);
  };

  return createElement('div', { className: 'compound-popup' },
    createElement('div', { className: 'compound-popup-title' }, schemaPath),
    ...properties
      .filter(p => p.name !== 'id' && p.name !== 'children')
      .slice(0, 8) // limit to avoid overwhelming UI
      .map(prop => {
        const type = detectSchemaType(prop.schema);
        const val = values[prop.name] ?? '';

        return createElement('div', {
          key: prop.name,
          className: 'compound-popup-field',
        },
          createElement('label', { className: 'compound-popup-label' }, prop.name),
          type === 'enum'
            ? createElement('select', {
                value: val,
                onChange: (e: any) => handleFieldChange(prop.name, e.target.value),
                className: 'compound-popup-input',
              },
                createElement('option', { value: '' }, '—'),
                ...(getEnumValues(prop.schema) ?? []).map(v =>
                  createElement('option', { key: v, value: v }, v)
                ),
              )
            : createElement('input', {
                type: type === 'number' ? 'number' : 'text',
                value: val,
                placeholder: prop.description || prop.name,
                onChange: (e: any) => handleFieldChange(prop.name, e.target.value),
                onKeyDown: (e: any) => e.stopPropagation(),
                className: 'compound-popup-input',
              }),
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

    const handleChange = (newValue: unknown) => {
      const text = schemaType === 'color'
        ? colorToDsl(newValue as Color)
        : String(newValue);
      const tr = this.view.state.tr.replaceWith(
        this.state.from,
        this.state.to,
        this.view.state.schema.text(text),
      );
      this.view.dispatch(tr);
      // Update range for subsequent changes
      this.state.to = this.state.from + text.length;
      this.state.value = newValue;
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
