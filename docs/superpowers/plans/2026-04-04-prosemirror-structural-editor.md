# ProseMirror Structural Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeMirror 6 with a ProseMirror-based structural editor where the document is a typed node tree derived from Zod schemas, following a clean one-way data flow.

**Architecture:** Zod schemas generate a ProseMirror schema at startup. The ProseMirror doc is the single live state — a typed node tree. A pure function `extractModel(doc)` derives JSON for the renderer. DSL text is an import/export format only, never part of the editing loop. React NodeViews render each node type with inline widgets.

**Tech Stack:** ProseMirror (model, state, view, transform, history, keymap, commands, inputrules), `@prosemirror-adapter/react` for React NodeViews, existing Zod schemas + DslHints, Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-04-04-prosemirror-structural-editor-design.md`

---

## File Structure

### New files

```
src/editor/
├── schema/
│   ├── starchSchema.ts         — ProseMirror schema definition (NodeSpecs + content expressions)
│   ├── schemaBuilder.ts        — Zod+DslHints → ProseMirror attrs/content helpers
│   └── draftNode.ts            — DraftNode NodeSpec + validation helpers
├── views/
│   ├── SceneNodeView.tsx        — NodeView for scene nodes (rect, ellipse, etc.)
│   ├── PropertySlotView.tsx     — NodeView for single property lines
│   ├── CompoundSlotView.tsx     — NodeView for compound properties (color, stroke, etc.)
│   ├── SectionView.tsx          — NodeView for style/animate/images sections
│   ├── MetadataView.tsx         — NodeView for metadata lines (name, background, viewport)
│   ├── KeyframeView.tsx         — NodeView for keyframe blocks and entries
│   └── widgets/                 — Moved from editor/popups/, CM6 deps stripped
│       ├── ColorPicker.tsx
│       ├── NumberSlider.tsx
│       ├── EnumDropdown.tsx
│       ├── PointRefEditor.tsx
│       ├── AnchorEditor.tsx
│       └── AddPropertyPopup.tsx
├── plugins/
│   ├── completionPlugin.ts      — Schema-aware completions via ProseMirror plugin
│   ├── navigationPlugin.ts      — Alt+Arrow structural nav, Tab between slots
│   └── draftResolverPlugin.ts   — Watches draft nodes, resolves when text is valid
├── io/
│   ├── importDsl.ts             — DSL text → ProseMirror doc (uses existing parser)
│   └── exportDsl.ts             — ProseMirror doc → DSL text (uses existing emitter)
├── extractModel.ts              — ProseMirror doc → JSON model (pure function)
├── StructuralEditor.tsx         — Main editor component, mounts ProseMirror
└── editorStyles.css             — Editor styling (replaces CM6 theme)
```

### Files to modify

- `src/app/App.tsx` — Replace ModelManager/V2Editor wiring with StructuralEditor
- `src/app/components/V2Diagram.tsx` — No changes (receives model JSON as before)
- `src/dsl/astCompletions.ts` — Minor: export completion helpers for reuse
- `package.json` — Add ProseMirror deps, remove CM6 deps

### Files to remove (final cleanup)

- `src/app/components/V2Editor.tsx`
- `src/editor/modelManager.ts`
- `src/editor/dslLanguage.ts`
- `src/editor/theme.ts`
- `src/editor/popups/PropertyPopup.tsx`
- `src/editor/popups/TabbedPopup.tsx`
- `src/dsl/astDecorations.ts`

### Files preserved as-is

- `src/dsl/dslMeta.ts` — DslHints + `dsl()` annotation
- `src/dsl/astTypes.ts` — AstNode interface (used by import/export)
- `src/dsl/astParser.ts` — Used by `importDsl.ts`
- `src/dsl/astEmitter.ts` — Used by `exportDsl.ts`
- `src/dsl/formatHints.ts` — FormatHints type
- `src/types/schemaRegistry.ts` — Schema introspection
- `src/types/*.ts` — All Zod schema definitions
- `src/parser/parser.ts` — Scene parser (used by renderer)
- `src/renderer/`, `src/animation/`, `src/templates/`, `src/tree/` — Untouched

---

## Task 1: Install ProseMirror Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install ProseMirror packages**

```bash
cd /data/projects/starch
npm install prosemirror-model prosemirror-state prosemirror-view prosemirror-transform prosemirror-history prosemirror-keymap prosemirror-commands prosemirror-inputrules @prosemirror-adapter/react
```

- [ ] **Step 2: Verify installation**

Run: `ls node_modules/prosemirror-model/package.json && ls node_modules/@prosemirror-adapter/react/package.json`
Expected: Both files exist.

- [ ] **Step 3: Verify TypeScript can resolve imports**

Create a temporary test file:

```typescript
// src/__tests__/editor/pmImports.test.ts
import { describe, it, expect } from 'vitest';

it('prosemirror packages resolve', async () => {
  const model = await import('prosemirror-model');
  expect(model.Schema).toBeDefined();

  const state = await import('prosemirror-state');
  expect(state.EditorState).toBeDefined();

  const view = await import('prosemirror-view');
  expect(view.EditorView).toBeDefined();

  const adapter = await import('@prosemirror-adapter/react');
  expect(adapter.ProseMirror).toBeDefined();
});
```

Run: `npx vitest run src/__tests__/editor/pmImports.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/__tests__/editor/pmImports.test.ts
git commit -m "chore: add ProseMirror dependencies for structural editor migration"
```

---

## Task 2: ProseMirror Schema Definition

Define the ProseMirror schema that maps to the Starch document model. This is the foundation — every other task depends on it.

**Files:**
- Create: `src/editor/schema/starchSchema.ts`
- Create: `src/editor/schema/schemaBuilder.ts`
- Test: `src/__tests__/editor/starchSchema.test.ts`

- [ ] **Step 1: Write failing tests for the schema**

```typescript
// src/__tests__/editor/starchSchema.test.ts
import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';
import { Node as PmNode } from 'prosemirror-model';

describe('starchSchema', () => {
  it('defines doc node as top-level', () => {
    expect(starchSchema.nodes.get('doc')).toBeDefined();
  });

  it('defines scene_node with expected attrs', () => {
    const spec = starchSchema.nodes.get('scene_node');
    expect(spec).toBeDefined();
  });

  it('defines property_slot with key and schemaPath attrs', () => {
    const spec = starchSchema.nodes.get('property_slot');
    expect(spec).toBeDefined();
  });

  it('defines geometry_slot', () => {
    expect(starchSchema.nodes.get('geometry_slot')).toBeDefined();
  });

  it('defines compound_slot', () => {
    expect(starchSchema.nodes.get('compound_slot')).toBeDefined();
  });

  it('defines draft_slot', () => {
    expect(starchSchema.nodes.get('draft_slot')).toBeDefined();
  });

  it('defines style_block, animate_block, images_block', () => {
    expect(starchSchema.nodes.get('style_block')).toBeDefined();
    expect(starchSchema.nodes.get('animate_block')).toBeDefined();
    expect(starchSchema.nodes.get('images_block')).toBeDefined();
  });

  it('defines keyframe_block and keyframe_entry', () => {
    expect(starchSchema.nodes.get('keyframe_block')).toBeDefined();
    expect(starchSchema.nodes.get('keyframe_entry')).toBeDefined();
  });

  it('defines metadata node', () => {
    expect(starchSchema.nodes.get('metadata')).toBeDefined();
  });

  it('can create a minimal valid document', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'box',
        schemaPath: 'objects.0',
        display: 'inline',
        geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect',
          schemaPath: 'rect',
        }, [starchSchema.text('100x200')]),
        starchSchema.node('property_slot', {
          key: 'fill',
          schemaPath: 'fill',
        }, [starchSchema.text('red')]),
      ]),
    ]);
    expect(doc.type.name).toBe('doc');
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild!.type.name).toBe('scene_node');
    expect(doc.firstChild!.attrs.id).toBe('box');
    expect(doc.firstChild!.childCount).toBe(2);
  });

  it('scene_node can contain nested scene_node children', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'parent',
        schemaPath: 'objects.0',
        display: 'block',
        geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect',
          schemaPath: 'rect',
        }, [starchSchema.text('200x200')]),
        starchSchema.node('scene_node', {
          id: 'child',
          schemaPath: 'objects.0.children.0',
          display: 'inline',
          geometryType: 'ellipse',
        }, [
          starchSchema.node('geometry_slot', {
            keyword: 'ellipse',
            schemaPath: 'ellipse',
          }, [starchSchema.text('50x50')]),
        ]),
      ]),
    ]);
    expect(doc.firstChild!.childCount).toBe(2);
    expect(doc.firstChild!.child(1).type.name).toBe('scene_node');
    expect(doc.firstChild!.child(1).attrs.id).toBe('child');
  });

  it('compound_slot contains property_slots', () => {
    const doc = starchSchema.node('doc', null, [
      starchSchema.node('scene_node', {
        id: 'a', schemaPath: 'objects.0', display: 'inline', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('10x10')]),
        starchSchema.node('compound_slot', {
          key: 'stroke', schemaPath: 'stroke',
        }, [
          starchSchema.node('property_slot', {
            key: 'color', schemaPath: 'stroke.color',
          }, [starchSchema.text('red')]),
          starchSchema.node('property_slot', {
            key: 'width', schemaPath: 'stroke.width',
          }, [starchSchema.text('2')]),
        ]),
      ]),
    ]);
    const stroke = doc.firstChild!.child(1);
    expect(stroke.type.name).toBe('compound_slot');
    expect(stroke.childCount).toBe(2);
    expect(stroke.firstChild!.type.name).toBe('property_slot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/starchSchema.test.ts`
Expected: FAIL — module `../../editor/schema/starchSchema` not found

- [ ] **Step 3: Write the schema builder helpers**

```typescript
// src/editor/schema/schemaBuilder.ts
import type { NodeSpec, AttributeSpec } from 'prosemirror-model';

/**
 * Helper to define attrs with defaults for ProseMirror NodeSpecs.
 * ProseMirror requires every attr to have a default or be provided at creation.
 */
