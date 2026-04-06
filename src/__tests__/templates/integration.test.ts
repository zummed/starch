import { describe, it, expect } from 'vitest';
import { parseScene } from '../../parser/parser';

describe('shape sets end-to-end', () => {
  it('parses DSL with core shapes using default search path', () => {
    const scene = parseScene(`
      header: box w=200 h=40 text="Title" color=steelblue
      status: pill text="Active" color=green
    `);
    expect(scene.nodes.find(n => n.id === 'header')).toBeDefined();
    expect(scene.nodes.find(n => n.id === 'status')).toBeDefined();
  });

  it('parses DSL with state shapes using use declaration', () => {
    const scene = parseScene(`
      use [core, state]

      idle: state.node name="Idle" color=steelblue
      start: state.initial
      end: state.final
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

      s1: node name="Ready"
    `);
    const s1 = scene.nodes.find(n => n.id === 's1');
    expect(s1).toBeDefined();
    expect(s1!.children.find(c => c.id === 's1.name')?.text?.content).toBe('Ready');
  });

  it('fully-qualified names work without use declaration', () => {
    const scene = parseScene(`
      s1: state.node name="Idle"
    `);
    expect(scene.nodes.find(n => n.id === 's1')).toBeDefined();
  });

  it('core.group creates a container with layout', () => {
    const scene = parseScene(`
      g: group label="My Group" direction=column gap=10
    `);
    const g = scene.nodes.find(n => n.id === 'g');
    expect(g).toBeDefined();
    expect(g!.layout).toBeDefined();
    expect(g!.children.find(c => c.id === 'g.title')?.text?.content).toBe('My Group');
  });

  it('explicit template keyword still works', () => {
    const scene = parseScene(`
      b: template box w=100 h=50 text="Old syntax"
    `);
    expect(scene.nodes.find(n => n.id === 'b')).toBeDefined();
  });

  it('parses positional text for box', () => {
    const scene = parseScene(`
      b: box "Hello"
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Hello');
  });

  it('parses positional text + dimensions for box', () => {
    const scene = parseScene(`
      b: box "Hello" 200x80
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(200);
    expect(b!.children.find(c => c.id === 'b.bg')?.rect?.h).toBe(80);
    expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Hello');
  });

  it('parses positional text + dimensions + kwargs for box', () => {
    const scene = parseScene(`
      b: box "Hello" 200x80 radius=12 color=steelblue
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(200);
    expect(b!.children.find(c => c.id === 'b.bg')?.rect?.radius).toBe(12);
  });

  it('parses fully-qualified positional syntax: core.box "Text"', () => {
    const scene = parseScene(`
      b: core.box "Title" 150x60
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Title');
    expect(b!.children.find(c => c.id === 'b.bg')?.rect?.w).toBe(150);
  });

  it('parses circle with text and radius positionals', () => {
    const scene = parseScene(`
      c: circle "Node" 40
    `);
    const c = scene.nodes.find(n => n.id === 'c');
    expect(c).toBeDefined();
    expect(c!.children.find(ch => ch.id === 'c.label')?.text?.content).toBe('Node');
  });

  it('parses arrow with kwargs: arrow from=a to=b', () => {
    // NOTE: positional `arrow a -> b` conflicts with the primitive arrow/route
    // detection which fires first. Arrow templates use kwargs for from/to.
    const scene = parseScene(`
      a: box 10x10
      b: box 10x10
      conn: arrow from=a to=b label="go"
    `);
    const ids = scene.nodes.map(n => n.id);
    expect(ids).toContain('conn');
    const conn = scene.nodes.find(n => n.id === 'conn')!;
    expect(conn.children.find(c => c.id === 'conn.route')).toBeDefined();
  });

  it('parses state.node with positional name', () => {
    const scene = parseScene(`
      use [core, state]
      s1: node "Idle"
    `);
    const s1 = scene.nodes.find(n => n.id === 's1');
    expect(s1).toBeDefined();
    expect(s1!.children.find(c => c.id === 's1.name')?.text?.content).toBe('Idle');
  });

  it('old key=val syntax still works alongside positionals', () => {
    const scene = parseScene(`
      b: box w=200 h=80 text="Old"
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Old');
  });

  it('explicit template keyword with positionals', () => {
    const scene = parseScene(`
      b: template box "Explicit" 100x50
    `);
    const b = scene.nodes.find(n => n.id === 'b');
    expect(b).toBeDefined();
    expect(b!.children.find(c => c.id === 'b.label')?.text?.content).toBe('Explicit');
  });
});
