/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, afterEach } from '@jest/globals';

import { apiPlugin } from '../src/plugins/api';

describe('apiPlugin setup and clean-slate behavior', () => {
    afterEach(() => {
        // Ensure we don't leave a patched beforeEach on global
        // between tests if we temporarily override it.
        const globalObj = global as any;
        // eslint-disable-next-line no-underscore-dangle
        delete globalObj.__TEST_BEFORE_EACH_STUB__;
        // eslint-disable-next-line no-underscore-dangle
        if (globalObj.__ORIG_BEFORE_EACH__) {
            // eslint-disable-next-line no-underscore-dangle
            globalObj.beforeEach = globalObj.__ORIG_BEFORE_EACH__;
            // eslint-disable-next-line no-underscore-dangle
            delete globalObj.__ORIG_BEFORE_EACH__;
        }
    });

    it('resets prior shared state on setup and resolves idleResolvers', async () => {
        const globalObj = global as any;
        let resolverCalled = false;
        // Pre-seed shared state to simulate leakage from a previous test run
        // eslint-disable-next-line no-underscore-dangle
        globalObj.__testKitApi = {
            calls: [
                {
                    method: 'GET',
                    path: '/old',
                    base: 'http://localhost',
                    headers: {},
                    timestamp: Date.now(),
                },
            ],
            abortedCalls: [
                {
                    method: 'GET',
                    path: '/old',
                    timestamp: Date.now(),
                },
            ],
            mockRoutes: [
                {
                    method: 'GET',
                    rawPath: '/old',
                    isAbsolute: false,
                    status: 200,
                    body: { ok: true },
                    remainingUses: 1,
                },
            ],
            nextRequestId: 42,
            active: new Set<number>([1, 2]),
            idleResolvers: [
                () => {
                    resolverCalled = true;
                },
            ],
            hooksInstalled: false,
        };

        const plugin = apiPlugin();
        const api = plugin.setup({} as any);
        // setup() now force-clears shared state
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.calls.length).toBe(0);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.abortedCalls.length).toBe(0);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.mockRoutes.length).toBe(0);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.nextRequestId).toBe(1);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.active.size).toBe(0);
        expect(resolverCalled).toBe(true);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.idleResolvers.length).toBe(0);

        // Clean up
        api.clear();
        plugin.teardown?.({} as any);
    });

    it('initializes shared state without attempting hook installation during plugin setup', async () => {
        const globalObj = global as any;

        // Set up clean initial state
        // eslint-disable-next-line no-underscore-dangle
        delete globalObj.__testKitApi;

        const plugin = apiPlugin();
        const api = plugin.setup({} as any);

        // Verify shared state was initialized
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi).toBeDefined();
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.calls).toEqual([]);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.abortedCalls).toEqual([]);
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.mockRoutes).toEqual([]);

        // Hook installation no longer happens during plugin setup - it's handled in setupTestKit
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.hooksInstalled).toBeFalsy();

        api.clear();
        plugin.teardown?.({} as any);
    });

    it('works correctly when no global beforeEach is present', async () => {
        const globalObj = global as any;
        const saved = globalObj.beforeEach;
        delete globalObj.beforeEach;
        // eslint-disable-next-line no-underscore-dangle
        delete globalObj.__testKitApi;

        // This test verifies that the plugin works correctly when no global beforeEach exists.
        // Hook installation is now handled in setupTestKit, not during plugin setup.

        const pluginInstance = apiPlugin();
        const inst = pluginInstance.setup({} as any);

        // Verify shared state was initialized
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi).toBeDefined();
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.calls).toEqual([]);

        // Hooks are not installed during plugin setup anymore
        // eslint-disable-next-line no-underscore-dangle
        expect(globalObj.__testKitApi.hooksInstalled).toBeFalsy();

        // Clean up
        inst.clear();
        pluginInstance.teardown?.({} as any);

        // Restore
        if (saved) {
            globalObj.beforeEach = saved;
        }
    });
});
