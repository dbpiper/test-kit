/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable import/first */
// Runtime-unified entry that chooses native vs web at require-time for CJS consumers like Jest.
// Keep imports lazy via require() to avoid bundling both sides.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function load(moduleId: string): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires,
    // @typescript-eslint/no-require-imports
    return require(moduleId);
}

const isNative = (() => {
    try {
        // Prefer strong signals
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const rn = require('react-native');
        if (rn && typeof rn?.Platform?.OS === 'string') {
            return true;
        }
    } catch {
        /* ignore */
    }
    try {
        // Heuristic: RN test envs often expose navigator.product = 'ReactNative'
        const product = String(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (globalThis as unknown as { navigator?: { product?: unknown } })
                .navigator?.product ?? ''
        ).toLowerCase();
        if (product === 'reactnative') {
            return true;
        }
    } catch {
        /* ignore */
    }
    try {
        // If RN Testing Library is resolvable, prefer native
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require.resolve('@testing-library/react-native');
        return true;
    } catch {
        /* ignore */
    }
    return false;
})();

// Re-export from the chosen platform build
const ns = isNative ? load('./index.native.cjs') : load('./index.cjs');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
module.exports = ns;

import { detectPlatform } from './runtime/detectTestPlatform';
import { createKit as createWebKit } from './createKit';
import { createKitNative as createNativeKit } from './createKitNative';
import type { WebKitContext } from './types/web';
import type { NativeKitContext } from './types/native';
import type { AnyPlugin } from './types/core';

export * from './types/core';
export type { WebKitContext } from './types/web';
export type { NativeKitContext } from './types/native';
export { definePlugin } from './helpers/definePlugin';
export { setupTestKit } from './setup';
export { makeKitBuilder } from './kitBuilder';
export { defaultPlugins } from './defaultPlugins';
export { defaultPluginsNative } from './defaultPlugins.native';
export * from './plugins/flow';
export * from './plugins/api';
export * from './plugins/keyboard';
export * from './plugins/datePlugin';
export * from './plugins/performance';
export * from './plugins/dnd';
export * from './plugins/interactionsPlugin';
export * from './plugins/page';
export * from './plugins/state';
export * from './plugins/router';
export { configureRedux } from './redux/config';
export { configureRouter } from './router/config';
export type { TestKitReduxState } from './types/redux';

type Platform = 'web' | 'native';

export type UnifiedKitContext<TPlatform extends Platform> =
    TPlatform extends 'web' ? WebKitContext : NativeKitContext;

export { createWebKit as createKit, createNativeKit as createKitNative };

export function createKitFor(
    platform: 'web',
    ...plugins: readonly AnyPlugin[]
): WebKitContext;
export function createKitFor(
    platform: 'native',
    ...plugins: readonly AnyPlugin[]
): NativeKitContext;
export function createKitFor(
    platform: Platform,
    ...plugins: readonly AnyPlugin[]
): WebKitContext | NativeKitContext {
    return platform === 'web'
        ? createWebKit(...plugins)
        : createNativeKit(...plugins);
}

export function createKitAuto(): WebKitContext | NativeKitContext;
export function createKitAuto(
    ...plugins: readonly AnyPlugin[]
): WebKitContext | NativeKitContext;
export function createKitAuto(
    ...plugins: readonly AnyPlugin[]
): WebKitContext | NativeKitContext {
    const platform = detectPlatform();
    return platform === 'web'
        ? createWebKit(...plugins)
        : createNativeKit(...plugins);
}

export const getDetectedPlatform = (): Platform => detectPlatform();
