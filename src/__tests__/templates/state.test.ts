import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinTemplates } from '../../templates/index';
import { expandTemplates } from '../../templates/registry';

beforeAll(() => {
  registerBuiltinTemplates();
});

describe('state.node', () => {
  it('creates a state node with name, bg, and no divider when no actions', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's1', props: { name: 'Idle' } },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('s1');
    const bg = nodes[0].children.find(c => c.id === 's1.bg');
    expect(bg?.rect).toBeDefined();
    expect(bg?.rect!.radius).toBe(16);
    const name = nodes[0].children.find(c => c.id === 's1.name');
    expect(name?.text?.content).toBe('Idle');
    const divider = nodes[0].children.find(c => c.id === 's1.divider');
    expect(divider).toBeUndefined();
  });

  it('creates divider and action labels when entry/exit provided', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's2', props: { name: 'Active', entry: 'startTimer', exit: 'stopTimer' } },
    ]);
    const node = nodes[0];
    expect(node.children.find(c => c.id === 's2.divider')).toBeDefined();
    expect(node.children.find(c => c.id === 's2.action0')?.text?.content).toContain('startTimer');
    expect(node.children.find(c => c.id === 's2.action1')?.text?.content).toContain('stopTimer');
  });

  it('applies color to stroke and faded fill', () => {
    const nodes = expandTemplates([
      { template: 'state.node', id: 's3', props: { name: 'Test', color: 'steelblue' } },
    ]);
    const bg = nodes[0].children.find(c => c.id === 's3.bg');
    expect(bg?.stroke).toBeDefined();
    expect(bg?.fill).toBeDefined();
  });
});

describe('state.initial', () => {
  it('creates a filled circle', () => {
    const nodes = expandTemplates([
      { template: 'state.initial', id: 'start', props: {} },
    ]);
    const dot = nodes[0].children.find(c => c.id === 'start.dot');
    expect(dot?.ellipse).toBeDefined();
    expect(dot?.fill).toBeDefined();
  });
});

describe('state.final', () => {
  it('creates outer and inner circles', () => {
    const nodes = expandTemplates([
      { template: 'state.final', id: 'end', props: {} },
    ]);
    const outer = nodes[0].children.find(c => c.id === 'end.outer');
    const inner = nodes[0].children.find(c => c.id === 'end.inner');
    expect(outer?.ellipse).toBeDefined();
    expect(outer?.stroke).toBeDefined();
    expect(inner?.ellipse).toBeDefined();
    expect(inner?.fill).toBeDefined();
  });
});

describe('state.choice', () => {
  it('creates a diamond path', () => {
    const nodes = expandTemplates([
      { template: 'state.choice', id: 'ch', props: {} },
    ]);
    const diamond = nodes[0].children.find(c => c.id === 'ch.diamond');
    expect(diamond?.path).toBeDefined();
    expect(diamond?.path!.points).toHaveLength(4);
    expect(diamond?.path!.closed).toBe(true);
  });
});

describe('state.region', () => {
  it('creates a labeled container with dashed stroke', () => {
    const nodes = expandTemplates([
      { template: 'state.region', id: 'r1', props: { label: 'Region A' } },
    ]);
    expect(nodes[0].rect).toBeDefined();
    expect(nodes[0].dash).toBeDefined();
    const title = nodes[0].children.find(c => c.id === 'r1.title');
    expect(title?.text?.content).toBe('Region A');
  });
});
