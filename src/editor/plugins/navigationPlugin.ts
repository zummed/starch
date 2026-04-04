import { keymap } from 'prosemirror-keymap';
import type { Plugin } from 'prosemirror-state';
import { Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

const EDITABLE_TYPES = new Set([
  'geometry_slot', 'property_slot', 'draft_slot',
  'keyframe_entry', 'image_entry', 'metadata', 'chapter',
]);

function collectSlotPositions(doc: PmNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (EDITABLE_TYPES.has(node.type.name) && node.content.size > 0) {
      positions.push(pos + 1); // position inside the node's text content
    }
  });
  return positions.sort((a, b) => a - b);
}

export function findNextSlot(doc: PmNode, currentPos: number): number | null {
  const slots = collectSlotPositions(doc);
  if (slots.length === 0) return null;
  for (const pos of slots) {
    if (pos > currentPos) return pos;
  }
  return slots[0]; // wrap around
}

export function findPrevSlot(doc: PmNode, currentPos: number): number | null {
  const slots = collectSlotPositions(doc);
  if (slots.length === 0) return null;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i] < currentPos) return slots[i];
  }
  return slots[slots.length - 1]; // wrap around
}

function moveTo(view: EditorView, pos: number | null): boolean {
  if (pos == null) return false;
  const { tr } = view.state;
  const resolved = view.state.doc.resolve(pos);
  view.dispatch(tr.setSelection(Selection.near(resolved)));
  view.focus();
  return true;
}

export function navigationPlugin(): Plugin {
  return keymap({
    'Tab': (state, dispatch, view) => {
      if (!view) return false;
      return moveTo(view, findNextSlot(state.doc, state.selection.from));
    },
    'Shift-Tab': (state, dispatch, view) => {
      if (!view) return false;
      return moveTo(view, findPrevSlot(state.doc, state.selection.from));
    },
    'Alt-ArrowDown': (state, dispatch, view) => {
      if (!view) return false;
      return moveTo(view, findNextSlot(state.doc, state.selection.from));
    },
    'Alt-ArrowUp': (state, dispatch, view) => {
      if (!view) return false;
      return moveTo(view, findPrevSlot(state.doc, state.selection.from));
    },
  });
}
