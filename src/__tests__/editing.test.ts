import { describe, it, expect } from 'vitest';
import { buildEditUrl, encodeDslToHash, decodeDslFromHash, PLAYGROUND_URL } from '../editing';

describe('encodeDslToHash / decodeDslFromHash', () => {
  it('round-trips plain DSL', () => {
    const dsl = 'a: rect 10x10 fill steelblue at 0,0';
    expect(decodeDslFromHash(encodeDslToHash(dsl))).toBe(dsl);
  });

  it('round-trips unicode and newlines', () => {
    const dsl = 'server: rect 10x10\n  label: text "café ☕ 日本語"\n\ntrack: fade server';
    expect(decodeDslFromHash(encodeDslToHash(dsl))).toBe(dsl);
  });

  it('round-trips an empty string', () => {
    expect(decodeDslFromHash(encodeDslToHash(''))).toBe('');
  });

  it('returns null for hashes that are not ours', () => {
    expect(decodeDslFromHash('')).toBeNull();
    expect(decodeDslFromHash('#')).toBeNull();
    expect(decodeDslFromHash('#foo=bar')).toBeNull();
  });

  it('returns null for undecodable base64', () => {
    expect(decodeDslFromHash('#dsl=not-valid-base64!!!')).toBeNull();
  });
});

describe('buildEditUrl', () => {
  const DSL = 'a: rect 10x10';

  it('embeds the dsl in the hash and defaults to embed=1', () => {
    const url = new URL(buildEditUrl(DSL));
    expect(url.origin + url.pathname).toBe(new URL(PLAYGROUND_URL).origin + new URL(PLAYGROUND_URL).pathname);
    expect(url.searchParams.get('embed')).toBe('1');
    expect(decodeDslFromHash(url.hash)).toBe(DSL);
  });

  it('omits embed param when embed: false', () => {
    const url = new URL(buildEditUrl(DSL, PLAYGROUND_URL, { embed: false }));
    expect(url.searchParams.has('embed')).toBe(false);
    expect(decodeDslFromHash(url.hash)).toBe(DSL);
  });

  it('uses a custom playground url', () => {
    const url = new URL(buildEditUrl(DSL, 'https://example.com/edit'));
    expect(url.origin + url.pathname).toBe('https://example.com/edit');
    expect(decodeDslFromHash(url.hash)).toBe(DSL);
  });
});