export function attrs(
  defs: Record<string, { default: unknown }>
): Record<string, AttributeSpec> {
  return defs;
}

/**
 * Create a NodeSpec for a block node that contains inline text content.
 */
export function textBlock(
  nodeAttrs: Record<string, AttributeSpec>,
  extra?: Partial<NodeSpec>,
): NodeSpec {
  return {
    content: 'text*',
    attrs: nodeAttrs,
    ...extra,
  };
}
```

- [ ] **Step 4: Write the ProseMirror schema**

```typescript
// src/editor/schema/starchSchema.ts
import { Schema, type NodeSpec } from 'prosemirror-model';
import { attrs } from './schemaBuilder';

// --- Node Specs ---

const doc: NodeSpec = {
  content: '(metadata | scene_node | style_block | animate_block | images_block)*',
};

const metadata: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    key: { default: '' },           // 'name' | 'background' | 'viewport' | 'description'
    schemaPath: { default: '' },
  }),
  group: 'top_level',
  defining: true,
};

const scene_node: NodeSpec = {
  content: '(geometry_slot | property_slot | compound_slot | style_ref | scene_node)*',
  attrs: attrs({
    id: { default: '' },
    schemaPath: { default: '' },
    display: { default: 'inline' },     // 'inline' | 'block'
    geometryType: { default: '' },       // 'rect' | 'ellipse' | 'text' | 'path' | 'image' | 'camera' | ''
  }),
  group: 'top_level',
  defining: true,
};

const geometry_slot: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    keyword: { default: '' },
    schemaPath: { default: '' },
  }),
  defining: true,
};

const property_slot: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    key: { default: '' },
    schemaPath: { default: '' },
  }),
  defining: true,
};

const compound_slot: NodeSpec = {
  content: 'property_slot+',
  attrs: attrs({
    key: { default: '' },
    schemaPath: { default: '' },
  }),
  defining: true,
};

const draft_slot: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    schemaPath: { default: '' },
    expectedType: { default: '' },
    parentKey: { default: '' },
  }),
  defining: true,
};

const style_ref: NodeSpec = {
  attrs: attrs({
    name: { default: '' },
  }),
  atom: true,
  inline: false,
};

const style_block: NodeSpec = {
  content: '(property_slot | compound_slot)*',
  attrs: attrs({
    name: { default: '' },
    schemaPath: { default: '' },
  }),
  group: 'top_level',
  defining: true,
};

const animate_block: NodeSpec = {
  content: '(property_slot | keyframe_block | chapter)*',
  attrs: attrs({
    schemaPath: { default: 'animate' },
  }),
  group: 'top_level',
  defining: true,
};

const keyframe_block: NodeSpec = {
  content: 'keyframe_entry*',
  attrs: attrs({
    time: { default: 0 },
    schemaPath: { default: '' },
  }),
  defining: true,
};

const keyframe_entry: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    target: { default: '' },
    property: { default: '' },
    schemaPath: { default: '' },
  }),
  defining: true,
};

const chapter: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    schemaPath: { default: '' },
  }),
  defining: true,
};

const images_block: NodeSpec = {
  content: 'image_entry*',
  attrs: attrs({
    schemaPath: { default: 'images' },
  }),
  group: 'top_level',
  defining: true,
};

const image_entry: NodeSpec = {
  content: 'text*',
  attrs: attrs({
    key: { default: '' },
    schemaPath: { default: '' },
  }),
  defining: true,
};

// --- Schema ---

