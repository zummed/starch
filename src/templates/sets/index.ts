import { registerSet } from '../registry';
import { coreSet } from './core/index';
import { stateSet } from './state/index';

export function registerAllSets(): void {
  registerSet(coreSet);
  registerSet(stateSet);
}
