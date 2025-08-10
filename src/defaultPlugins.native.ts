import type { MergePlugins } from './types/core';
import { apiPlugin } from './plugins/api';
import { datePlugin } from './plugins/datePlugin';
import { performancePlugin } from './plugins/performance';
import { statePlugin } from './plugins/state';
import { flowNativePlugin } from './plugins/flowNative';
import { interactionsNativePlugin } from './plugins/interactionsNative';

export const defaultPluginsNative = [
    flowNativePlugin,
    apiPlugin(),
    interactionsNativePlugin,
    datePlugin(),
    performancePlugin,
    statePlugin(),
] as const;

export type DefaultHelpersNative = MergePlugins<typeof defaultPluginsNative>;