export const starchSchema = new Schema({
  nodes: {
    doc,
    text: {},
    metadata,
    scene_node,
    geometry_slot,
    property_slot,
    compound_slot,
    draft_slot,
    style_ref,
    style_block,
    animate_block,
    keyframe_block,
    keyframe_entry,
    chapter,
    images_block,
    image_entry,
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/starchSchema.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/editor/schema/starchSchema.ts src/editor/schema/schemaBuilder.ts src/__tests__/editor/starchSchema.test.ts
git commit -m "feat: ProseMirror schema definition for structural editor"
```

---

## Task 3: Model Extraction — `extractModel`

A pure function that walks a ProseMirror doc and produces the JSON model the renderer expects. No parsing — just reading node types, attrs, and text content.

**Files:**
- Create: `src/editor/extractModel.ts`
- Test: `src/__tests__/editor/extractModel.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/editor/extractModel.test.ts
import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';
import { extractModel } from '../../editor/extractModel';

function makeDoc(...children: Parameters<typeof starchSchema.node>[2]) {
  return starchSchema.node('doc', null, children);
}

function sceneNode(
  id: string,
  geomType: string,
  geomText: string,
  props: Array<{ key: string; schemaPath: string; text: string }> = [],
) {
  return starchSchema.node('scene_node', {
    id, schemaPath: `objects.${id}`, display: 'inline', geometryType: geomType,
  }, [
    starchSchema.node('geometry_slot', {
      keyword: geomType, schemaPath: geomType,
    }, [starchSchema.text(geomText)]),
    ...props.map(p =>
      starchSchema.node('property_slot', {
        key: p.key, schemaPath: p.schemaPath,
      }, [starchSchema.text(p.text)])
    ),
  ]);
}

describe('extractModel', () => {
  it('extracts empty doc', () => {
    const doc = makeDoc([]);
    const model = extractModel(doc);
    expect(model).toEqual({});
  });

  it('extracts metadata', () => {
    const doc = makeDoc([
      starchSchema.node('metadata', { key: 'name', schemaPath: 'name' },
        [starchSchema.text('My Scene')]),
      starchSchema.node('metadata', { key: 'background', schemaPath: 'background' },
        [starchSchema.text('white')]),
    ]);
    const model = extractModel(doc);
    expect(model.name).toBe('My Scene');
    expect(model.background).toBe('white');
  });

  it('extracts a scene node with geometry', () => {
    const doc = makeDoc([
      sceneNode('box', 'rect', '100x200'),
    ]);
    const model = extractModel(doc);
    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 200 });
  });

  it('extracts scalar properties', () => {
    const doc = makeDoc([
      sceneNode('box', 'rect', '100x200', [
        { key: 'opacity', schemaPath: 'opacity', text: '0.5' },
        { key: 'fill', schemaPath: 'fill', text: 'red' },
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.objects[0].opacity).toBe(0.5);
    expect(model.objects[0].fill).toBe('red');
  });

  it('extracts compound properties', () => {
    const doc = makeDoc([
      starchSchema.node('scene_node', {
        id: 'a', schemaPath: 'objects.a', display: 'inline', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('10x10')]),
        starchSchema.node('compound_slot', {
          key: 'stroke', schemaPath: 'stroke',
        }, [
          starchSchema.node('property_slot', {
            key: 'color', schemaPath: 'stroke.color',
          }, [starchSchema.text('blue')]),
          starchSchema.node('property_slot', {
            key: 'width', schemaPath: 'stroke.width',
          }, [starchSchema.text('3')]),
        ]),
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.objects[0].stroke).toEqual({ color: 'blue', width: 3 });
  });

  it('extracts style blocks', () => {
    const doc = makeDoc([
      starchSchema.node('style_block', {
        name: 'myStyle', schemaPath: 'styles.myStyle',
      }, [
        starchSchema.node('property_slot', {
          key: 'fill', schemaPath: 'fill',
        }, [starchSchema.text('green')]),
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.styles).toBeDefined();
    expect(model.styles.myStyle.fill).toBe('green');
  });

  it('extracts animate block with keyframes', () => {
    const doc = makeDoc([
      starchSchema.node('animate_block', { schemaPath: 'animate' }, [
        starchSchema.node('property_slot', {
          key: 'duration', schemaPath: 'animate.duration',
        }, [starchSchema.text('5')]),
        starchSchema.node('keyframe_block', {
          time: 0, schemaPath: 'animate.keyframes.0',
        }, [
          starchSchema.node('keyframe_entry', {
            target: 'box', property: 'opacity', schemaPath: 'animate.keyframes.0.changes',
          }, [starchSchema.text('1')]),
        ]),
        starchSchema.node('keyframe_block', {
          time: 2.5, schemaPath: 'animate.keyframes.1',
        }, [
          starchSchema.node('keyframe_entry', {
            target: 'box', property: 'opacity', schemaPath: 'animate.keyframes.1.changes',
          }, [starchSchema.text('0')]),
        ]),
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.animate).toBeDefined();
    expect(model.animate.duration).toBe(5);
    expect(model.animate.keyframes).toHaveLength(2);
    expect(model.animate.keyframes[0].time).toBe(0);
    expect(model.animate.keyframes[0].changes['box.opacity']).toBe(1);
  });

  it('extracts images block', () => {
    const doc = makeDoc([
      starchSchema.node('images_block', { schemaPath: 'images' }, [
        starchSchema.node('image_entry', {
          key: 'logo', schemaPath: 'images.logo',
        }, [starchSchema.text('logo.png')]),
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.images).toEqual({ logo: 'logo.png' });
  });

  it('extracts nested children', () => {
    const doc = makeDoc([
      starchSchema.node('scene_node', {
        id: 'parent', schemaPath: 'objects.parent', display: 'block', geometryType: 'rect',
      }, [
        starchSchema.node('geometry_slot', {
          keyword: 'rect', schemaPath: 'rect',
        }, [starchSchema.text('200x200')]),
        starchSchema.node('scene_node', {
          id: 'child', schemaPath: 'objects.parent.children.0', display: 'inline', geometryType: 'ellipse',
        }, [
          starchSchema.node('geometry_slot', {
            keyword: 'ellipse', schemaPath: 'ellipse',
          }, [starchSchema.text('30x30')]),
        ]),
      ]),
    ]);
    const model = extractModel(doc);
    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('child');
    expect(model.objects[0].children[0].ellipse).toEqual({ rx: 30, ry: 30 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/extractModel.test.ts`
Expected: FAIL — module `../../editor/extractModel` not found

- [ ] **Step 3: Implement extractModel**

```typescript
// src/editor/extractModel.ts
import type { Node as PmNode } from 'prosemirror-model';

/**
 * Pure function: ProseMirror doc → JSON model for the renderer.
 * Walks the doc tree, reading node types, attrs, and text content.
 */
export function extractModel(doc: PmNode): any {
  const result: any = {};

  doc.forEach((node) => {
    switch (node.type.name) {
      case 'metadata':
        extractMetadata(node, result);
        break;
      case 'scene_node':
        if (!result.objects) result.objects = [];
        result.objects.push(extractSceneNode(node));
        break;
      case 'style_block':
        if (!result.styles) result.styles = {};
        result.styles[node.attrs.name] = extractPropertyBag(node);
        break;
      case 'animate_block':
        result.animate = extractAnimateBlock(node);
        break;
      case 'images_block':
        result.images = extractImagesBlock(node);
        break;
    }
  });

  return result;
}

function textContent(node: PmNode): string {
  return node.textContent;
}

function extractMetadata(node: PmNode, result: any): void {
  const key = node.attrs.key as string;
  const text = textContent(node);
  if (key && text) {
    result[key] = text;
  }
}

function extractSceneNode(node: PmNode): any {
  const obj: any = { id: node.attrs.id };
  const children: any[] = [];

  node.forEach((child) => {
    switch (child.type.name) {
      case 'geometry_slot':
        obj[child.attrs.keyword] = parseGeometryText(child.attrs.keyword, textContent(child));
        break;
      case 'property_slot':
        obj[child.attrs.key] = parseSlotValue(child.attrs.schemaPath, textContent(child));
        break;
      case 'compound_slot':
        obj[child.attrs.key] = extractCompound(child);
        break;
      case 'style_ref':
        obj.style = child.attrs.name;
        break;
      case 'scene_node':
        children.push(extractSceneNode(child));
        break;
    }
  });

  if (children.length > 0) obj.children = children;
  return obj;
}

function extractCompound(node: PmNode): any {
  const result: any = {};
  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      result[child.attrs.key] = parseSlotValue(child.attrs.schemaPath, textContent(child));
    }
  });
  return result;
}

function extractPropertyBag(node: PmNode): any {
  const result: any = {};
  node.forEach((child) => {
    if (child.type.name === 'property_slot') {
      result[child.attrs.key] = parseSlotValue(child.attrs.schemaPath, textContent(child));
    } else if (child.type.name === 'compound_slot') {
      result[child.attrs.key] = extractCompound(child);
    }
  });
  return result;
}

function extractAnimateBlock(node: PmNode): any {
  const result: any = { keyframes: [] };

  node.forEach((child) => {
    switch (child.type.name) {
      case 'property_slot':
        result[child.attrs.key] = parseSlotValue(child.attrs.schemaPath, textContent(child));
        break;
      case 'keyframe_block':
        result.keyframes.push(extractKeyframeBlock(child));
        break;
      case 'chapter':
        if (!result.chapters) result.chapters = [];
        result.chapters.push(parseChapterText(textContent(child)));
        break;
    }
  });

  return result;
}

function extractKeyframeBlock(node: PmNode): any {
  const kf: any = { time: node.attrs.time, changes: {} };

  node.forEach((child) => {
    if (child.type.name === 'keyframe_entry') {
      const target = child.attrs.target;
      const property = child.attrs.property;
      const value = parseSlotValue(child.attrs.schemaPath, textContent(child));
      kf.changes[`${target}.${property}`] = value;
    }
  });

  return kf;
}

function extractImagesBlock(node: PmNode): Record<string, string> {
  const images: Record<string, string> = {};
  node.forEach((child) => {
    if (child.type.name === 'image_entry') {
      images[child.attrs.key] = textContent(child);
    }
  });
  return images;
}

function parseChapterText(text: string): any {
  // Chapters: "name" at 3.5
  const match = text.match(/^"(.+?)"\s+at\s+(.+)$/);
  if (match) return { name: match[1], time: parseFloat(match[2]) };
  return { name: text, time: 0 };
}

// --- Value Parsing ---

/**
 * Parse geometry text into the expected object shape.
 * E.g., "100x200" → { w: 100, h: 200 } for rect
 *        "50x50" → { rx: 50, ry: 50 } for ellipse
 */
export function parseGeometryText(keyword: string, text: string): any {
  const dimMatch = text.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (dimMatch) {
    const a = parseFloat(dimMatch[1]);
    const b = parseFloat(dimMatch[2]);
    switch (keyword) {
      case 'rect': return { w: a, h: b };
      case 'ellipse': return { rx: a, ry: b };
      case 'image': return { w: a, h: b };
      default: return { w: a, h: b };
    }
  }

  // Quoted text content: "hello world"
  const quotedMatch = text.match(/^"(.+)"$/);
  if (quotedMatch) {
    return { content: quotedMatch[1] };
  }

  return {};
}

/**
 * Parse a slot's text content into a typed value.
 * Uses the schemaPath to determine expected type, but keeps parsing simple
 * since each slot holds a single value.
 */
export function parseSlotValue(schemaPath: string, text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;

  // String (unquoted — used for colors, enums, etc.)
  return trimmed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/extractModel.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/extractModel.ts src/__tests__/editor/extractModel.test.ts
git commit -m "feat: extractModel — pure function from ProseMirror doc to JSON model"
```

---

## Task 4: DSL Import — `importDsl`

Converts DSL text into a ProseMirror document. Uses the existing `buildAstFromText` parser to get the model JSON, then builds PM nodes from it.

**Files:**
- Create: `src/editor/io/importDsl.ts`
- Test: `src/__tests__/editor/importDsl.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/editor/importDsl.test.ts
import { describe, it, expect } from 'vitest';
import { importDsl } from '../../editor/io/importDsl';
import { extractModel } from '../../editor/extractModel';

describe('importDsl', () => {
  it('imports a minimal scene with one rect node', () => {
    const dsl = `objects\n  box:\n    rect 100x200\n    fill red`;
    const { doc, formatHints } = importDsl(dsl);

    expect(doc.type.name).toBe('doc');
    // Should have a scene_node
    let sceneNodeFound = false;
    doc.forEach(child => {
      if (child.type.name === 'scene_node') {
        sceneNodeFound = true;
        expect(child.attrs.id).toBe('box');
        expect(child.attrs.geometryType).toBe('rect');
      }
    });
    expect(sceneNodeFound).toBe(true);
  });

  it('round-trips: import then extractModel matches parser output', () => {
    const dsl = `objects\n  box:\n    rect 100x200\n    fill red\n    opacity 0.5`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.objects).toHaveLength(1);
    expect(model.objects[0].id).toBe('box');
    expect(model.objects[0].rect).toEqual({ w: 100, h: 200 });
    expect(model.objects[0].fill).toBe('red');
    expect(model.objects[0].opacity).toBe(0.5);
  });

  it('imports metadata (name, background)', () => {
    const dsl = `name "Test Scene"\nbackground white\nobjects\n  a:\n    rect 10x10`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.name).toBe('Test Scene');
    expect(model.background).toBe('white');
  });

  it('imports style blocks', () => {
    const dsl = `styles\n  accent\n    fill blue\nobjects\n  a:\n    rect 10x10`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.styles).toBeDefined();
    expect(model.styles.accent).toBeDefined();
    expect(model.styles.accent.fill).toBe('blue');
  });

  it('imports animate block with keyframes', () => {
    const dsl = `objects\n  box:\n    rect 10x10\nanimate 5s\n  0\n    box.opacity 1\n  2.5\n    box.opacity 0`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.animate).toBeDefined();
    expect(model.animate.duration).toBe(5);
    expect(model.animate.keyframes).toHaveLength(2);
  });

  it('preserves format hints', () => {
    const dsl = `objects\n  box:\n    rect 100x200\n    fill red`;
    const { formatHints } = importDsl(dsl);
    expect(formatHints).toBeDefined();
  });

  it('imports compound properties (stroke)', () => {
    const dsl = `objects\n  box:\n    rect 10x10\n    stroke red width=2`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.objects[0].stroke).toBeDefined();
    expect(model.objects[0].stroke.color).toBe('red');
    expect(model.objects[0].stroke.width).toBe(2);
  });

  it('imports nested children', () => {
    const dsl = `objects\n  parent:\n    rect 200x200\n    child:\n      ellipse 50x50`;
    const { doc } = importDsl(dsl);
    const model = extractModel(doc);

    expect(model.objects[0].children).toHaveLength(1);
    expect(model.objects[0].children[0].id).toBe('child');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/importDsl.test.ts`
Expected: FAIL — module `../../editor/io/importDsl` not found

- [ ] **Step 3: Implement importDsl**

```typescript
// src/editor/io/importDsl.ts
import type { Node as PmNode } from 'prosemirror-model';
import { starchSchema } from '../schema/starchSchema';
import { buildAstFromText } from '../../dsl/astParser';
import type { FormatHints } from '../../dsl/formatHints';
import { getDsl } from '../../dsl/dslMeta';
import {
  NodeSchema, RectGeomSchema, EllipseGeomSchema, TextGeomSchema,
  PathGeomSchema, ImageGeomSchema, CameraSchema,
} from '../../types/node';
import { detectSchemaType } from '../../types/schemaRegistry';
import {
  StrokeSchema, TransformSchema, DashSchema, LayoutSchema,
} from '../../types/properties';

interface ImportResult {
  doc: PmNode;
  formatHints: FormatHints;
}

const COMPOUND_KEYS = new Set(['stroke', 'transform', 'dash', 'layout']);
const GEOMETRY_TYPES = ['rect', 'ellipse', 'text', 'path', 'image', 'camera'];

export function importDsl(text: string): ImportResult {
  const { model, formatHints } = buildAstFromText(text);
  const doc = modelToDoc(model, formatHints);
  return { doc, formatHints };
}

function modelToDoc(model: any, formatHints: FormatHints): PmNode {
  const children: PmNode[] = [];

  // Metadata
  for (const key of ['name', 'description', 'background', 'viewport']) {
    if (model[key] != null) {
      const value = typeof model[key] === 'string' ? model[key] : JSON.stringify(model[key]);
      children.push(
        starchSchema.node('metadata', { key, schemaPath: key },
          value ? [starchSchema.text(value)] : [])
      );
    }
  }

  // Images
  if (model.images && Object.keys(model.images).length > 0) {
    const entries = Object.entries(model.images as Record<string, string>).map(([k, v]) =>
      starchSchema.node('image_entry', { key: k, schemaPath: `images.${k}` },
        [starchSchema.text(v)])
    );
    children.push(starchSchema.node('images_block', { schemaPath: 'images' }, entries));
  }

  // Styles
  if (model.styles) {
    for (const [name, styleDef] of Object.entries(model.styles as Record<string, any>)) {
      const propNodes = objectToPropertyNodes(styleDef, '');
      children.push(
        starchSchema.node('style_block', { name, schemaPath: `styles.${name}` }, propNodes)
      );
    }
  }

  // Objects
  if (model.objects) {
    for (const obj of model.objects) {
      children.push(modelNodeToSceneNode(obj, formatHints));
    }
  }

  // Animate
  if (model.animate) {
    children.push(modelAnimateToBlock(model.animate));
  }

  return starchSchema.node('doc', null, children);
}

function modelNodeToSceneNode(obj: any, formatHints: FormatHints): PmNode {
  const id = obj.id || '';
  const display = formatHints.nodes[id]?.display || 'inline';

  // Detect geometry type
  let geometryType = '';
  for (const gt of GEOMETRY_TYPES) {
    if (obj[gt]) { geometryType = gt; break; }
  }

  const nodeChildren: PmNode[] = [];

  // Geometry slot
  if (geometryType && obj[geometryType]) {
    const geomText = geometryToText(geometryType, obj[geometryType]);
    nodeChildren.push(
      starchSchema.node('geometry_slot', {
        keyword: geometryType, schemaPath: geometryType,
      }, geomText ? [starchSchema.text(geomText)] : [])
    );
  }

  // Properties
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'id' || key === 'children' || key === 'style' || key === 'template' || key === 'props') continue;
    if (GEOMETRY_TYPES.includes(key)) continue;

    if (COMPOUND_KEYS.has(key) && typeof value === 'object' && value !== null) {
      // Compound slot
      const propNodes = Object.entries(value as Record<string, unknown>).map(([ck, cv]) =>
        starchSchema.node('property_slot', {
          key: ck, schemaPath: `${key}.${ck}`,
        }, [starchSchema.text(String(cv))])
      );
      if (propNodes.length > 0) {
        nodeChildren.push(
          starchSchema.node('compound_slot', { key, schemaPath: key }, propNodes)
        );
      }
    } else {
      // Scalar property
      nodeChildren.push(
        starchSchema.node('property_slot', {
          key, schemaPath: key,
        }, [starchSchema.text(String(value))])
      );
    }
  }

  // Style reference
  if (obj.style) {
    nodeChildren.push(starchSchema.node('style_ref', { name: obj.style }));
  }

  // Nested children
  if (obj.children) {
    for (const child of obj.children) {
      nodeChildren.push(modelNodeToSceneNode(child, formatHints));
    }
  }

  return starchSchema.node('scene_node', {
    id, schemaPath: `objects.${id}`, display, geometryType,
  }, nodeChildren);
}

function modelAnimateToBlock(anim: any): PmNode {
  const children: PmNode[] = [];

  // Duration and other config as property slots
  if (anim.duration != null) {
    children.push(starchSchema.node('property_slot', {
      key: 'duration', schemaPath: 'animate.duration',
    }, [starchSchema.text(String(anim.duration))]));
  }
  if (anim.loop) {
    children.push(starchSchema.node('property_slot', {
      key: 'loop', schemaPath: 'animate.loop',
    }, [starchSchema.text('true')]));
  }
  if (anim.easing) {
    children.push(starchSchema.node('property_slot', {
      key: 'easing', schemaPath: 'animate.easing',
    }, [starchSchema.text(anim.easing)]));
  }

  // Keyframes
  if (anim.keyframes) {
    for (let i = 0; i < anim.keyframes.length; i++) {
      const kf = anim.keyframes[i];
      const entries: PmNode[] = [];

      if (kf.changes) {
        for (const [changePath, value] of Object.entries(kf.changes as Record<string, unknown>)) {
          const parts = changePath.split('.');
          const target = parts.slice(0, -1).join('.');
          const property = parts[parts.length - 1];
          entries.push(starchSchema.node('keyframe_entry', {
            target, property, schemaPath: `animate.keyframes.${i}.changes`,
          }, [starchSchema.text(String(value))]));
        }
      }

      children.push(starchSchema.node('keyframe_block', {
        time: kf.time ?? 0, schemaPath: `animate.keyframes.${i}`,
      }, entries));
    }
  }

  // Chapters
  if (anim.chapters) {
    for (const ch of anim.chapters) {
      children.push(starchSchema.node('chapter', {
        schemaPath: 'animate.chapters',
      }, [starchSchema.text(`"${ch.name}" at ${ch.time}`)]));
    }
  }

  return starchSchema.node('animate_block', { schemaPath: 'animate' }, children);
}

function objectToPropertyNodes(obj: any, parentPath: string): PmNode[] {
  const nodes: PmNode[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const schemaPath = parentPath ? `${parentPath}.${key}` : key;
    if (COMPOUND_KEYS.has(key) && typeof value === 'object' && value !== null) {
      const propNodes = Object.entries(value as Record<string, unknown>).map(([ck, cv]) =>
        starchSchema.node('property_slot', {
          key: ck, schemaPath: `${schemaPath}.${ck}`,
        }, [starchSchema.text(String(cv))])
      );
      nodes.push(starchSchema.node('compound_slot', { key, schemaPath }, propNodes));
    } else {
      nodes.push(starchSchema.node('property_slot', {
        key, schemaPath,
      }, [starchSchema.text(String(value))]));
    }
  }
  return nodes;
}

function geometryToText(type: string, geom: any): string {
  switch (type) {
    case 'rect':
    case 'image':
      return `${geom.w ?? 0}x${geom.h ?? 0}`;
    case 'ellipse':
      return `${geom.rx ?? 0}x${geom.ry ?? 0}`;
    case 'text':
      return `"${geom.content ?? ''}"`;
    default:
      return '';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/importDsl.test.ts`
Expected: All PASS (some tests may need adjustment based on exact parser output shape — iterate if needed)

- [ ] **Step 5: Commit**

```bash
git add src/editor/io/importDsl.ts src/__tests__/editor/importDsl.test.ts
git commit -m "feat: importDsl — DSL text to ProseMirror document"
```

---

## Task 5: DSL Export — `exportDsl`

Converts a ProseMirror document back to DSL text. Uses `extractModel` to get JSON, then delegates to the existing emitter.

**Files:**
- Create: `src/editor/io/exportDsl.ts`
- Test: `src/__tests__/editor/exportDsl.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/editor/exportDsl.test.ts
import { describe, it, expect } from 'vitest';
import { importDsl } from '../../editor/io/importDsl';
import { exportDsl } from '../../editor/io/exportDsl';
import { buildAstFromText } from '../../dsl/astParser';

describe('exportDsl', () => {
  it('round-trips a simple scene', () => {
    const original = `objects\n  box:\n    rect 100x200\n    fill red`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    // Re-parse to verify it's valid DSL
    const reparsed = buildAstFromText(text);
    expect(reparsed.model.objects).toHaveLength(1);
    expect(reparsed.model.objects[0].id).toBe('box');
    expect(reparsed.model.objects[0].rect.w).toBe(100);
    expect(reparsed.model.objects[0].fill).toBe('red');
  });

  it('round-trips metadata', () => {
    const original = `name "My Scene"\nbackground white\nobjects\n  a:\n    rect 10x10`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    const reparsed = buildAstFromText(text);
    expect(reparsed.model.name).toBe('My Scene');
    expect(reparsed.model.background).toBe('white');
  });

  it('produces parseable DSL for compound properties', () => {
    const original = `objects\n  box:\n    rect 10x10\n    stroke red width=2`;
    const { doc, formatHints } = importDsl(original);
    const text = exportDsl(doc, formatHints);

    const reparsed = buildAstFromText(text);
    expect(reparsed.model.objects[0].stroke).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/exportDsl.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement exportDsl**

```typescript
// src/editor/io/exportDsl.ts
import type { Node as PmNode } from 'prosemirror-model';
import { extractModel } from '../extractModel';
import { buildAstFromModel } from '../../dsl/astEmitter';
import type { FormatHints } from '../../dsl/formatHints';
import { emptyFormatHints } from '../../dsl/formatHints';

/**
 * Export a ProseMirror document as DSL text.
 * Extracts the model, then delegates to the existing emitter.
 */
export function exportDsl(doc: PmNode, formatHints?: FormatHints): string {
  const model = extractModel(doc);
  const hints = formatHints ?? emptyFormatHints();

  // Build format hints from doc node attrs
  const nodeFormats: Record<string, 'inline' | 'block'> = {};
  doc.forEach((node) => {
    if (node.type.name === 'scene_node') {
      collectDisplayHints(node, nodeFormats);
    }
  });

  const { text } = buildAstFromModel(model, hints, nodeFormats);
  return text;
}

function collectDisplayHints(
  node: PmNode,
  result: Record<string, 'inline' | 'block'>,
): void {
  if (node.type.name === 'scene_node') {
    const id = node.attrs.id as string;
    const display = node.attrs.display as 'inline' | 'block';
    if (id && display) {
      result[id] = display;
    }
    node.forEach((child) => {
      if (child.type.name === 'scene_node') {
        collectDisplayHints(child, result);
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/exportDsl.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/io/exportDsl.ts src/__tests__/editor/exportDsl.test.ts
git commit -m "feat: exportDsl — ProseMirror document to DSL text"
```

---

## Task 6: DraftNode Type and Resolver Plugin

The DraftNode represents text the user is actively typing that hasn't resolved to a valid value yet. The resolver plugin watches transactions and resolves drafts when they validate against their schema.

**Files:**
- Create: `src/editor/schema/draftNode.ts`
- Create: `src/editor/plugins/draftResolverPlugin.ts`
- Test: `src/__tests__/editor/draftResolver.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/editor/draftResolver.test.ts
import { describe, it, expect } from 'vitest';
import { starchSchema } from '../../editor/schema/starchSchema';
import { tryResolveDraft } from '../../editor/schema/draftNode';

describe('draftNode resolution', () => {
  it('resolves a number draft to a valid value', () => {
    const result = tryResolveDraft('0.5', 'opacity');
    expect(result).toEqual({ resolved: true, value: 0.5 });
  });

  it('does not resolve invalid number text', () => {
    const result = tryResolveDraft('abc', 'opacity');
    expect(result).toEqual({ resolved: false, hint: 'expected: number (0–1)' });
  });

  it('resolves a color name', () => {
    const result = tryResolveDraft('red', 'fill');
    expect(result).toEqual({ resolved: true, value: 'red' });
  });

  it('resolves boolean text', () => {
    const result = tryResolveDraft('true', 'visible');
    expect(result).toEqual({ resolved: true, value: true });
  });

  it('resolves enum value', () => {
    const result = tryResolveDraft('row', 'layout.direction');
    expect(result).toEqual({ resolved: true, value: 'row' });
  });

  it('rejects invalid enum value', () => {
    const result = tryResolveDraft('diagonal', 'layout.direction');
    expect(result.resolved).toBe(false);
  });

  it('resolves geometry dimension text', () => {
    const result = tryResolveDraft('100x200', 'rect');
    expect(result).toEqual({ resolved: true, value: { w: 100, h: 200 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/draftResolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement draftNode helpers**

```typescript
// src/editor/schema/draftNode.ts
import { getPropertySchema, detectSchemaType, getEnumValues, getNumberConstraints } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { parseGeometryText, parseSlotValue } from '../extractModel';

interface ResolveResult {
  resolved: boolean;
  value?: unknown;
  hint?: string;
}

const GEOMETRY_KEYWORDS = new Set(['rect', 'ellipse', 'text', 'path', 'image', 'camera']);

/**
 * Attempt to resolve draft text against a schema path.
 * Returns { resolved: true, value } if valid, or { resolved: false, hint } if not.
 */
export function tryResolveDraft(text: string, schemaPath: string): ResolveResult {
  const trimmed = text.trim();
  if (!trimmed) return { resolved: false, hint: 'empty' };

  // Geometry slots
  if (GEOMETRY_KEYWORDS.has(schemaPath)) {
    const value = parseGeometryText(schemaPath, trimmed);
    if (value && Object.keys(value).length > 0) {
      return { resolved: true, value };
    }
    return { resolved: false, hint: `expected: ${schemaPath} dimensions` };
  }

  // Look up the schema for this path
  const schema = getPropertySchema(schemaPath, NodeSchema);
  if (!schema) {
    // Fall back to simple value parsing
    const value = parseSlotValue(schemaPath, trimmed);
    return value !== undefined
      ? { resolved: true, value }
      : { resolved: false, hint: 'unknown schema' };
  }

  // Try Zod validation
  const parseResult = schema.safeParse(parseSlotValue(schemaPath, trimmed));
  if (parseResult.success) {
    return { resolved: true, value: parseResult.data };
  }

  // Build a helpful hint
  const type = detectSchemaType(schema);
  let hint = `expected: ${type}`;

  if (type === 'number') {
    const constraints = getNumberConstraints(schema);
    if (constraints) {
      const parts: string[] = [];
      if (constraints.min != null) parts.push(`${constraints.min}`);
      if (constraints.max != null) parts.push(`${constraints.max}`);
      if (parts.length === 2) hint = `expected: number (${parts[0]}–${parts[1]})`;
    }
  } else if (type === 'enum') {
    const values = getEnumValues(schema);
    if (values) hint = `expected: ${values.join(' | ')}`;
  }

  return { resolved: false, hint };
}
```

- [ ] **Step 4: Implement the resolver plugin**

```typescript
// src/editor/plugins/draftResolverPlugin.ts
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { tryResolveDraft } from '../schema/draftNode';

export const draftResolverKey = new PluginKey('draftResolver');

/**
 * Plugin that watches for text changes in draft_slot nodes and
 * attempts to resolve them. When valid, dispatches a transaction
 * to replace the draft with the resolved value (updates the parent
 * property_slot's text).
 *
 * For now, this plugin adds validation decorations.
 * Resolution to typed nodes happens on blur/Tab/Enter.
 */
export function draftResolverPlugin(): Plugin {
  return new Plugin({
    key: draftResolverKey,

    appendTransaction(transactions, oldState, newState) {
      // Only process if document changed
      const docChanged = transactions.some(tr => tr.docChanged);
      if (!docChanged) return null;

      // Walk the doc looking for draft_slot nodes with valid text
      let tr = newState.tr;
      let changed = false;

      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'draft_slot') {
          const text = node.textContent;
          const result = tryResolveDraft(text, node.attrs.schemaPath);

          if (result.resolved) {
            // Replace draft_slot with property_slot
            const propertySlot = newState.schema.node('property_slot', {
              key: node.attrs.parentKey,
              schemaPath: node.attrs.schemaPath,
            }, text ? [newState.schema.text(text)] : []);

            tr = tr.replaceWith(pos, pos + node.nodeSize, propertySlot);
            changed = true;
          }
        }
      });

      return changed ? tr : null;
    },
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/draftResolver.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/editor/schema/draftNode.ts src/editor/plugins/draftResolverPlugin.ts src/__tests__/editor/draftResolver.test.ts
git commit -m "feat: DraftNode type with schema-aware validation and resolver plugin"
```

---

## Task 7: Widget Migration

Move existing popup components from `src/editor/popups/` to `src/editor/views/widgets/`, stripping CM6 dependencies. The widgets keep their React `value`/`onChange` interface.

**Files:**
- Create: `src/editor/views/widgets/ColorPicker.tsx` (copy from `src/editor/popups/ColorPicker.tsx`)
- Create: `src/editor/views/widgets/NumberSlider.tsx` (copy from `src/editor/popups/NumberSlider.tsx`)
- Create: `src/editor/views/widgets/EnumDropdown.tsx` (copy from `src/editor/popups/EnumDropdown.tsx`)
- Create: `src/editor/views/widgets/PointRefEditor.tsx` (copy from `src/editor/popups/PointRefEditor.tsx`)
- Create: `src/editor/views/widgets/AnchorEditor.tsx` (copy from `src/editor/popups/AnchorEditor.tsx`)
- Create: `src/editor/views/widgets/AddPropertyPopup.tsx` (copy from `src/editor/popups/AddPropertyPopup.tsx`)

- [ ] **Step 1: Check existing popups for CM6 imports**

Run: `grep -l "codemirror\|@codemirror" src/editor/popups/*.tsx`
Expected: Identify which files import CM6 modules (likely none — popups are pure React)

- [ ] **Step 2: Copy widgets to new location**

```bash
mkdir -p src/editor/views/widgets
cp src/editor/popups/ColorPicker.tsx src/editor/views/widgets/ColorPicker.tsx
cp src/editor/popups/NumberSlider.tsx src/editor/views/widgets/NumberSlider.tsx
cp src/editor/popups/EnumDropdown.tsx src/editor/views/widgets/EnumDropdown.tsx
cp src/editor/popups/PointRefEditor.tsx src/editor/views/widgets/PointRefEditor.tsx
cp src/editor/popups/AnchorEditor.tsx src/editor/views/widgets/AnchorEditor.tsx
cp src/editor/popups/AddPropertyPopup.tsx src/editor/views/widgets/AddPropertyPopup.tsx
```

- [ ] **Step 3: Update any internal import paths**

Check each copied file for imports from `../` or `../../` that reference popups-specific paths and update them. The widgets should import from `../../types/schemaRegistry`, `../../types/color`, etc.

Run: `grep -n "from '\.\." src/editor/views/widgets/*.tsx | head -30`

Update relative imports as needed. These files likely import from `../../types/` paths which will need to become `../../../types/` from the new location.

- [ ] **Step 4: Verify widgets compile**

Run: `npx tsc --noEmit 2>&1 | grep "views/widgets" || echo "No type errors in widgets"`
Expected: No errors in the widget files

- [ ] **Step 5: Commit**

```bash
git add src/editor/views/widgets/
git commit -m "feat: migrate popup widgets to editor/views/widgets, strip CM6 deps"
```

---

## Task 8: Base NodeViews — PropertySlotView and SceneNodeView

The React NodeViews that render ProseMirror nodes. These are the heart of the visual editor.

**Files:**
- Create: `src/editor/views/PropertySlotView.tsx`
- Create: `src/editor/views/SceneNodeView.tsx`
- Create: `src/editor/views/MetadataView.tsx`
- Create: `src/editor/views/SectionView.tsx`
- Create: `src/editor/views/KeyframeView.tsx`
- Create: `src/editor/views/CompoundSlotView.tsx`
- Create: `src/editor/editorStyles.css`

- [ ] **Step 1: Create base editor styles**

```css
/* src/editor/editorStyles.css */
.starch-editor {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: #1a1a2e;
  color: #e0e0e0;
  padding: 8px;
  min-height: 200px;
  cursor: text;
}

.starch-editor .ProseMirror {
  outline: none;
  white-space: pre;
}

/* Scene node */
.scene-node {
  margin: 2px 0;
  border-left: 2px solid transparent;
  padding-left: 4px;
}
.scene-node:hover {
  border-left-color: #444;
}
.scene-node.selected {
  border-left-color: #6c5ce7;
  background: rgba(108, 92, 231, 0.05);
}

/* Node header (id + geometry) */
.scene-node-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.scene-node-id {
  color: #a29bfe;
  font-weight: bold;
}
.scene-node-id::after {
  content: ':';
  color: #555;
}

/* Geometry slot */
.geometry-slot .keyword {
  color: #6c5ce7;
  font-weight: bold;
}
.geometry-slot .value {
  color: #fd79a8;
}

/* Property slot */
.property-slot {
  padding-left: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.property-slot .key {
  color: #74b9ff;
}
.property-slot .value {
  color: #e0e0e0;
}

/* Compound slot */
.compound-slot {
  padding-left: 16px;
}
.compound-slot > .compound-header {
  color: #74b9ff;
  font-weight: bold;
}

/* Color swatch */
.color-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid #555;
  vertical-align: middle;
  cursor: pointer;
}

/* Number value with scrubber hint */
.value.number:hover {
  text-decoration: underline;
  cursor: ew-resize;
}

/* Section headers */
.section-header {
  color: #636e72;
  font-weight: bold;
  margin-top: 8px;
  cursor: pointer;
  user-select: none;
}
.section-header::before {
  content: '▼ ';
  font-size: 10px;
}
.section-header.collapsed::before {
  content: '▶ ';
}

/* Style reference */
.style-ref {
  color: #00cec9;
  font-style: italic;
}
.style-ref::before {
  content: '@';
}

/* Metadata */
.metadata-line {
  color: #636e72;
}
.metadata-line .key {
  color: #00b894;
}

/* Keyframe */
.keyframe-header {
  color: #fdcb6e;
  font-weight: bold;
}
.keyframe-entry {
  padding-left: 16px;
}
.keyframe-entry .target {
  color: #a29bfe;
}
.keyframe-entry .property {
  color: #74b9ff;
}

/* Draft slot */
.draft-slot {
  color: #b2bec3;
  font-style: italic;
}
.draft-hint {
  color: #636e72;
  font-size: 11px;
  margin-left: 8px;
}

/* Fold gutter */
.fold-marker {
  color: #636e72;
  cursor: pointer;
  user-select: none;
  width: 16px;
  display: inline-block;
}
```

- [ ] **Step 2: Create PropertySlotView**

```tsx
// src/editor/views/PropertySlotView.tsx
import React, { useState, useRef, useCallback } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';
import { detectSchemaType, getPropertySchema, getEnumValues, getNumberConstraints } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';
import { ColorPicker } from './widgets/ColorPicker';
import { NumberSlider } from './widgets/NumberSlider';
import { EnumDropdown } from './widgets/EnumDropdown';

export function PropertySlotView() {
  const { node, contentRef, setAttrs } = useNodeViewContext();
  const [showWidget, setShowWidget] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  const key = node.attrs.key as string;
  const schemaPath = node.attrs.schemaPath as string;
  const schema = getPropertySchema(schemaPath, NodeSchema);
  const schemaType = schema ? detectSchemaType(schema) : 'unknown';

  const handleWidgetToggle = useCallback(() => {
    setShowWidget(prev => !prev);
  }, []);

  const renderInlineWidget = () => {
    if (schemaType === 'color') {
      const text = node.textContent;
      return (
        <span
          className="color-swatch"
          style={{ background: text }}
          onClick={handleWidgetToggle}
        />
      );
    }
    return null;
  };

  return (
    <div className="property-slot" ref={slotRef}>
      <span className="key">{key}</span>
      <span className="value" ref={contentRef} />
      {renderInlineWidget()}
    </div>
  );
}
```

- [ ] **Step 3: Create SceneNodeView**

```tsx
// src/editor/views/SceneNodeView.tsx
import React, { useState, useCallback } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function SceneNodeView() {
  const { node, contentRef } = useNodeViewContext();
  const [collapsed, setCollapsed] = useState(false);

  const id = node.attrs.id as string;
  const geometryType = node.attrs.geometryType as string;
  const display = node.attrs.display as string;

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  return (
    <div className={`scene-node ${collapsed ? 'collapsed' : ''}`}>
      <div className="scene-node-header">
        <span className="fold-marker" onClick={toggleCollapse}>
          {collapsed ? '▶' : '▼'}
        </span>
        <span className="scene-node-id">{id}</span>
      </div>
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}
```

- [ ] **Step 4: Create remaining views (MetadataView, SectionView, KeyframeView, CompoundSlotView)**

```tsx
// src/editor/views/MetadataView.tsx
import React from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function MetadataView() {
  const { node, contentRef } = useNodeViewContext();
  const key = node.attrs.key as string;

  return (
    <div className="metadata-line">
      <span className="key">{key}</span>{' '}
      <span ref={contentRef} />
    </div>
  );
}
```

```tsx
// src/editor/views/CompoundSlotView.tsx
import React, { useState, useCallback } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function CompoundSlotView() {
  const { node, contentRef } = useNodeViewContext();
  const [expanded, setExpanded] = useState(true);
  const key = node.attrs.key as string;

  return (
    <div className="compound-slot">
      <div
        className="compound-header"
        onClick={() => setExpanded(prev => !prev)}
      >
        {key}
      </div>
      {expanded && <div ref={contentRef} />}
    </div>
  );
}
```

```tsx
// src/editor/views/SectionView.tsx
import React, { useState } from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function SectionView({ label }: { label: string }) {
  const { node, contentRef } = useNodeViewContext();
  const [collapsed, setCollapsed] = useState(false);
  const name = node.attrs.name as string;

  return (
    <div className="section-block">
      <div
        className={`section-header ${collapsed ? 'collapsed' : ''}`}
        onClick={() => setCollapsed(prev => !prev)}
      >
        {label}{name ? ` ${name}` : ''}
      </div>
      {!collapsed && <div ref={contentRef} />}
    </div>
  );
}
```

```tsx
// src/editor/views/KeyframeView.tsx
import React from 'react';
import { useNodeViewContext } from '@prosemirror-adapter/react';

export function KeyframeBlockView() {
  const { node, contentRef } = useNodeViewContext();
  const time = node.attrs.time as number;

  return (
    <div className="keyframe-block">
      <div className="keyframe-header">{time}</div>
      <div ref={contentRef} />
    </div>
  );
}

export function KeyframeEntryView() {
  const { node, contentRef } = useNodeViewContext();
  const target = node.attrs.target as string;
  const property = node.attrs.property as string;

  return (
    <div className="keyframe-entry">
      <span className="target">{target}</span>.
      <span className="property">{property}</span>{' '}
      <span ref={contentRef} />
    </div>
  );
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | grep "editor/views" || echo "No type errors in views"`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/editor/views/ src/editor/editorStyles.css
git commit -m "feat: React NodeViews for structural editor — scene, property, compound, section, keyframe"
```

---

## Task 9: Navigation Plugin

Handles structural navigation: `Alt+Arrow` for node-level movement, `Tab/Shift+Tab` for slot cycling.

**Files:**
- Create: `src/editor/plugins/navigationPlugin.ts`
- Test: `src/__tests__/editor/navigationPlugin.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/editor/navigationPlugin.test.ts
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
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
  it('findNextSlot moves from geometry to first property', () => {
    const doc = makeTestDoc();
    // Position inside geometry_slot text
    const geomSlotStart = 2; // after doc and scene_node opening
    const next = findNextSlot(doc, geomSlotStart);
    expect(next).toBeGreaterThan(geomSlotStart);
  });

  it('findPrevSlot moves backwards', () => {
    const doc = makeTestDoc();
    const lastSlotPos = 20; // approximate
    const prev = findPrevSlot(doc, lastSlotPos);
    expect(prev).toBeLessThan(lastSlotPos);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/editor/navigationPlugin.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement navigation plugin**

```typescript
// src/editor/plugins/navigationPlugin.ts
import { keymap } from 'prosemirror-keymap';
import type { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

const EDITABLE_TYPES = new Set([
  'geometry_slot', 'property_slot', 'draft_slot',
  'keyframe_entry', 'image_entry', 'metadata', 'chapter',
]);

/**
 * Find all editable slot positions in the document (start of text content).
 */
function collectSlotPositions(doc: PmNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (EDITABLE_TYPES.has(node.type.name) && node.content.size > 0) {
      // Position just inside the node (start of text content)
      positions.push(pos + 1);
    }
  });
  return positions.sort((a, b) => a - b);
}

export function findNextSlot(doc: PmNode, currentPos: number): number | null {
  const slots = collectSlotPositions(doc);
  for (const pos of slots) {
    if (pos > currentPos) return pos;
  }
  return slots[0] ?? null; // wrap around
}

export function findPrevSlot(doc: PmNode, currentPos: number): number | null {
  const slots = collectSlotPositions(doc);
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i] < currentPos) return slots[i];
  }
  return slots[slots.length - 1] ?? null; // wrap around
}

function moveTo(view: EditorView, pos: number | null): boolean {
  if (pos == null) return false;
  const { tr } = view.state;
  view.dispatch(tr.setSelection(
    view.state.selection.constructor.near(view.state.doc.resolve(pos))
  ));
  view.focus();
  return true;
}

export function navigationPlugin(): Plugin {
  return keymap({
    'Tab': (state, dispatch, view) => {
      if (!view) return false;
      const pos = findNextSlot(state.doc, state.selection.from);
      return moveTo(view, pos);
    },
    'Shift-Tab': (state, dispatch, view) => {
      if (!view) return false;
      const pos = findPrevSlot(state.doc, state.selection.from);
      return moveTo(view, pos);
    },
    'Alt-ArrowDown': (state, dispatch, view) => {
      if (!view) return false;
      // Find next sibling node at same depth
      const pos = findNextSlot(state.doc, state.selection.from);
      return moveTo(view, pos);
    },
    'Alt-ArrowUp': (state, dispatch, view) => {
      if (!view) return false;
      const pos = findPrevSlot(state.doc, state.selection.from);
      return moveTo(view, pos);
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/editor/navigationPlugin.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/editor/plugins/navigationPlugin.ts src/__tests__/editor/navigationPlugin.test.ts
git commit -m "feat: structural navigation plugin — Tab/Alt+Arrow between slots"
```

---

## Task 10: Completion Plugin

Adapts the existing completion logic from `astCompletions.ts` to work as a ProseMirror plugin. Reads schema context from the current node's attrs.

**Files:**
- Create: `src/editor/plugins/completionPlugin.ts`
- Modify: `src/dsl/astCompletions.ts` (export additional helpers if needed)

- [ ] **Step 1: Create completion plugin**

```typescript
// src/editor/plugins/completionPlugin.ts
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { completionsAt, type CompletionItem } from '../../dsl/astCompletions';
import { getPropertySchema, detectSchemaType, getEnumValues } from '../../types/schemaRegistry';
import { NodeSchema } from '../../types/node';

export const completionKey = new PluginKey('completion');

interface CompletionState {
  active: boolean;
  items: CompletionItem[];
  selectedIndex: number;
  anchor: { top: number; left: number } | null;
}

const EMPTY: CompletionState = {
  active: false,
  items: [],
  selectedIndex: 0,
  anchor: null,
};

/**
 * Get schema-aware completions for the current cursor position.
 * Reads the enclosing node's schemaPath to scope suggestions.
 */
export function getCompletionsForPosition(
  view: EditorView,
): CompletionItem[] {
  const { state } = view;
  const pos = state.selection.from;
  const $pos = state.doc.resolve(pos);

  // Walk up to find the enclosing typed node
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    const schemaPath = node.attrs?.schemaPath as string | undefined;

    if (!schemaPath) continue;

    const text = node.textContent;
    const schema = getPropertySchema(schemaPath, NodeSchema);

    if (schema) {
      const type = detectSchemaType(schema);

      if (type === 'enum') {
        const values = getEnumValues(schema);
        if (values) {
          return values
            .filter(v => v.startsWith(text))
            .map(v => ({ label: v, type: 'value' as const }));
        }
      }

      // For color contexts, delegate to astCompletions
      if (type === 'color') {
        // Return color name suggestions
        const items: CompletionItem[] = [];
        // This will be expanded to use astCompletions color list
        return items;
      }
    }

    // For scene_node context, suggest property names
    if (node.type.name === 'scene_node') {
      const existingKeys = new Set<string>();
      node.forEach(child => {
        if (child.attrs?.key) existingKeys.add(child.attrs.key as string);
      });

      // Suggest properties not already present
      const items: CompletionItem[] = [];
      // Delegate to completionsAt for full suggestions
      return items;
    }
  }

  return [];
}

export function completionPlugin(): Plugin {
  return new Plugin({
    key: completionKey,

    props: {
      handleKeyDown(view, event) {
        if (event.key === ' ' && event.ctrlKey) {
          // Trigger completion
          const items = getCompletionsForPosition(view);
          if (items.length > 0) {
            // Completion menu rendering will be added when
            // the full completion UI is built in a follow-up task.
            // For now this logs items for debugging.
            console.log('Completions:', items);
          }
          return true;
        }
        return false;
      },
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/editor/plugins/completionPlugin.ts
git commit -m "feat: completion plugin scaffold — schema-aware completions for ProseMirror"
```

---

## Task 11: StructuralEditor Component

The main editor component that mounts ProseMirror with all plugins, NodeViews, and connects to the renderer via `extractModel`.

**Files:**
- Create: `src/editor/StructuralEditor.tsx`

- [ ] **Step 1: Implement StructuralEditor**

```tsx
// src/editor/StructuralEditor.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { ProseMirror, ProseMirrorProvider, useNodeViewFactory } from '@prosemirror-adapter/react';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';

import { starchSchema } from './schema/starchSchema';
import { extractModel } from './extractModel';
import { importDsl } from './io/importDsl';
import { exportDsl } from './io/exportDsl';
import { navigationPlugin } from './plugins/navigationPlugin';
import { completionPlugin } from './plugins/completionPlugin';
import { draftResolverPlugin } from './plugins/draftResolverPlugin';

import { SceneNodeView } from './views/SceneNodeView';
import { PropertySlotView } from './views/PropertySlotView';
import { CompoundSlotView } from './views/CompoundSlotView';
import { MetadataView } from './views/MetadataView';
import { SectionView } from './views/SectionView';
import { KeyframeBlockView, KeyframeEntryView } from './views/KeyframeView';

import './editorStyles.css';

import type { FormatHints } from '../dsl/formatHints';
import { emptyFormatHints } from '../dsl/formatHints';

interface StructuralEditorProps {
  initialDsl: string;
  onModelChange: (model: any) => void;
  height?: string;
}

function EditorInner({ initialDsl, onModelChange, height }: StructuralEditorProps) {
  const nodeViewFactory = useNodeViewFactory();
  const formatHintsRef = useRef<FormatHints>(emptyFormatHints());
  const viewRef = useRef<EditorView | null>(null);

  // Import initial DSL
  const { doc: initialDoc, formatHints } = importDsl(initialDsl);
  formatHintsRef.current = formatHints;

  const handleTransaction = useCallback((tr: Transaction, view: EditorView) => {
    const newState = view.state.apply(tr);
    view.updateState(newState);

    if (tr.docChanged) {
      const model = extractModel(newState.doc);
      onModelChange(model);
    }
  }, [onModelChange]);

  // Public API for loading new DSL text
  const loadDsl = useCallback((text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { doc, formatHints: fh } = importDsl(text);
    formatHintsRef.current = fh;
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr);
  }, []);

  // Public API for getting DSL text
  const getDsl = useCallback(() => {
    const view = viewRef.current;
    if (!view) return '';
    return exportDsl(view.state.doc, formatHintsRef.current);
  }, []);

  const state = EditorState.create({
    doc: initialDoc,
    plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
      keymap(baseKeymap),
      navigationPlugin(),
      completionPlugin(),
      draftResolverPlugin(),
    ],
  });

  return (
    <div className="starch-editor" style={{ height: height ?? '100%' }}>
      <ProseMirror
        state={state}
        dispatchTransaction={handleTransaction}
        nodeViews={{
          scene_node: nodeViewFactory({ component: SceneNodeView }),
          property_slot: nodeViewFactory({ component: PropertySlotView }),
          compound_slot: nodeViewFactory({ component: CompoundSlotView }),
          metadata: nodeViewFactory({ component: MetadataView }),
          style_block: nodeViewFactory({
            component: () => <SectionView label="style" />,
          }),
          animate_block: nodeViewFactory({
            component: () => <SectionView label="animate" />,
          }),
          images_block: nodeViewFactory({
            component: () => <SectionView label="images" />,
          }),
          keyframe_block: nodeViewFactory({ component: KeyframeBlockView }),
          keyframe_entry: nodeViewFactory({ component: KeyframeEntryView }),
        }}
        ref={(view) => { viewRef.current = view; }}
      />
    </div>
  );
}

export function StructuralEditor(props: StructuralEditorProps) {
  return (
    <ProseMirrorProvider>
      <EditorInner {...props} />
    </ProseMirrorProvider>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | grep "StructuralEditor\|editor/" || echo "No type errors"`
Expected: No errors (may need minor fixes based on exact `@prosemirror-adapter/react` API)

- [ ] **Step 3: Commit**

```bash
git add src/editor/StructuralEditor.tsx
git commit -m "feat: StructuralEditor component — ProseMirror with NodeViews and plugins"
```

---

## Task 12: App Integration

Replace V2Editor with StructuralEditor in the app, removing the ModelManager intermediary.

**Files:**
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Read current App.tsx to understand wiring**

Read `src/app/App.tsx` fully to map all ModelManager touchpoints.

- [ ] **Step 2: Update App.tsx imports and state**

Replace the ModelManager pattern. The new flow:
- `StructuralEditor` receives initial DSL text and an `onModelChange` callback
- App holds `activeDsl` state as before, but it's now set from `exportDsl` when needed (file save) or directly from the model change callback
- Tabs store DSL text strings, not ModelManager instances

Key changes to `App.tsx`:

1. Replace `import { ModelManager }` with `import { StructuralEditor }` and `import { importDsl }` / `import { exportDsl }`
2. Replace `EditorTab.modelManager: ModelManager` with `EditorTab.dsl: string`
3. Replace `createModelManager()` with just storing the DSL string
4. Replace `<V2Editor modelManager={...} />` with `<StructuralEditor initialDsl={...} onModelChange={...} />`
5. The `onModelChange` callback runs `parseScene(model)` directly to update the diagram
6. For file save, call `getDsl()` on the editor ref

The `V2Diagram` component still receives a model/DSL string — adapt it to receive the model JSON directly from `extractModel`, or keep the DSL string pipeline via `exportDsl`.

**Simplest integration path:** `StructuralEditor.onModelChange` provides model JSON → App passes to `V2Diagram`. If `V2Diagram` expects DSL text, build an adapter that calls `parseScene` on the model directly.

- [ ] **Step 3: Update the V2Diagram integration**

Check how `V2Diagram` currently receives its input. If it accepts DSL text and parses internally, the simplest bridge is:

```tsx
// In App.tsx
const [activeModel, setActiveModel] = useState<any>({});

// In JSX
<StructuralEditor
  initialDsl={activeTab.dsl}
  onModelChange={setActiveModel}
  height="100%"
/>
<V2Diagram model={activeModel} ... />
```

If `V2Diagram` only accepts DSL text, keep the `exportDsl` bridge temporarily:

```tsx
const [activeDsl, setActiveDsl] = useState(activeTab.dsl);

const handleModelChange = useCallback((model: any) => {
  // Export to DSL for the diagram (temporary bridge)
  const text = exportDslFromModel(model);
  setActiveDsl(text);
}, []);
```

- [ ] **Step 4: Remove ModelManager from EditorTab**

Update `EditorTab` interface:
```typescript
interface EditorTab {
  id: string;
  label: string;
  dsl: string;          // stored DSL text (replaces modelManager)
  closable: boolean;
}
```

Update `createModelManager` → just return the DSL string.
Update `saveStoredTabs` → save `tab.dsl` directly.
Update `loadStoredTabs` → restore DSL strings.

- [ ] **Step 5: Verify the app compiles and runs**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npm run dev` (manual verification — open browser, load a sample, verify editor renders)

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat: integrate StructuralEditor into app, replace ModelManager wiring"
```

---

## Task 13: Cleanup — Remove Old CM6 Code

Remove CodeMirror 6 files and dependencies that are no longer used.

**Files:**
- Delete: `src/app/components/V2Editor.tsx`
- Delete: `src/editor/modelManager.ts`
- Delete: `src/editor/dslLanguage.ts`
- Delete: `src/editor/theme.ts`
- Delete: `src/editor/popups/PropertyPopup.tsx`
- Delete: `src/editor/popups/TabbedPopup.tsx`
- Delete: `src/dsl/astDecorations.ts`
- Modify: `package.json` (remove CM6 deps)
- Delete: `src/__tests__/editor/modelManager.test.ts`

- [ ] **Step 1: Verify no remaining imports of deleted files**

Run: `grep -r "V2Editor\|modelManager\|dslLanguage\|theme.*starch\|astDecorations\|PropertyPopup\|TabbedPopup" src/ --include="*.ts" --include="*.tsx" -l`
Expected: No results (or only the files about to be deleted)

- [ ] **Step 2: Delete old files**

```bash
rm src/app/components/V2Editor.tsx
rm src/editor/modelManager.ts
rm src/editor/dslLanguage.ts
rm src/editor/theme.ts
rm src/editor/popups/PropertyPopup.tsx
rm src/editor/popups/TabbedPopup.tsx
rm src/dsl/astDecorations.ts
rm src/__tests__/editor/modelManager.test.ts
```

- [ ] **Step 3: Remove CM6 dependencies**

```bash
npm uninstall @codemirror/autocomplete @codemirror/commands @codemirror/lang-json @codemirror/language @codemirror/state @codemirror/view @codemirror/lint
```

- [ ] **Step 4: Verify everything still compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass, no type errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove CodeMirror 6 code and dependencies"
```

---

## Task 14: Verification — Full Round-Trip and Manual Testing

**Files:** None (testing only)

- [ ] **Step 1: Run all existing tests**

Run: `npx vitest run`
Expected: All pass. The parser, emitter, schema registry, and DSL tests should be unaffected.

- [ ] **Step 2: Run new editor tests**

Run: `npx vitest run src/__tests__/editor/`
Expected: All pass — schema, extractModel, importDsl, exportDsl, draftResolver, navigation.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Verify:
1. Editor loads with a sample scene
2. Scene nodes display with id, geometry, properties
3. Typing in property slots works
4. Tab moves between slots
5. Diagram renders correctly from the model
6. Loading a different sample replaces the editor content
7. File save/load works

- [ ] **Step 4: Commit verification notes**

```bash
git commit --allow-empty -m "chore: structural editor migration verified — all tests pass"
```
