import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('shape sets end-to-end', () => {
  it('parses DSL with core shapes using default search path', () => {
    const scene = parseScene(`
      header: template box w=200 h=40 text="Title" color=steelblue
      status: template pill text="Active" color=green
    `);
    expect(scene.nodes.find(n => n.id === 'header')).toBeDefined();
    expect(scene.nodes.find(n => n.id === 'status')).toBeDefined();
  });

  it('parses DSL with state shapes using use declaration', () => {
    const scene = parseScene(`
      use [core, state]

      idle: template state.node name="Idle" color=steelblue
      start: template state.initial
      end: template state.final
    `);
    const idle = scene.nodes.find(n => n.id === 'idle');
    expect(idle).toBeDefined();
    expect(idle!.children.find(c => c.id === 'idle.bg')).toBeDefined();
    expect(idle!.children.find(c => c.id === 'idle.name')).toBeDefined();

    const start = scene.nodes.find(n => n.id === 'start');
    expect(start).toBeDefined();
    expect(start!.children.find(c => c.id === 'start.dot')).toBeDefined();

    const end = scene.nodes.find(n => n.id === 'end');
    expect(end).toBeDefined();
  });

  it('resolves unqualified state names when state is in use path', () => {
    const scene = parseScene(`
      use [core, state]

      s1: template node name="Ready"
    `);
    const s1 = scene.nodes.find(n => n.id === 's1');
    expect(s1).toBeDefined();
    expect(s1!.children.find(c => c.id === 's1.name')?.text?.content).toBe('Ready');
  });

  it('fully-qualified names work without use declaration', () => {
    const scene = parseScene(`
      s1: template state.node name="Idle"
    `);
    expect(scene.nodes.find(n => n.id === 's1')).toBeDefined();
  });

  it('core.group creates a container with layout', () => {
    const scene = parseScene(`
      g: template group label="My Group" direction=column gap=10
    `);
    const g = scene.nodes.find(n => n.id === 'g');
    expect(g).toBeDefined();
    expect(g!.layout).toBeDefined();
    expect(g!.children.find(c => c.id === 'g.title')?.text?.content).toBe('My Group');
  });
});
