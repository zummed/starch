import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import {
  registerTemplate, getTemplate, expandTemplates, expandTemplate,
  registerSet, getSet, listSets, resolveTemplateName,
  type ShapeSet, type ShapeDefinition,
} from '../../templates/registry';
import { createNode } from '../../types/node';
import { registerBuiltinTemplates } from '../../templates/index';

describe('template registry', () => {
  it('registers and retrieves a template', () => {
    registerTemplate('testTpl', (id, props) => createNode({ id }));
    expect(getTemplate('testTpl')).toBeDefined();
  });

  it('returns undefined for unregistered template', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });
});

describe('expandTemplate', () => {
  it('substitutes $ placeholders in IDs', () => {
    const definition = {
      children: [
        { id: '$.bg', rect: { w: 100, h: 60 } },
        { id: '$.label', text: { content: 'hello', size: 14 } },
      ],
    };
    const node = expandTemplate(definition, 'mybox', {});
    expect(node.children[0].id).toBe('mybox.bg');
    expect(node.children[1].id).toBe('mybox.label');
  });

  it('substitutes $prop values', () => {
    const definition = {
      children: [
        { id: '$.bg', rect: { w: '$w', h: '$h' } },
      ],
    };
    const node = expandTemplate(definition, 'box', { w: 200, h: 100 });
    expect(node.children[0].rect!.w).toBe(200);
    expect(node.children[0].rect!.h).toBe(100);
  });

  it('uses default values for missing props', () => {
    const definition = {
      children: [
        { id: '$.bg', rect: { w: '$w:120', h: '$h:60' } },
      ],
    };
    const node = expandTemplate(definition, 'box', {});
    expect(node.children[0].rect!.w).toBe(120);
    expect(node.children[0].rect!.h).toBe(60);
  });

  it('substitutes object-valued props', () => {
    const definition = {
      children: [
        { id: '$.bg', fill: '$fill' },
      ],
    };
    const fill = { h: 210, s: 80, l: 50 };
    const node = expandTemplate(definition, 'box', { fill });
    expect(node.children[0].fill).toEqual(fill);
  });
});

describe('expandTemplates', () => {
  it('expands template references in node list', () => {
    registerTemplate('mybox', (id, props) => createNode({
      id,
      children: [createNode({ id: `${id}.bg`, rect: { w: (props.w as number) ?? 100, h: 50 } })],
    }));

    const nodes = expandTemplates([
      { template: 'mybox', id: 'b1', props: { w: 200 } },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b1');
    expect(nodes[0].children[0].rect!.w).toBe(200);
  });

  it('passes through non-template nodes', () => {
    const nodes = expandTemplates([
      { id: 'plain', rect: { w: 50, h: 50 } },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('plain');
    expect(nodes[0].rect!.w).toBe(50);
  });
});

describe('shape sets', () => {
  it('registers a shape set and retrieves it', () => {
    const testSet: ShapeSet = {
      name: 'test',
      description: 'Test shapes',
      shapes: new Map([
        ['widget', {
          template: (id, props) => createNode({ id }),
          props: z.object({ text: z.string().optional() }),
        }],
      ]),
    };
    registerSet(testSet);
    const retrieved = getSet('test');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('test');
    expect(retrieved!.shapes.has('widget')).toBe(true);
  });

  it('lists all registered sets', () => {
    const sets = listSets();
    expect(sets.length).toBeGreaterThanOrEqual(1);
    expect(sets.some(s => s.name === 'test')).toBe(true);
  });

  it('resolves fully-qualified dotted name', () => {
    const fn = getTemplate('test.widget');
    expect(fn).toBeDefined();
  });

  it('resolves unqualified name through search path', () => {
    const fn = resolveTemplateName('widget', ['test']);
    expect(fn).toBeDefined();
  });

  it('returns undefined for unqualified name not in search path', () => {
    const fn = resolveTemplateName('widget', []);
    expect(fn).toBeUndefined();
  });

  it('fully-qualified name works regardless of search path', () => {
    const fn = resolveTemplateName('test.widget', []);
    expect(fn).toBeDefined();
  });
});

describe('expandTemplates with search path', () => {
  beforeAll(() => {
    registerBuiltinTemplates();
  });

  it('resolves unqualified names through search path', () => {
    const nodes = expandTemplates(
      [{ template: 'box', id: 'b1', props: { w: 100 } }],
      ['core'],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b1');
  });

  it('resolves fully-qualified names regardless of search path', () => {
    const nodes = expandTemplates(
      [{ template: 'core.box', id: 'b2', props: { w: 100 } }],
      [],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b2');
  });

  it('defaults search path to [core] when not provided', () => {
    const nodes = expandTemplates(
      [{ template: 'box', id: 'b3', props: { w: 100 } }],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('b3');
  });
});
