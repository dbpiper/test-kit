import { definePlugin } from '../helpers/definePlugin';

let jestHooksRegistered = false;

export type DateHelpers = {
    setBase: (date: Date) => void;
    setToday: (options?: { at?: 'midnightLocal' | 'now' }) => void;
    freeze: (date?: Date) => void;
    unfreeze: () => void;
};

export type DatePluginOptions = {
    // Default base date each test starts from; time flows forward using real timers
    fixedAt?: Date;
};

export const datePlugin = (options: DatePluginOptions | Date = {}) =>
    definePlugin<'date', DateHelpers>('date', {
        key: Symbol('date'),
        setup() {
            const RealDate = Date as unknown as typeof Date;

            const resolvedOptions: DatePluginOptions =
                options instanceof Date ? { fixedAt: options } : options;

            const defaultBase =
                resolvedOptions.fixedAt ??
                new RealDate('2024-01-15T12:00:00.000Z');

            // Flowing-time state with optional freeze overlay
            let frozen = false;
            let frozenNowMs = 0;
            let baseFixedMs = defaultBase.getTime();
            let realAnchorMs = RealDate.now();

            const computeNow = (): number => {
                if (frozen) {
                    return frozenNowMs;
                }
                return baseFixedMs + (RealDate.now() - realAnchorMs);
            };

            const setBase = (date: Date): void => {
                baseFixedMs = date.getTime();
                realAnchorMs = RealDate.now();
            };

            const setToday = (opts?: {
                at?: 'midnightLocal' | 'now';
            }): void => {
                const nowReal = new RealDate(RealDate.now());
                if (opts?.at === 'midnightLocal') {
                    nowReal.setHours(0, 0, 0, 0);
                }
                setBase(nowReal);
            };

            const freeze = (date?: Date): void => {
                frozen = true;
                frozenNowMs = date ? date.getTime() : computeNow();
            };

            const unfreeze = (): void => {
                if (!frozen) {
                    return;
                }
                frozen = false;
                // Rebase so time continues from the frozen instant after unfreeze
                baseFixedMs = frozenNowMs;
                realAnchorMs = RealDate.now();
            };

            // Register Jest hooks (when available) to reset per-test and auto-unfreeze
            const registerJestHooks = (): void => {
                if (jestHooksRegistered) {
                    return;
                }
                // Avoid registering hooks from inside an active test context
                try {
                    const maybeExpect = (
                        globalThis as unknown as {
                            expect?: unknown;
                        }
                    ).expect as
                        | { getState?: () => { currentTestName?: string } }
                        | undefined;
                    const state = maybeExpect?.getState?.();
                    if (state?.currentTestName) {
                        return;
                    }
                } catch {
                    // ignore
                }
                try {
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                    const j = require('@jest/globals');
                    const gBefore = (
                        globalThis as unknown as {
                            beforeEach?: (fn: () => void) => void;
                        }
                    ).beforeEach;
                    const beforeEachHook = j.beforeEach ?? gBefore;
                    const gAfter = (
                        globalThis as unknown as {
                            afterEach?: (fn: () => void) => void;
                        }
                    ).afterEach;
                    const afterEachHook = j.afterEach ?? gAfter;
                    beforeEachHook?.(() => {
                        frozen = false;
                        setBase(defaultBase);
                    });
                    afterEachHook?.(() => {
                        unfreeze();
                    });
                    jestHooksRegistered = true;
                } catch {
                    const jestGlobals = globalThis as unknown as {
                        beforeEach?: (fn: () => void) => void;
                        afterEach?: (fn: () => void) => void;
                    };
                    jestGlobals.beforeEach?.(() => {
                        frozen = false;
                        setBase(defaultBase);
                    });
                    jestGlobals.afterEach?.(() => {
                        unfreeze();
                    });
                    jestHooksRegistered = true;
                }
            };
            registerJestHooks();

            // Date proxy using computeNow()
            const FixedDate = new Proxy(RealDate, {
                construct(_target, args: unknown[]) {
                    return args.length === 0
                        ? new RealDate(computeNow())
                        : new (RealDate as unknown as new (
                              ...argsList: unknown[]
                          ) => Date)(...args);
                },
                apply(_target, thisArg, args: unknown[]) {
                    return args.length === 0
                        ? new RealDate(computeNow()).toString()
                        : (
                              RealDate as unknown as (
                                  ...argsList: unknown[]
                              ) => string
                          ).apply(thisArg, args);
                },
                get(target, prop, receiver) {
                    if (prop === 'now') {
                        return () => computeNow();
                    }
                    return Reflect.get(target, prop, receiver);
                },
            }) as unknown as typeof Date;

            // Override global Date
            (globalThis as unknown as { Date: typeof Date }).Date = FixedDate;

            // Stash original on global for teardown
            (
                globalThis as unknown as {
                    __TEST_KIT_ORIGINAL_DATE__?: typeof Date;
                }
            ).__TEST_KIT_ORIGINAL_DATE__ = RealDate;

            return { setBase, setToday, freeze, unfreeze } as DateHelpers;
        },
        teardown() {
            const anyGlobal = globalThis as unknown as {
                Date: typeof Date;
                __TEST_KIT_ORIGINAL_DATE__?: typeof Date;
            };
            if (anyGlobal.__TEST_KIT_ORIGINAL_DATE__) {
                anyGlobal.Date = anyGlobal.__TEST_KIT_ORIGINAL_DATE__;
                delete anyGlobal.__TEST_KIT_ORIGINAL_DATE__;
            }
        },
    });
