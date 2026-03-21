import { registerTemplate } from './registry';
import { boxTemplate } from './builtins/box';
import { circleTemplate } from './builtins/circle';
import { labelTemplate } from './builtins/label';
import { lineTemplate } from './builtins/line';
import { textblockTemplate } from './builtins/textblock';
import { codeblockTemplate } from './builtins/codeblock';
import { tableTemplate } from './builtins/table';
import { flowchartNodeTemplate } from './builtins/flowchartNode';
import { sequenceParticipantTemplate } from './builtins/sequenceParticipant';
import { stateNodeTemplate } from './builtins/stateNode';

export function registerBuiltinTemplates(): void {
  registerTemplate('box', boxTemplate);
  registerTemplate('circle', circleTemplate);
  registerTemplate('label', labelTemplate);
  registerTemplate('line', lineTemplate);
  registerTemplate('textblock', textblockTemplate);
  registerTemplate('codeblock', codeblockTemplate);
  registerTemplate('table', tableTemplate);
  registerTemplate('flowchart-node', flowchartNodeTemplate);
  registerTemplate('sequence-participant', sequenceParticipantTemplate);
  registerTemplate('state-node', stateNodeTemplate);
}

export {
  boxTemplate,
  circleTemplate,
  labelTemplate,
  lineTemplate,
  textblockTemplate,
  codeblockTemplate,
  tableTemplate,
  flowchartNodeTemplate,
  sequenceParticipantTemplate,
  stateNodeTemplate,
};
