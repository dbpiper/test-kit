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
