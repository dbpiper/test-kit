import { definePlugin } from '../helpers/definePlugin';

export type DateHelpers = {
    setBase: (date: Date) => void;
    setToday: (options?: { at?: 'midnightLocal' | 'now' }) => void;
    freeze: (date?: Date) => void;
    unfreeze: () => void;
    // Test lifecycle helpers are intentionally exposed so callers can
    // register per-test resets from a global setup file.
    resetForTest: () => void;
    registerJestDateHooks: () => void;
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

            // Provide explicit lifecycle helpers instead of auto-registering
            // Jest hooks from inside setup(). Consumers should call
            // registerJestDateHooks() once in a global setup file.
            const resetForTest = (): void => {
                frozen = false;
                setBase(defaultBase);
            };

            const registerJestDateHooks = (): void => {
                const globalHooks = globalThis as unknown as {
                    beforeEach?: (fn: () => void) => void;
                    afterEach?: (fn: () => void) => void;
                };
                globalHooks.beforeEach?.(() => {
                    resetForTest();
                });
                globalHooks.afterEach?.(() => {
                    unfreeze();
                });
            };

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

            return {
                setBase,
                setToday,
                freeze,
                unfreeze,
                resetForTest,
                registerJestDateHooks,
            } as DateHelpers;
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
