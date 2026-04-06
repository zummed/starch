import { describe, it, expect } from 'vitest';
import { walkDocument } from '../../dsl/schemaWalker';

describe('walkDocument - top-level fields', () => {
  it('parses name', () => {
    const { model } = walkDocument('name "My Scene"');
    expect(model.name).toBe('My Scene');
  });

  it('parses description', () => {
    const { model } = walkDocument('description "A test"');
    expect(model.description).toBe('A test');
  });

  it('parses background', () => {
    const { model } = walkDocument('background white');
    expect(model.background).toBe('white');
  });

  it('parses viewport', () => {
    const { model } = walkDocument('viewport 800x600');
    expect(model.viewport).toEqual({ width: 800, height: 600 });
  });

  it('parses multiple top-level fields', () => {
    const { model } = walkDocument(`name "Test"
description "A test"
background white`);
    expect(model.name).toBe('Test');
    expect(model.description).toBe('A test');
    expect(model.background).toBe('white');
  });

  it('empty input returns empty objects array', () => {
    const { model } = walkDocument('');
    expect(model.objects).toEqual([]);
  });

  it('emits AST leaves for each value', () => {
    const { ast } = walkDocument('name "My Scene"');
    const leaves = ast.astLeaves();
    const nameLeaf = leaves.find(l => l.schemaPath === 'name._value');
    expect(nameLeaf).toBeDefined();
    expect(nameLeaf?.value).toBe('My Scene');
    expect(nameLeaf?.dslRole).toBe('value');
  });
});

describe('walkDocument - instance declarations', () => {
  it('parses a single node declaration', () => {
    const { model } = walkDocument('box: rect 100x60');
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 60 });
  });

  it('parses multiple nodes', () => {
    const { model } = walkDocument(`box: rect 100x60
circle: ellipse 50x50`);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('circle');
  });

  it('parses node with fill color', () => {
    const { model } = walkDocument('box: rect 100x60 fill red');
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses node with stroke', () => {
    const { model } = walkDocument('box: rect 100x60 stroke red width=2');
    expect(model.objects[0].stroke).toEqual({ color: 'red', width: 2 });
  });

  it('parses node with transform (at)', () => {
    const { model } = walkDocument('box: rect 100x60 at 200,150');
    expect(model.objects[0].transform).toEqual({ x: 200, y: 150 });
  });
});

describe('walkDocument - children and sigils', () => {
  it('parses @style sigil reference', () => {
    const { model } = walkDocument('box: rect 100x60 @primary');
    expect(model.objects[0].style).toBe('primary');
  });

  it('parses @style before properties', () => {
    const { model } = walkDocument('box: rect 100x60 @primary fill red');
    expect(model.objects[0].style).toBe('primary');
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses nested children (indented)', () => {
    const dsl = `parent: rect 200x200
  child1: rect 50x50
  child2: ellipse 30x30`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].id).toBe('parent');
    expect(model.objects[0].children).toHaveLength(2);
    expect(model.objects[0].children[0].id).toBe('child1');
    expect(model.objects[0].children[1].id).toBe('child2');
  });
});

describe('walkDocument - sections', () => {
  it('parses style block', () => {
    const dsl = `style primary
  fill red`;
    const { model } = walkDocument(dsl);
    expect(model.styles?.primary).toBeDefined();
    expect(model.styles.primary.fill).toBe('red');
  });

  it('parses style block with multiple properties', () => {
    const dsl = `style danger
  fill firebrick
  stroke darkred width=2`;
    const { model } = walkDocument(dsl);
    expect(model.styles?.danger).toBeDefined();
    expect(model.styles.danger.fill).toBe('firebrick');
    expect(model.styles.danger.stroke).toEqual({ color: 'darkred', width: 2 });
  });

  it('parses images block', () => {
    const dsl = `images
  logo: "logo.png"
  hero: "hero.jpg"`;
    const { model } = walkDocument(dsl);
    expect(model.images?.logo).toBe('logo.png');
    expect(model.images?.hero).toBe('hero.jpg');
  });
});

describe('walkDocument - objects section', () => {
  it('parses objects section with child nodes', () => {
    const dsl = `objects
  box: rect 100x60 fill red
  circle: ellipse 50x50 fill blue`;
    const { model } = walkDocument(dsl);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].fill).toBe('red');
    expect(model.objects[1].id).toBe('circle');
  });

  it('objects section + top-level instances coexist', () => {
    const dsl = `objects
  a: rect 50x50
b: rect 50x50`;
    const { model } = walkDocument(dsl);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('a');
    expect(model.objects[1].id).toBe('b');
  });
});

