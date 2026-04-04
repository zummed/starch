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
import { createElement } from 'react';
import { buildAstFromText } from '../../dsl/astParser';
import { nodeAt, findCompound } from '../../dsl/astTypes';
import {
  getPropertySchema,
  detectSchemaType,
  getEnumValues,
  getNumberConstraints,
  type SchemaType,
} from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { ColorPicker } from '../views/widgets/ColorPicker';
import { NumberSlider } from '../views/widgets/NumberSlider';
import { EnumDropdown } from '../views/widgets/EnumDropdown';

export const clickPopupKey = new PluginKey('clickPopup');

/** Offset from ProseMirror position to text position. */
const PM_OFFSET = 2;

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
    const result = buildAstFromText(text);
    ast = result.ast;
  } catch {
    return null;
  }

  const node = nodeAt(ast, textPos);
  if (!node) return null;

  // Only show popups for value nodes
  if (node.dslRole !== 'value' && node.dslRole !== 'kwarg-value') return null;

  // Walk up to find the compound ancestor for schema context
  const compound = findCompound(node);
  const schemaPath = compound?.schemaPath ?? node.schemaPath;
  if (!schemaPath) return null;

  const schema = getPropertySchema(schemaPath, NodeSchema);
  if (!schema) return null;

  const schemaType = detectSchemaType(schema);

  // Only show popups for types that have widgets
  if (!['color', 'number', 'enum'].includes(schemaType)) return null;

  const coords = view.coordsAtPos(node.from + PM_OFFSET);

  return {
    active: true,
    schemaType,
    schemaPath,
    value: node.value,
    from: node.from + PM_OFFSET,
    to: node.to + PM_OFFSET,
    coords: { left: coords.left, top: coords.bottom + 4 },
  };
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
      const text = String(newValue);
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

    if (schemaType === 'color') {
      widget = createElement(ColorPicker, {
        value: value as any,
        onChange: handleChange,
      });
    } else if (schemaType === 'number') {
      const constraints = getNumberConstraints(
        getPropertySchema(schemaPath, NodeSchema)!,
      );
      widget = createElement(NumberSlider, {
        value: typeof value === 'number' ? value : parseFloat(String(value)) || 0,
        min: constraints?.min,
        max: constraints?.max,
        onChange: handleChange,
      });
    } else if (schemaType === 'enum') {
      const options = getEnumValues(
        getPropertySchema(schemaPath, NodeSchema)!,
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
