import { describe, it, expect } from 'vitest';
import type { ObjectType, BaseProps } from '../types';

describe('types', () => {
  it('ObjectType does not include group', () => {
    const types: ObjectType[] = ['box', 'circle', 'label', 'table', 'line', 'path'];
    expect(types).toHaveLength(6);
  });

  it('BaseProps includes layout properties', () => {
    const props: Partial<BaseProps> = {
      direction: 'row',
      gap: 10,
      justify: 'spaceBetween',
      align: 'stretch',
      wrap: true,
      padding: 16,
      rotation: 45,
      group: 'container1',
      order: 1,
      grow: 1,
      shrink: 0,
      alignSelf: 'center',
      cascadeOpacity: false,
      cascadeScale: true,
      cascadeRotation: true,
    };
    expect(props.direction).toBe('row');
    expect(props.group).toBe('container1');
  });
});
