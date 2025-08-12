/* eslint-disable @typescript-eslint/no-require-imports */
/** @jest-environment node */

import type {
    PlatformSignals,
    TestKitMode,
    FusionWeights,
} from '../src/runtime/detectTestPlatform';

const saveGlobals = (): Record<string, unknown> => ({
    window: (globalThis as unknown as { window?: unknown }).window,
    document: (globalThis as unknown as { document?: unknown }).document,
    navigator: (globalThis as unknown as { navigator?: unknown }).navigator,
});

const restoreGlobals = (snapshot: Record<string, unknown>): void => {
    (globalThis as unknown as { window?: unknown }).window = snapshot.window;
    (globalThis as unknown as { document?: unknown }).document =
        snapshot.document;
    (globalThis as unknown as { navigator?: unknown }).navigator =
        snapshot.navigator;
};

const setDom = (enabled: boolean): void => {
    if (enabled) {
        (globalThis as unknown as { window?: unknown }).window = {};
        (
            globalThis as unknown as {
                document?: { createElement?: () => unknown };
            }
        ).document = {
            createElement: () => ({}),
        };
    } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as unknown as { window?: unknown }).window;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as unknown as { document?: unknown }).document;
    }
};

const setNavigator = (userAgent: string, product?: string): void => {
    (
        globalThis as unknown as {
            navigator?: { userAgent?: string; product?: string };
        }
    ).navigator = { userAgent, product };
};

