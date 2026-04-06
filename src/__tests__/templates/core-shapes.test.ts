import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinTemplates } from '../../templates/index';
import { expandTemplates } from '../../templates/registry';

beforeAll(() => {
  registerBuiltinTemplates();
});

describe('core.pill', () => {
  it('creates a rounded rect with centered text', () => {
    const nodes = expandTemplates([
      { template: 'core.pill', id: 'p1', props: { text: 'Active' } },
    ]);
    expect(nodes).toHaveLength(1);
    const bg = nodes[0].children.find(c => c.id === 'p1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.rect!.radius).toBeGreaterThanOrEqual(15);
    const label = nodes[0].children.find(c => c.id === 'p1.label');
    expect(label?.text?.content).toBe('Active');
  });

  it('applies color to stroke and faded fill', () => {
    const nodes = expandTemplates([
      { template: 'core.pill', id: 'p2', props: { text: 'OK', color: 'green' } },
    ]);
    const bg = nodes[0].children.find(c => c.id === 'p2.bg');
    expect(bg?.stroke).toBeDefined();
    expect(bg?.fill).toBeDefined();
  });
});

describe('core.card', () => {
  it('creates title, divider, and optional body', () => {
    const nodes = expandTemplates([
      { template: 'core.card', id: 'c1', props: { title: 'Header', body: 'Details here' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 'c1.bg')?.rect).toBeDefined();
    expect(node.children.find(c => c.id === 'c1.header')?.text?.content).toBe('Header');
    expect(node.children.find(c => c.id === 'c1.divider')?.path).toBeDefined();
    expect(node.children.find(c => c.id === 'c1.body')?.text?.content).toBe('Details here');
  });

  it('omits body when not provided', () => {
    const nodes = expandTemplates([
      { template: 'core.card', id: 'c2', props: { title: 'Title Only' } },
    ]);
    expect(nodes[0].children.find(c => c.id === 'c2.body')).toBeUndefined();
  });
});

describe('core.note', () => {
  it('creates a rect with fold and text', () => {
    const nodes = expandTemplates([
      { template: 'core.note', id: 'n1', props: { text: 'Remember this' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 'n1.bg')?.rect).toBeDefined();
    expect(node.children.find(c => c.id === 'n1.fold')?.path).toBeDefined();
    expect(node.children.find(c => c.id === 'n1.label')?.text?.content).toBe('Remember this');
  });
});

describe('core.group', () => {
  it('creates a labeled container with dashed stroke', () => {
    const nodes = expandTemplates([
      { template: 'core.group', id: 'g1', props: { label: 'Group A' } },
    ]);
    const node = nodes[0];
    expect(node.rect).toBeDefined();
    expect(node.dash).toBeDefined();
    expect(node.children.find(c => c.id === 'g1.title')?.text?.content).toBe('Group A');
    expect(node.layout).toBeDefined();
  });
});
