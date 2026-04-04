import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';
import { findNextSlot, findPrevSlot } from '../../editor/plugins/navigationPlugin';

function makeTestDoc() {
  return starchSchema.node('doc', null, [
    starchSchema.node('scene_node', {
      id: 'box', schemaPath: 'objects.box', display: 'inline', geometryType: 'rect',
    }, [
      starchSchema.node('geometry_slot', {
        keyword: 'rect', schemaPath: 'rect',
      }, [starchSchema.text('100x200')]),
      starchSchema.node('property_slot', {
        key: 'fill', schemaPath: 'fill',
      }, [starchSchema.text('red')]),
      starchSchema.node('property_slot', {
        key: 'opacity', schemaPath: 'opacity',
      }, [starchSchema.text('0.5')]),
    ]),
  ]);
}

describe('navigation helpers', () => {
  it('findNextSlot returns a position after current', () => {
    const doc = makeTestDoc();
    const next = findNextSlot(doc, 0);
    expect(next).not.toBeNull();
    expect(next).toBeGreaterThan(0);
  });

  it('findPrevSlot returns a position before current', () => {
    const doc = makeTestDoc();
    const last = findNextSlot(doc, 100); // wrap around
    const prev = findPrevSlot(doc, 100);
    expect(prev).not.toBeNull();
  });

  it('findNextSlot wraps around at end', () => {
    const doc = makeTestDoc();
    // Start from a very large position
    const wrapped = findNextSlot(doc, 99999);
    expect(wrapped).not.toBeNull();
  });

  it('collects correct number of slots', () => {
    const doc = makeTestDoc();
    // There are 3 editable slots: geometry_slot, fill property_slot, opacity property_slot
    const slots: number[] = [];
    let pos = 0;
    for (let i = 0; i < 10; i++) {
      const next = findNextSlot(doc, pos);
      if (next === null || slots.includes(next)) break;
      slots.push(next);
      pos = next;
    }
    expect(slots).toHaveLength(3);
  });
});
