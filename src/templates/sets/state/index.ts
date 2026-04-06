import type { ShapeSet } from '../../registry';
import { stateNodeTemplate, stateNodeProps } from './node';
import { stateInitialTemplate, stateInitialProps } from './initial';
import { stateFinalTemplate, stateFinalProps } from './final';
import { stateRegionTemplate, stateRegionProps } from './region';
import { stateChoiceTemplate, stateChoiceProps } from './choice';

export const stateSet: ShapeSet = {
  name: 'state',
  description: 'State chart shapes',
  shapes: new Map([
    ['node', { template: stateNodeTemplate, props: stateNodeProps }],
    ['initial', { template: stateInitialTemplate, props: stateInitialProps }],
    ['final', { template: stateFinalTemplate, props: stateFinalProps }],
    ['region', { template: stateRegionTemplate, props: stateRegionProps }],
    ['choice', { template: stateChoiceTemplate, props: stateChoiceProps }],
  ]),
};
