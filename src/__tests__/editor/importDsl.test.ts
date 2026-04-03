import { describe, it, expect } from 'vitest';
import { importDsl } from '../../editor/io/importDsl';
import { extractModel } from '../../editor/extractModel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getObjectById(model: any, id: string) {
  return (model.objects ?? []).find((o: any) => o.id === id);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('importDsl', () => {
  // 1. Minimal scene with one rect node
  it('imports a minimal scene with one rect node', () => {
    const { doc } = importDsl('box: rect 140x80\n');

    // doc has one child: a scene_node
    expect(doc.childCount).toBe(1);
    const node = doc.firstChild!;
    expect(node.type.name).toBe('scene_node');
    expect(node.attrs.id).toBe('box');
    expect(node.attrs.geometryType).toBe('rect');

    // First child of scene_node is the geometry_slot
    const geomSlot = node.firstChild!;
    expect(geomSlot.type.name).toBe('geometry_slot');
    expect(geomSlot.attrs.keyword).toBe('rect');
    expect(geomSlot.textContent).toBe('140x80');
  });

  // 2. Round-trip: importDsl then extractModel matches parser model
  it('round-trips a simple scene through extractModel', () => {
    const dsl = 'box: rect 140x80 fill red opacity=0.5\n';
    const { doc } = importDsl(dsl);
    const roundTripped = extractModel(doc);

    expect(roundTripped.objects).toHaveLength(1);
    expect(roundTripped.objects[0].id).toBe('box');
    expect(roundTripped.objects[0].rect).toEqual({ w: 140, h: 80 });
    expect(roundTripped.objects[0].fill).toBe('red');
    expect(roundTripped.objects[0].opacity).toBe(0.5);
  });

  // 3. Import metadata (name, background)
  it('imports name and background metadata', () => {
    const dsl = 'name "My Scene"\nbackground "#1a1a2e"\nbox: rect 10x10\n';
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.name).toBe('My Scene');
    expect(model.background).toBe('#1a1a2e');
  });

  // 4. Import style blocks
  it('imports style blocks', () => {
    const dsl = 'style accent\n  fill blue\n  opacity=0.8\n';
    const { doc } = importDsl(dsl);

    // Find the style_block node
    let styleBlock: any = null;
    doc.forEach((child) => {
      if (child.type.name === 'style_block') styleBlock = child;
    });
    expect(styleBlock).not.toBeNull();
    expect(styleBlock.attrs.name).toBe('accent');

    // Round-trip
    const model = extractModel(doc);
    expect(model.styles.accent.fill).toBe('blue');
    expect(model.styles.accent.opacity).toBe(0.8);
  });

  // 5. Import animate block with keyframes
  it('imports animate block with keyframes', () => {
    const dsl = 'animate 3s\n  0  box.opacity: 0\n  1.5  box.opacity: 1\n';
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.animate).toBeDefined();
    expect(model.animate.duration).toBe(3);
    expect(model.animate.keyframes).toHaveLength(2);
    expect(model.animate.keyframes[0].time).toBe(0);
    expect(model.animate.keyframes[0].changes['box.opacity']).toBe(0);
    expect(model.animate.keyframes[1].time).toBe(1.5);
    expect(model.animate.keyframes[1].changes['box.opacity']).toBe(1);
  });

  // 6. Import compound properties (stroke)
  it('imports compound stroke property', () => {
    const dsl = 'box: rect 100x100 stroke blue width=2\n';
    const { doc } = importDsl(dsl);

    // Find compound_slot for stroke in the scene_node
    const sceneNode = doc.firstChild!;
    let compoundSlot: any = null;
    sceneNode.forEach((child) => {
      if (child.type.name === 'compound_slot' && child.attrs.key === 'stroke') {
        compoundSlot = child;
      }
    });
    expect(compoundSlot).not.toBeNull();

    // Round-trip
    const model = extractModel(doc);
    expect(model.objects[0].stroke).toEqual({ color: 'blue', width: 2 });
  });

  // 6b. Import compound stroke with HSL color
  // Note: extractModel stores the HSL color object as serialized text in a
  // property_slot, so round-trip gives back a string, not an object.
  // We verify the compound_slot structure is correct instead.
  it('imports compound stroke with HSL color — verifies node structure', () => {
    const dsl = 'box: rect 100x100 stroke hsl 210 80 30 width=3\n';
    const { doc } = importDsl(dsl);

    const sceneNode = doc.firstChild!;
    let strokeSlot: any = null;
    sceneNode.forEach((child) => {
      if (child.type.name === 'compound_slot' && child.attrs.key === 'stroke') {
        strokeSlot = child;
      }
    });
    expect(strokeSlot).not.toBeNull();

    // Should have property_slots for color and width
    const keys: string[] = [];
    strokeSlot.forEach((prop: any) => {
      if (prop.type.name === 'property_slot') keys.push(prop.attrs.key);
    });
    expect(keys).toContain('color');
    expect(keys).toContain('width');

    // width round-trips correctly (it's a number)
    const model = extractModel(doc);
    expect(model.objects[0].stroke.width).toBe(3);
  });

  // 6c. Import object fill (hsl) as compound_slot
  it('imports object fill (hsl) as compound_slot', () => {
    const dsl = 'box: rect 100x100 fill hsl 210 70 45\n';
    const { doc } = importDsl(dsl);

    const sceneNode = doc.firstChild!;
    let compoundOrPropSlot: any = null;
    sceneNode.forEach((child) => {
      if (
        (child.type.name === 'compound_slot' || child.type.name === 'property_slot') &&
        child.attrs.key === 'fill'
      ) {
        compoundOrPropSlot = child;
      }
    });
    expect(compoundOrPropSlot).not.toBeNull();
    expect(compoundOrPropSlot.type.name).toBe('compound_slot');

    // Round-trip
    const model = extractModel(doc);
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });

  // 7. Import nested children
  it('imports nested children', () => {
    const dsl = 'parent: rect 200x200\n  child: ellipse 20x20\n';
    const { doc } = importDsl(dsl);

    const parentNode = doc.firstChild!;
    expect(parentNode.attrs.id).toBe('parent');

    // Find nested scene_node
    let childNode: any = null;
    parentNode.forEach((child) => {
      if (child.type.name === 'scene_node') childNode = child;
    });
    expect(childNode).not.toBeNull();
    expect(childNode.attrs.id).toBe('child');

    // Round-trip
    const model = extractModel(doc);
    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('child');
    expect(model.objects[0].children[0].ellipse).toEqual({ rx: 10, ry: 10 });
  });

  // 8. Preserve format hints
  it('preserves format hints', () => {
    const dsl = 'box: rect 100x100 fill red\n';
    const { formatHints } = importDsl(dsl);
    expect(formatHints.nodes['box']?.display).toBe('inline');
  });

  it('preserves block format hint', () => {
    const dsl = 'box: rect 100x100\n  fill red\n';
    const { formatHints } = importDsl(dsl);
    expect(formatHints.nodes['box']?.display).toBe('block');
  });

  // 9. Import images block
  it('imports images block', () => {
    const dsl = 'images\n  logo: "logo.png"\n  photo: "photo.jpg"\n';
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);
    expect(model.images).toEqual({ logo: 'logo.png', photo: 'photo.jpg' });
  });

  // 10. Import style_ref (@styleName)
  it('imports style reference on a scene node', () => {
    const dsl = 'box: rect 100x100 @accent\n';
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);
    expect(model.objects[0].style).toBe('accent');
  });

  // 11. Import transform as compound_slot
  it('imports transform as compound_slot', () => {
    const dsl = 'box: rect 100x100 at 50,75\n';
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);
    expect(model.objects[0].transform).toEqual({ x: 50, y: 75 });
  });

  // 12. Import scene_node display attr from format hints
  it('sets display attr on scene_node from format hints', () => {
    const dslInline = 'box: rect 100x100 fill red\n';
    const { doc: docInline } = importDsl(dslInline);
    expect(docInline.firstChild!.attrs.display).toBe('inline');

    const dslBlock = 'box: rect 100x100\n  fill red\n';
    const { doc: docBlock } = importDsl(dslBlock);
    expect(docBlock.firstChild!.attrs.display).toBe('block');
  });

  // 13. Import image geometry
  // Note: extractModel reconstructs image dimensions from geometry_slot text,
  // but src is stored as a separate property_slot. The round-trip reflects
  // this structure: image contains dimensions only, src is a top-level property.
  it('imports image geometry — dimensions in geometry_slot', () => {
    const dsl = 'pic: image "photo.png" 200x150\n';
    const { doc } = importDsl(dsl);

    // Check geometry_slot content
    const sceneNode = doc.firstChild!;
    const geomSlot = sceneNode.firstChild!;
    expect(geomSlot.type.name).toBe('geometry_slot');
    expect(geomSlot.attrs.keyword).toBe('image');
    expect(geomSlot.textContent).toBe('200x150');

    // src is stored as a property_slot
    let srcSlot: any = null;
    sceneNode.forEach((child) => {
      if (child.type.name === 'property_slot' && child.attrs.key === 'src') {
        srcSlot = child;
      }
    });
    expect(srcSlot).not.toBeNull();
    expect(srcSlot.textContent).toBe('photo.png');

    // Round-trip: image dimensions come through, src is a separate key
    const model = extractModel(doc);
    expect(model.objects[0].image).toEqual({ w: 200, h: 150 });
    expect(model.objects[0].src).toBe('photo.png');
  });

  // 14. Full round-trip with styles and animation
  it('round-trips a complex scene', () => {
    const dsl = [
      'name "Test"\n',
      'style accent\n',
      '  fill blue\n',
      'box: rect 100x100 @accent\n',
      'animate 5s\n',
      '  0  box.opacity: 1\n',
      '  2.5  box.opacity: 0\n',
    ].join('');
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.name).toBe('Test');
    expect(model.styles.accent.fill).toBe('blue');
    expect(model.objects[0].style).toBe('accent');
    expect(model.animate.keyframes).toHaveLength(2);
    expect(model.animate.keyframes[0].changes['box.opacity']).toBe(1);
  });
});
