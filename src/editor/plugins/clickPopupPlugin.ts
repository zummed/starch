/**
 * Click-to-edit popup plugin.
 *
 * When the user clicks on a value in the DSL, this plugin detects the schema
 * type at that position and shows the appropriate widget popup (ColorPicker,
 * NumberSlider, EnumDropdown, etc.). All of the actual edit logic — resolving
 * the target, serializing values, and splicing text — lives in the pure,
 * view-independent `popupEdit` module so the live editor and the interaction
 * test harness share exactly one implementation.
 */
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { createRoot, type Root } from 'react-dom/client';
import { createElement, useState, useCallback, useRef, type ReactElement } from 'react';
import {
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
  getSchemaDefault,
  getPropertySchema,
  type SchemaType,
} from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import type { z } from 'zod';
import type { Color } from '../../types/properties';
import {
  resolveEditTarget,
  resolvePropertySchema,
  resolveAvailableProperties,
  colorToDsl,
  serializeLeafValue,
  serializeFieldValue,
  parseCompoundText,
  rebuildCompoundText,
  parseNodeKwargs,
  rebuildNodeKwargs,
  NODE_KWARG_NAMES,
} from '../popupEdit';
import { ColorPicker } from '../views/widgets/ColorPicker';
import { NumberSlider } from '../views/widgets/NumberSlider';
import { EnumDropdown } from '../views/widgets/EnumDropdown';
import { AnchorEditor } from '../views/widgets/AnchorEditor';

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
 * Detect the popup to show at a ProseMirror position. Thin view-layer wrapper
 * over the pure `resolveEditTarget`: it adds the PM offset and screen coords.
 */
function detectPopupAt(view: EditorView, pmPos: number): PopupState | null {
  const text = view.state.doc.textContent;
  const target = resolveEditTarget(text, pmPos - PM_OFFSET);
  if (!target) return null;
  const coords = view.coordsAtPos(target.from + PM_OFFSET);
  return {
    active: true,
    schemaType: target.schemaType,
    schemaPath: target.schemaPath,
    value: target.value,
    from: target.from + PM_OFFSET,
    to: target.to + PM_OFFSET,
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
  const isNode = schemaPath === '_node';
  const properties = isNode
    ? NODE_KWARG_NAMES.map(name => {
        const schema = getPropertySchema(name, NodeSchema);
        return schema ? { name, schema, description: '', required: false, category: 'meta' as const } : null;
      }).filter(Boolean) as { name: string; schema: z.ZodType; description: string; required: boolean; category: string }[]
    : resolveAvailableProperties(schemaPath);
  const keyword = currentText.split(/\s+/)[0] || schemaPath;

  const [fields, setFields] = useState<Record<string, string>>(() =>
    isNode ? parseNodeKwargs(currentText) : parseCompoundText(currentText, schemaPath),
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
      pendingText.current = isNode
        ? rebuildNodeKwargs(currentText, updated)
        : rebuildCompoundText(keyword, updated, schemaPath);
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
    createElement('div', { className: 'compound-popup-title' }, isNode ? keyword : schemaPath),
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
            onChange: (c: Color) => handleFieldChange(prop.name, serializeFieldValue('color', c)),
          });
        } else if (type === 'number') {
          const constraints = getNumberConstraints(prop.schema);
          widget = createElement(NumberSlider, {
            value: parseFloat(val) || 0,
            min: constraints?.min,
            max: constraints?.max,
            step: constraints?.step,
            onChange: (n: number) => handleFieldChange(prop.name, serializeFieldValue('number', n)),
          });
        } else if (type === 'enum') {
          widget = createElement(EnumDropdown, {
            value: val,
            options: getEnumValues(prop.schema) ?? [],
            onChange: (v: string) => handleFieldChange(prop.name, serializeFieldValue('enum', v)),
          });
        } else if (type === 'anchor') {
          widget = createElement(AnchorEditor, {
            value: val || 'center',
            onChange: (v: unknown) => handleFieldChange(prop.name, serializeFieldValue('anchor', v)),
          });
        } else {
          widget = createElement('div', { style: { padding: '4px 8px' } },
            createElement('input', {
              type: 'text',
              value: val,
              placeholder: prop.description || prop.name,
              onChange: (e: any) => handleFieldChange(prop.name, e.target.value),
              onKeyDown: (e: any) => e.stopPropagation(),
              className: 'compound-popup-input',
            }),
          );
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

    const handleChange = (newValue: unknown) => {
      const text = serializeLeafValue(schemaType, newValue);
      const tr = this.view.state.tr.replaceWith(
        this.state.from,
        this.state.to,
        this.view.state.schema.text(text),
      );
      this.view.dispatch(tr);
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
