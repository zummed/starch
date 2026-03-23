import { describe, it, expect, vi } from 'vitest';
import { ModelManager } from '../../editor/modelManager';

describe('ModelManager', () => {
  it('starts with empty model', () => {
    const mm = new ModelManager(0);
    expect(mm.realModel.nodes).toEqual([]);
    expect(mm.json).toEqual({});
    mm.destroy();
  });

  it('setText with json5 parses and emits modelChange', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  it('setText does NOT emit textChange', () => {
    const mm = new ModelManager(0);
    const onText = vi.fn();
    mm.onTextChange(onText);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    expect(onText).not.toHaveBeenCalled();
    mm.destroy();
  });

  it('setText keeps last valid model on parse error', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    expect(mm.realModel.nodes).toHaveLength(1);
    mm.setText('{ invalid !!!', 'json5');
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  it('setText with dsl parses and emits modelChange', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);
    mm.setText('box: rect 100x60', 'dsl');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('box');
    mm.destroy();
  });

  it('setText with dsl extracts format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.setText('box: rect 100x60\n  fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'block' });
    mm.destroy();
  });

  it('setText with invalid DSL does NOT update format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.setText('box: rect ??? invalid', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.destroy();
  });

  it('setText with json5 does NOT change format hints', () => {
    const mm = new ModelManager(0);
    mm.setText('box: rect 100x60 fill 210 70 45', 'dsl');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.setText('{ objects: [{ id: "box", rect: { w: 200, h: 60 } }] }', 'json5');
    expect(mm.formatHints.nodes['box']).toEqual({ display: 'inline' });
    mm.destroy();
  });

  it('updateProperty mutates json and emits modelChange + textChange', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('json5');
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    const onModel = vi.fn();
    const onText = vi.fn();
    mm.onModelChange(onModel);
    mm.onTextChange(onText);
    mm.updateProperty('objects.0.rect.w', 200);
    expect(onModel).toHaveBeenCalled();
    expect(onText).toHaveBeenCalled();
    expect(mm.json.objects[0].rect.w).toBe(200);
    mm.destroy();
  });

  it('updateProperty regenerates DSL when in DSL mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('dsl');
    mm.setText('box: rect 100x60', 'dsl');
    const onText = vi.fn();
    mm.onTextChange(onText);
    mm.updateProperty('objects.0.rect.w', 200);
    expect(onText).toHaveBeenCalled();
    const newText = onText.mock.calls[0][0];
    expect(newText).toContain('200');
    expect(newText).toContain('box');
    mm.destroy();
  });

  it('setViewFormat emits textChange with regenerated text', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    const onText = vi.fn();
    mm.onTextChange(onText);
    mm.setViewFormat('dsl');
    expect(onText).toHaveBeenCalled();
    const dslText = onText.mock.calls[0][0];
    expect(dslText).toContain('a: rect 100x60');
    mm.destroy();
  });

  it('getDisplayText returns DSL when in DSL mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('dsl');
    mm.setText('box: rect 100x60', 'dsl');
    const display = mm.getDisplayText();
    expect(display).toContain('box: rect 100x60');
    mm.destroy();
  });

  it('getDisplayText returns JSON5 when in JSON5 mode', () => {
    const mm = new ModelManager(0);
    mm.setViewFormat('json5');
    mm.setText('{ objects: [{ id: "a", rect: { w: 100, h: 60 } }] }', 'json5');
    const display = mm.getDisplayText();
    // JSON5.stringify uses single quotes for strings
    expect(display).toContain("'a'");
    mm.destroy();
  });

  it('debounces setText calls', async () => {
    const mm = new ModelManager(50);
    const onChange = vi.fn();
    mm.onModelChange(onChange);
    mm.setText('{ objects: [{ id: "d", rect: { w: 10, h: 10 } }] }', 'json5');
    expect(onChange).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(onChange).toHaveBeenCalledTimes(1);
    mm.destroy();
  });

  it('emits validation error on parse failure', () => {
    const mm = new ModelManager(0);
    const onValidation = vi.fn();
    mm.onValidationChange(onValidation);
    mm.setText('{ invalid !!!', 'json5');
    expect(onValidation).toHaveBeenCalled();
    const err = onValidation.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    mm.destroy();
  });

  it('emits null validation on successful parse', () => {
    const mm = new ModelManager(0);
    const onValidation = vi.fn();
    mm.onValidationChange(onValidation);
    mm.setText('{ objects: [] }', 'json5');
    expect(onValidation).toHaveBeenCalledWith(null);
    mm.destroy();
  });

  it('unsubscribes listeners correctly', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    const unsub = mm.onModelChange(onChange);
    mm.setText('{ objects: [] }', 'json5');
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
    mm.setText('{ objects: [{ id: "x", rect: { w: 1, h: 1 } }] }', 'json5');
    expect(onChange).toHaveBeenCalledTimes(1);
    mm.destroy();
  });

  it('extracts background from parsed scene', () => {
    const mm = new ModelManager(0);
    mm.setText('{ background: "#1a1a2e", objects: [] }', 'json5');
    expect(mm.realModel.background).toBe('#1a1a2e');
    mm.destroy();
  });

  it('extracts animate config', () => {
    const mm = new ModelManager(0);
    mm.setText('{ objects: [{ id: "a", rect: { w: 10, h: 10 } }], animate: { duration: 3, keyframes: [] } }', 'json5');
    expect(mm.realModel.animate?.duration).toBe(3);
    mm.destroy();
  });
});