describe('runtime platform detection', () => {
    let globalsSnapshot: Record<string, unknown>;

    beforeEach(() => {
        jest.resetModules();
        globalsSnapshot = saveGlobals();
    });

    afterEach(() => {
        restoreGlobals(globalsSnapshot);
        jest.clearAllMocks();
    });

    test('web: DOM present, no RN signals', () => {
        setDom(true);
        setNavigator('Mozilla/5.0 (like Gecko)', 'Gecko');

        jest.isolateModules(() => {
            const mod = require('../src/runtime/detectTestPlatform') as {
                detectPlatform: () => TestKitMode;
                collectPlatformSignals: () => PlatformSignals;
                isDomAvailable: () => boolean;
                buildFeatures: (
                    signals: PlatformSignals
                ) => Record<string, 0 | 1>;
                fuseSignals: (signals: PlatformSignals) => {
                    mode: TestKitMode;
                    confidence: number;
                    scores: Record<TestKitMode, number>;
                };
                debugPlatformDecision: () => void;
                setResolverForTests: (fn?: (id: string) => string) => void;
            };

            // Force unresolvable RN libs for this isolated module
            mod.setResolverForTests((id: string) => {
                if (
                    id === 'react-native' ||
                    id === '@testing-library/react-native'
                ) {
                    throw new Error('not found');
                }
                return '/dev/null';
            });

            expect(mod.isDomAvailable()).toBe(true);

            const signals = mod.collectPlatformSignals();

            expect(signals.hasDom).toBe(true);
            // RN libraries are forced unresolvable for this scenario inside module
            expect(signals.rnResolvable).toBe(false);
            expect(signals.rnTLResolvable).toBe(false);
            expect(mod.detectPlatform()).toBe('web');

            // cleanup injected resolver
            mod.setResolverForTests(undefined);
        });
    });

    test('web: jsdom UA hint toggles hasDom without structural DOM', () => {
        setDom(false);
        setNavigator('JSDOM TestingBot 99.1', 'Gecko');

        jest.isolateModules(() => {
            const { isDomAvailable } =
                require('../src/runtime/detectTestPlatform') as {
                    isDomAvailable: () => boolean;
                };
            expect(isDomAvailable()).toBe(true);
        });
    });

    test('native: RN Platform.OS present -> early return', () => {
        setDom(false);
        setNavigator('Some UA', 'Gecko');

        jest.isolateModules(() => {
            const mod = require('../src/runtime/detectTestPlatform') as {
                detectPlatform: () => TestKitMode;
                setResolverForTests: (fn?: (id: string) => string) => void;
            };
            mod.setResolverForTests((id: string) => {
                if (
                    id === 'react-native' ||
                    id === '@testing-library/react-native'
                ) {
                    return `/virtual/${id}/index.js`;
                }
                return '/dev/null';
            });
            jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }), {
                virtual: true,
            });
            expect(mod.detectPlatform()).toBe('native');
            mod.setResolverForTests(undefined);
        });
    });

    test('native: navigator.product === ReactNative triggers early return', () => {
        setDom(false);
        setNavigator('whatever', 'ReactNative');

        jest.isolateModules(() => {
            const { detectPlatform } =
                require('../src/runtime/detectTestPlatform') as {
                    detectPlatform: () => TestKitMode;
                };
            expect(detectPlatform()).toBe('native');
        });
    });

    test('fuseSignals maps features and returns probabilities', () => {
        setDom(false);
        setNavigator('jsdom 20.0', 'ReactNative');
        jest.isolateModules(() => {
            const mod = require('../src/runtime/detectTestPlatform') as {
                collectPlatformSignals: () => PlatformSignals;
                buildFeatures: (
                    signals: PlatformSignals
                ) => Record<string, 0 | 1>;
                fuseSignals: (signals: PlatformSignals) => {
                    mode: TestKitMode;
                    confidence: number;
                    scores: Record<TestKitMode, number>;
                };
                setResolverForTests: (fn?: (id: string) => string) => void;
            };
            mod.setResolverForTests((id: string) => {
                if (
                    id === 'react-native' ||
                    id === '@testing-library/react-native'
                ) {
                    return `/virtual/${id}/index.js`;
                }
                return '/dev/null';
            });
            jest.doMock(
                'react-native',
                () => ({ Platform: { OS: 'android' } }),
                { virtual: true }
            );

            const signals = mod.collectPlatformSignals();
            const features = mod.buildFeatures(signals);
            // In monorepos RN may be present; assert a stable subset
            expect(features).toMatchObject({
                isJsDomUA: 1,
                navProductReactNative: 1,
            });

            const fused = mod.fuseSignals(signals);
            expect(['web', 'native']).toContain(fused.mode);
            expect(fused.confidence).toBeGreaterThan(0);
            expect(fused.scores).toHaveProperty('web');
            expect(fused.scores).toHaveProperty('native');
            mod.setResolverForTests(undefined);
        });
    });

    test('detectPlatform: falls back to legacy when fusion confidence < 0.6 and DOM present', () => {
        setDom(true);
        setNavigator('plain UA', 'Gecko');

        jest.isolateModules(() => {
            const mod = require('../src/runtime/detectTestPlatform') as {
                detectPlatform: () => TestKitMode;
                fuseSignals: (signals: PlatformSignals) => {
                    mode: TestKitMode;
                    confidence: number;
                    scores: Record<TestKitMode, number>;
                };
                setResolverForTests: (fn?: (id: string) => string) => void;
            };

            // Ensure RN libs are not resolvable
            mod.setResolverForTests((id: string) => {
                if (
                    id === 'react-native' ||
                    id === '@testing-library/react-native'
                ) {
                    throw new Error('not found');
                }
                return '/dev/null';
            });

            const fuseSpy = jest.spyOn(mod, 'fuseSignals').mockReturnValue({
                mode: 'native',
                confidence: 0.51,
                scores: { web: 0, native: 0 },
            });

            expect(mod.detectPlatform()).toBe('web');
            fuseSpy.mockRestore();
            mod.setResolverForTests(undefined);
        });
    });

    test('resolveModes: explicit requests are honored', () => {
        jest.isolateModules(() => {
            const { resolveModes } =
                require('../src/runtime/detectTestPlatform') as {
                    resolveModes: (
                        req?: 'web' | 'native' | 'both'
                    ) => TestKitMode[];
                };
            expect(resolveModes('web')).toEqual(['web']);
            expect(resolveModes('native')).toEqual(['native']);
            expect(resolveModes('both')).toEqual(['web', 'native']);
        });
    });

    test('fuseSignals: deterministic math with forced weights', () => {
        jest.isolateModules(() => {
            const { buildFeatures, fuseSignals } =
                require('../src/runtime/detectTestPlatform') as {
                    buildFeatures: (
                        signals: PlatformSignals
                    ) => Record<string, 0 | 1>;
                    fuseSignals: (
                        signals: PlatformSignals,
                        weights: Record<TestKitMode, FusionWeights>
                    ) => {
                        mode: TestKitMode;
                        confidence: number;
                        scores: Record<TestKitMode, number>;
                    };
                };

            const signals: PlatformSignals = {
                hasDom: true,
                isJsDomUA: false,
                rnPlatformOS: null,
                rnTLResolvable: false,
                rnResolvable: false,
                navProduct: '',
            };
            const features = buildFeatures(signals);
            expect(features.hasDom).toBe(1);

            const forcedWeb: FusionWeights = {
                bias: 0,
                w: {
                    hasDom: 10,
                    isJsDomUA: 0,
                    rnPlatformOS: 0,
                    rnTLResolvable: 0,
                    rnResolvable: 0,
                    navProductReactNative: 0,
                },
            };
            const forcedNative: FusionWeights = {
                bias: 0,
                w: {
                    hasDom: -10,
                    isJsDomUA: 0,
                    rnPlatformOS: 0,
                    rnTLResolvable: 0,
                    rnResolvable: 0,
                    navProductReactNative: 0,
                },
            };

            const result = fuseSignals(signals, {
                web: forcedWeb,
                native: forcedNative,
            });
            expect(result.mode).toBe('web');
            expect(result.confidence).toBeGreaterThan(0.5);
        });
    });
});