describe('walkDocument - block properties', () => {
  it('parses dash block property', () => {
    const dsl = `box: rect 100x60
  dash dashed length=10 gap=5`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].dash).toEqual({ pattern: 'dashed', length: 10, gap: 5 });
  });

  it('parses layout block property', () => {
    const dsl = `row: rect 400x60
  layout flex row gap=10`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10 });
  });

  it('parses fill block property', () => {
    const dsl = `box: rect 100x60
  fill steelblue`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].fill).toBe('steelblue');
  });

  it('parses stroke block property', () => {
    const dsl = `box: rect 100x60
  stroke darkblue width=2`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].stroke).toEqual({ color: 'darkblue', width: 2 });
  });

  it('parses block properties alongside children', () => {
    const dsl = `row: rect 200x60
  layout flex row gap=5
  child1: rect 50x50
  child2: rect 50x50`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 5 });
    expect(model.objects[0].children).toHaveLength(2);
  });
});

describe('walkDocument - arrow/route connections', () => {
  it('parses simple arrow connection', () => {
    const dsl = 'line: a -> b stroke darkgray width=2';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].id).toBe('line');
    expect(model.objects[0].path).toEqual({ route: ['a', 'b'] });
    expect(model.objects[0].stroke).toEqual({ color: 'darkgray', width: 2 });
  });

  it('parses arrow with kwargs', () => {
    const dsl = 'line: a -> b gap=4 bend=0.5';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].path).toEqual({ route: ['a', 'b'], gap: 4, bend: 0.5 });
  });

  it('parses arrow inside objects section', () => {
    const dsl = `objects
  a: rect 50x50 at 100,150
  b: rect 50x50 at 300,150
  line: a -> b stroke gray width=1`;
    const { model } = walkDocument(dsl);
    expect(model.objects[2].path).toEqual({ route: ['a', 'b'] });
  });
});

describe('walkDocument - path with tuples', () => {
  it('parses inline path with points', () => {
    const dsl = 'tri: path (0,-40) (40,30) (-40,30) closed';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].path).toEqual({
      points: [[0, -40], [40, 30], [-40, 30]],
      closed: true,
    });
  });

  it('parses path with open points', () => {
    const dsl = 'zz: path (0,0) (30,-30) (60,0)';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].path?.points).toHaveLength(3);
  });
});

describe('walkDocument - template nodes', () => {
  it('parses template with props', () => {
    const dsl = 'conn: template arrow from=a to=b label="sends data"';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].template).toBe('arrow');
    expect(model.objects[0].props).toEqual({ from: 'a', to: 'b', label: 'sends data' });
  });
});

describe('walkDocument - dotted IDs', () => {
  it('parses dotted child IDs', () => {
    const dsl = `objects
  group: at 100,100
    group.bg: rect 100x50 fill blue
    group.label: text "hi" fill white`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].children[0].id).toBe('group.bg');
    expect(model.objects[0].children[1].id).toBe('group.label');
  });
});

describe('walkDocument - keyframe value formats', () => {
  it('parses braced keyframe value with easing', () => {
    const dsl = `animate 3s loop
  1.5 box.x: { value: 500, easing: "linear" }`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes[0].changes['box.x']).toEqual({ value: 500, easing: 'linear' });
  });

  it('parses boolean keyframe values', () => {
    const dsl = `animate 4s loop
  2 cam.active: false
  4 cam.active: true`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes[0].changes['cam.active']).toBe(false);
    expect(model.animate?.keyframes[1].changes['cam.active']).toBe(true);
  });

  it('parses tuple keyframe value (camera look)', () => {
    const dsl = `animate 4s
  2 cam.look: (a,b)`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes[0].changes['cam.look']).toEqual(['a', 'b']);
  });
});

describe('walkDocument - named-alpha color', () => {
  it('parses named color with alpha', () => {
    const dsl = 'box: rect 100x60 fill black a=0.7';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].fill).toEqual({ name: 'black', a: 0.7 });
  });
});

describe('walkDocument - camera geometry', () => {
  it('parses camera with look tuple', () => {
    const dsl = 'cam: camera look=(300,200) zoom=1.5';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].camera).toEqual({ look: [300, 200], zoom: 1.5 });
  });

  it('parses camera with rotation as transform kwarg', () => {
    const dsl = 'cam: camera look=(100,100) zoom=1 rotation=45';
    const { model } = walkDocument(dsl);
    expect(model.objects[0].camera).toEqual({ look: [100, 100], zoom: 1 });
    expect(model.objects[0].transform).toEqual({ rotation: 45 });
  });
});

describe('walkDocument - animate block', () => {
  it('parses basic animate duration', () => {
    const dsl = 'animate 3s';
    const { model } = walkDocument(dsl);
    expect(model.animate?.duration).toBe(3);
  });

  it('parses animate with loop flag', () => {
    const dsl = 'animate 3s loop';
    const { model } = walkDocument(dsl);
    expect(model.animate?.duration).toBe(3);
    expect(model.animate?.loop).toBe(true);
  });

  it('parses animate with keyframes', () => {
    const dsl = `animate 3s loop
  1 box.opacity: 1
  2 box.opacity: 0`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes).toHaveLength(2);
    expect(model.animate?.keyframes[0].time).toBe(1);
    expect(model.animate?.keyframes[0].changes['box.opacity']).toBe(1);
    expect(model.animate?.keyframes[1].time).toBe(2);
    expect(model.animate?.keyframes[1].changes['box.opacity']).toBe(0);
  });

  it('parses keyframe with multi-part change path', () => {
    const dsl = `animate 2s
  1 box.transform.x: 100`;
    const { model } = walkDocument(dsl);
    expect(model.animate?.keyframes[0].changes['box.transform.x']).toBe(100);
  });
});

