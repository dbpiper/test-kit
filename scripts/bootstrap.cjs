/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable import/extensions */
'use strict';

// Bootstrap loader for test-kit CommonJS entry point.
//
// Responsibilities:
// - Detect if React Native testing library is available to choose the native build.
// - Load the appropriate module variant: native (index.native.cjs) or web (index.web.cjs).
// - Ensure CommonJS compatibility for both default and named exports.

// Determine whether to use the React Native variant using a multi-layered strategy.
// The order of checks prioritizes explicit library presence and then runtime signals,
// to be robust across different RNTL versions and execution environments.
function detectReactNativeEnvironment() {
    // 1) Primary: Detect @testing-library/react-native directly.
    try {
        require.resolve('@testing-library/react-native');
        return true;
    } catch {
        // noop: not resolvable via @testing-library/react-native
    }

    // 2) Fallback: Detect the react-native package itself.
    try {
        require.resolve('react-native');
        return true;
    } catch {
        // noop: not resolvable via react-native
    }

    // 3) Fallback: Detect React Native globals (e.g., Platform.OS).
    try {
        let globalScope;
        if (typeof globalThis !== 'undefined') {
            globalScope = globalThis;
        } else if (typeof global !== 'undefined') {
            globalScope = global;
        } else {
            globalScope = undefined;
        }
        if (
            globalScope &&
            typeof globalScope.Platform === 'object' &&
            globalScope.Platform &&
            typeof globalScope.Platform.OS === 'string'
        ) {
            return true;
        }
    } catch {
        // noop: Platform global not available
    }

    // 4) Fallback: Detect navigator.product === 'ReactNative'.
    try {
        let globalScope;
        if (typeof globalThis !== 'undefined') {
            globalScope = globalThis;
        } else if (typeof global !== 'undefined') {
            globalScope = global;
        } else {
            globalScope = undefined;
        }
        const nav = globalScope && globalScope.navigator;
        if (nav && typeof nav === 'object' && nav.product === 'ReactNative') {
            return true;
        }
    } catch {
        // noop: navigator product not available
    }

    return false;
}

const useNative = detectReactNativeEnvironment();

// Load the selected implementation.
const mod = useNative
    ? require('./index.native.cjs')
    : require('./index.web.cjs');

// CommonJS export compatibility layer:
// - Preserve default-style export (module.exports = ...)
// - Re-export all named exports onto module.exports
// - Preserve explicit default if present on the loaded module
module.exports = mod;
Object.assign(module.exports, mod);
if (mod && Object.hasOwn(mod, 'default')) {
    module.exports.default = mod.default;
}
