import { registerTemplate } from './registry';
import { boxTemplate } from './builtins/box';
import { circleTemplate } from './builtins/circle';
import { labelTemplate } from './builtins/label';
import { lineTemplate } from './builtins/line';
import { textblockTemplate } from './builtins/textblock';
import { codeblockTemplate } from './builtins/codeblock';
import { tableTemplate } from './builtins/table';

export function registerBuiltinTemplates(): void {
  registerTemplate('box', boxTemplate);
  registerTemplate('circle', circleTemplate);
  registerTemplate('label', labelTemplate);
  registerTemplate('line', lineTemplate);
  registerTemplate('textblock', textblockTemplate);
  registerTemplate('codeblock', codeblockTemplate);
  registerTemplate('table', tableTemplate);
}

export {
  boxTemplate,
  circleTemplate,
  labelTemplate,
  lineTemplate,
  textblockTemplate,
  codeblockTemplate,
  tableTemplate,
};
