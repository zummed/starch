import { describe, it, expect, vi } from 'vitest';
import { ModelManager } from '../../editor/modelManager';

describe('ModelManager', () => {
  it('starts with empty model', () => {
    const mm = new ModelManager(0);
    expect(mm.realModel.nodes).toEqual([]);
    expect(mm.text).toBe('');
    expect(mm.validationErrors).toBeNull();
    mm.destroy();
  });

  it('parses valid DSL immediately via setTextImmediate', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setTextImmediate(`{
      objects: [
        { id: "a", rect: { w: 100, h: 60 } }
      ]
    }`);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  it('keeps last valid model on parse error', () => {
    const mm = new ModelManager(0);

    mm.setTextImmediate(`{
      objects: [
        { id: "a", rect: { w: 100, h: 60 } }
      ]
    }`);

    expect(mm.realModel.nodes).toHaveLength(1);

    // Now set invalid text
    mm.setTextImmediate('{ invalid json5 !!!');
    // Model should still have the previous valid state
    expect(mm.realModel.nodes).toHaveLength(1);
    expect(mm.realModel.nodes[0].id).toBe('a');
    mm.destroy();
  });

  it('emits model change on valid parse', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setTextImmediate(`{ objects: [{ id: "b", ellipse: { rx: 20, ry: 20 } }] }`);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].nodes[0].id).toBe('b');
    mm.destroy();
  });

  it('emits text change on setTextImmediate', () => {
    const mm = new ModelManager(0);
    const onText = vi.fn();
    mm.onTextChange(onText);

    mm.setTextImmediate('{ objects: [] }');
    expect(onText).toHaveBeenCalledTimes(1);
    mm.destroy();
  });

  it('unsubscribes listeners correctly', () => {
    const mm = new ModelManager(0);
    const onChange = vi.fn();
    const unsub = mm.onModelChange(onChange);

    mm.setTextImmediate('{ objects: [] }');
    expect(onChange).toHaveBeenCalledTimes(1);

    unsub();
    mm.setTextImmediate('{ objects: [{ id: "x", rect: { w: 1, h: 1 } }] }');
    expect(onChange).toHaveBeenCalledTimes(1); // not called again
    mm.destroy();
  });

  it('updateProperty modifies model and re-serializes', () => {
    const mm = new ModelManager(0);

    mm.setTextImmediate(`{
      objects: [
        { id: "a", rect: { w: 100, h: 60 } }
      ]
    }`);

    const onText = vi.fn();
    mm.onTextChange(onText);

    mm.updateProperty('objects.0.rect.w', 200);

    expect(onText).toHaveBeenCalled();
    // The text should contain the updated value
    expect(mm.text).toContain('200');
    mm.destroy();
  });

  it('handles debounced setText', async () => {
    const mm = new ModelManager(50);
    const onChange = vi.fn();
    mm.onModelChange(onChange);

    mm.setText('{ objects: [{ id: "d", rect: { w: 10, h: 10 } }] }');

    // Not yet called (debounced)
    expect(onChange).not.toHaveBeenCalled();

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(mm.realModel.nodes[0].id).toBe('d');
    mm.destroy();
  });

  it('extracts background from parsed scene', () => {
    const mm = new ModelManager(0);
    mm.setTextImmediate(`{ background: "#1a1a2e", objects: [] }`);
    expect(mm.realModel.background).toBe('#1a1a2e');
    mm.destroy();
  });

  it('extracts animate config', () => {
    const mm = new ModelManager(0);
    mm.setTextImmediate(`{
      objects: [{ id: "a", rect: { w: 10, h: 10 } }],
      animate: { duration: 3, keyframes: [] }
    }`);
    expect(mm.realModel.animate?.duration).toBe(3);
    mm.destroy();
  });
});
