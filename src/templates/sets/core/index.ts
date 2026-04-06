import type { ShapeSet } from '../../registry';
import { boxTemplate, boxProps } from './box';
import { circleTemplate, circleProps } from './circle';
import { arrowTemplate, arrowProps } from './arrow';
import { lineTemplate, lineProps } from './line';
import { tableTemplate, tableProps } from './table';
import { textblockTemplate, textblockProps } from './textblock';
import { codeblockTemplate, codeblockProps } from './codeblock';
import { pillTemplate, pillProps } from './pill';
import { cardTemplate, cardProps } from './card';
import { noteTemplate, noteProps } from './note';
import { groupTemplate, groupProps } from './group';

export const coreSet: ShapeSet = {
  name: 'core',
  description: 'General-purpose diagram shapes',
  shapes: new Map([
    ['box', { template: boxTemplate, props: boxProps }],
    ['circle', { template: circleTemplate, props: circleProps }],
    ['arrow', { template: arrowTemplate, props: arrowProps }],
    ['line', { template: lineTemplate, props: lineProps }],
    ['table', { template: tableTemplate, props: tableProps }],
    ['textblock', { template: textblockTemplate, props: textblockProps }],
    ['codeblock', { template: codeblockTemplate, props: codeblockProps }],
    ['pill', { template: pillTemplate, props: pillProps }],
    ['card', { template: cardTemplate, props: cardProps }],
    ['note', { template: noteTemplate, props: noteProps }],
    ['group', { template: groupTemplate, props: groupProps }],
  ]),
};
