import { registerSet } from '../registry';
import { coreSet } from './core/index';

export function registerAllSets(): void {
  registerSet(coreSet);
}