// ─── Gap 1: Node-level kwargs/flags ───────────────────────────────────────────

describe('walkDocument - node-level kwargs and flags (gap 1)', () => {
  it('parses opacity kwarg on node declaration', () => {
    const { model } = walkDocument('box: rect 100x60 opacity=0.5');
    expect(model.objects[0].opacity).toBe(0.5);
  });

  it('parses depth kwarg on node declaration', () => {
    const { model } = walkDocument('box: rect 100x60 depth=3');
    expect(model.objects[0].depth).toBe(3);
  });

  it('parses visible flag on node declaration', () => {
    const { model } = walkDocument('box: rect 100x60 visible');
    expect(model.objects[0].visible).toBe(true);
  });

  it('parses multiple node-level kwargs and flags together', () => {
    const { model } = walkDocument('box: rect 100x60 opacity=0.5 visible depth=3');
    expect(model.objects[0].opacity).toBe(0.5);
    expect(model.objects[0].visible).toBe(true);
    expect(model.objects[0].depth).toBe(3);
  });

  it('parses node kwargs mixed with inline props', () => {
    const { model } = walkDocument('box: rect 100x60 fill red opacity=0.5 visible');
    expect(model.objects[0].fill).toBe('red');
    expect(model.objects[0].opacity).toBe(0.5);
    expect(model.objects[0].visible).toBe(true);
  });
});

// ─── Gap 2: Colon-less node declarations in objects section ───────────────────

describe('walkDocument - colon-less nodes in objects section (gap 2)', () => {
  it('parses colon-less node in objects section', () => {
    const dsl = `objects
  box rect 100x60 fill red`;
    const { model } = walkDocument(dsl);
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 60 });
    expect(model.objects[0].fill).toBe('red');
  });

  it('parses multiple colon-less nodes in objects section', () => {
    const dsl = `objects
  box rect 100x60
  circle ellipse 50x50`;
    const { model } = walkDocument(dsl);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('circle');
  });

  it('mixes colon and colon-less nodes in objects section', () => {
    const dsl = `objects
  box: rect 100x60
  circle ellipse 50x50`;
    const { model } = walkDocument(dsl);
    expect(model.objects).toHaveLength(2);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[1].id).toBe('circle');
  });
});

// ─── Gap 3: HSL alpha in colors ───────────────────────────────────────────────

describe('walkDocument - HSL alpha in colors (gap 3)', () => {
  it('parses hsl color with alpha kwarg on stroke', () => {
    const { model } = walkDocument('box: rect 100x60 stroke hsl 0 0 60 a=0.5 width=3');
    expect(model.objects[0].stroke?.color).toEqual({ h: 0, s: 0, l: 60, a: 0.5 });
    expect(model.objects[0].stroke?.width).toBe(3);
  });

  it('parses bare hsl triplet fill', () => {
    const { model } = walkDocument('box: rect 100x60 fill 210 70 45');
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45 });
  });

  it('parses bare hsl triplet with alpha', () => {
    const { model } = walkDocument('box: rect 100x60 fill 210 70 45 a=0.8');
    expect(model.objects[0].fill).toEqual({ h: 210, s: 70, l: 45, a: 0.8 });
  });
});

// ─── Gap 4: Partial transforms (single axis) ─────────────────────────────────

describe('walkDocument - partial transforms (gap 4)', () => {
  it('parses transform with only x kwarg', () => {
    const { model } = walkDocument('box: rect 100x60 at x=50');
    expect(model.objects[0].transform).toEqual({ x: 50 });
  });

  it('parses transform with only y kwarg', () => {
    const { model } = walkDocument('box: rect 100x60 at y=-20');
    expect(model.objects[0].transform).toEqual({ y: -20 });
  });

  it('parses transform with x and y as kwargs (no positional)', () => {
    const { model } = walkDocument('box: rect 100x60 at x=100 y=200');
    expect(model.objects[0].transform).toEqual({ x: 100, y: 200 });
  });
});

// ─── Gap 5: Layout kwargs ─────────────────────────────────────────────────────

describe('walkDocument - layout kwargs (gap 5)', () => {
  it('parses layout with slot kwarg', () => {
    const dsl = `row: rect 400x60
  layout flex row gap=10 slot=container`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', gap: 10, slot: 'container' });
  });

  it('parses layout with justify and align kwargs', () => {
    const dsl = `row: rect 400x60
  layout flex row justify=center align=stretch`;
    const { model } = walkDocument(dsl);
    expect(model.objects[0].layout).toEqual({ type: 'flex', direction: 'row', justify: 'center', align: 'stretch' });
  });
});
