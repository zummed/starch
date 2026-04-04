import { describe, it, expect } from 'vitest';
import { flowchartNodeTemplate } from '../../templates/builtins/flowchartNode';
import { sequenceParticipantTemplate } from '../../templates/builtins/sequenceParticipant';
import { stateNodeTemplate } from '../../templates/builtins/stateNode';
import { parseScene } from '../../parser/parser';

describe('flowchartNodeTemplate', () => {
  it('creates node with body, header, and title', () => {
    const node = flowchartNodeTemplate('step1', { title: 'Process', subtitle: 'Handle input' });
    expect(node.id).toBe('step1');
    expect(node.children.length).toBeGreaterThanOrEqual(4); // body, header, title, subtitle
    const body = node.children.find(c => c.id === 'step1.body');
    expect(body).toBeDefined();
    expect(body!.rect).toBeDefined();
    const title = node.children.find(c => c.id === 'step1.title');
    expect(title!.text!.content).toBe('Process');
  });

  it('adds status indicator', () => {
    const node = flowchartNodeTemplate('s', { title: 'Step', status: 'success' });
    const status = node.children.find(c => c.id === 's.status');
    expect(status).toBeDefined();
    expect(status!.ellipse).toBeDefined();
    const statusFill = status!.fill as { h: number; s: number; l: number };
    expect(statusFill.h).toBe(120); // green
  });

  it('works with colour prop', () => {
    const node = flowchartNodeTemplate('n', { title: 'Test', colour: 'coral' });
    const body = node.children.find(c => c.id === 'n.body');
    expect(body!.fill).toBeDefined();
    expect(body!.stroke).toBeDefined();
  });
});

describe('sequenceParticipantTemplate', () => {
  it('creates header, name, and lifeline', () => {
    const node = sequenceParticipantTemplate('user', { name: 'User' });
    expect(node.children).toHaveLength(3);
    const header = node.children.find(c => c.id === 'user.header');
    expect(header!.rect).toBeDefined();
    const name = node.children.find(c => c.id === 'user.name');
    expect(name!.text!.content).toBe('User');
    const lifeline = node.children.find(c => c.id === 'user.lifeline');
    expect(lifeline!.path).toBeDefined();
    expect(lifeline!.dash).toBeDefined();
  });

  it('respects lifeline height', () => {
    const node = sequenceParticipantTemplate('p', { name: 'P', lifelineHeight: 300 });
    const lifeline = node.children.find(c => c.id === 'p.lifeline');
    expect(lifeline!.path!.points![1][1]).toBe(340); // h (40) + lifelineHeight (300)
  });
});

describe('stateNodeTemplate', () => {
  it('creates state with name', () => {
    const node = stateNodeTemplate('idle', { name: 'Idle' });
    expect(node.children.length).toBeGreaterThanOrEqual(2); // bg + name
    const name = node.children.find(c => c.id === 'idle.name');
    expect(name!.text!.content).toBe('Idle');
  });

  it('adds entry/exit actions with divider', () => {
    const node = stateNodeTemplate('active', { name: 'Active', entry: 'start()', exit: 'stop()' });
    const divider = node.children.find(c => c.id === 'active.divider');
    expect(divider).toBeDefined();
    const entry = node.children.find(c => c.id === 'active.entry');
    expect(entry!.text!.content).toContain('entry');
    const exit = node.children.find(c => c.id === 'active.exit');
    expect(exit!.text!.content).toContain('exit');
  });

  it('applies thicker stroke when active', () => {
    const node = stateNodeTemplate('s', { name: 'S', active: true });
    expect(node.children[0].stroke!.width).toBe(3);
  });
});

describe('complex template samples parse', () => {
  it('parses a flowchart diagram', () => {
    const input = `\
objects
  start: template "flowchart-node" title="Start" subtitle="Begin process" colour=dodgerblue
  process: template "flowchart-node" title="Process" subtitle="Handle data" status=active
  end: template "flowchart-node" title="End" status=success
  l1: template line from=start to=process
  l2: template line from=process to=end`;
    const scene = parseScene(input);
    expect(scene.nodes).toHaveLength(5);
  });

  it('parses a sequence diagram', () => {
    const input = `\
objects
  client: template "sequence-participant" name=Client colour=dodgerblue
  server: template "sequence-participant" name=Server colour=mediumseagreen`;
    const scene = parseScene(input);
    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodes[0].children).toHaveLength(3); // header, name, lifeline
  });

  it('parses a state machine', () => {
    const input = `\
objects
  idle: template "state-node" name=Idle
  active: template "state-node" name=Active active=true entry="start()" exit="cleanup()"
  t1: template line from=idle to=active label=activate`;
    const scene = parseScene(input);
    expect(scene.nodes).toHaveLength(3);
  });
});
