import { describe, it, expect } from 'vitest';

it('prosemirror packages resolve', async () => {
  const model = await import('prosemirror-model');
  expect(model.Schema).toBeDefined();

  const state = await import('prosemirror-state');
  expect(state.EditorState).toBeDefined();

  const view = await import('prosemirror-view');
  expect(view.EditorView).toBeDefined();

  // @prosemirror-adapter/react exports ProsemirrorAdapterProvider (lowercase 'm'), not ProseMirror
  const adapter = await import('@prosemirror-adapter/react');
  expect(adapter.ProsemirrorAdapterProvider).toBeDefined();
});
