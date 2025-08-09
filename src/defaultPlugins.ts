import type { MergePlugins } from './types';
import { flowPlugin } from './plugins/flow';
import { apiPlugin } from './plugins/api';
import { interactionsPlugin } from './plugins/interactionsPlugin';
import { keyboardPlugin } from './plugins/keyboard';
import { datePlugin } from './plugins/datePlugin';
import { performancePlugin } from './plugins/performance';
import { dndPlugin } from './plugins/dnd';
import { statePlugin } from './plugins/state';

export const defaultPlugins = [
    flowPlugin,
    apiPlugin(),
    interactionsPlugin,
    keyboardPlugin,
    datePlugin(),
    performancePlugin,
    dndPlugin,
    statePlugin(),
] as const;

export type DefaultHelpers = MergePlugins<typeof defaultPlugins>;
