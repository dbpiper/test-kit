import { definePlugin } from "../helpers/definePlugin";

export type DateHelpers = Record<string, never>;

// Freeze system time without switching to fake timers.
// Implements a minimal version of sinon's setSystemTime:
// - Overrides global Date constructor so `new Date()` and `Date()` return the fixed time when called without args
// - Overrides `Date.now()` to the fixed epoch
// - Leaves timers (setTimeout, setInterval, etc.) as real timers
export const datePlugin = (date: Date = new Date("2024-01-15T12:00:00.000Z")) =>
  definePlugin<"date", DateHelpers>("date", {
    key: Symbol("date"),
    setup() {
      const fixedTs = date.getTime();
      const originalDateRef = Date as unknown as typeof Date;

      // Create a replacement Date that returns the fixed time when called with no args
      // and otherwise behaves like the native Date.
      const FixedDate = new Proxy(originalDateRef, {
        construct(target, args: unknown[]) {
          return args.length === 0
            ? new originalDateRef(fixedTs)
            : new (originalDateRef as unknown as new (...a: unknown[]) => Date)(
                ...(args as unknown[])
              );
        },
        apply(target, thisArg, args: unknown[]) {
          // Date() called as function returns string representation of current time
          return args.length === 0
            ? new originalDateRef(fixedTs).toString()
            : (originalDateRef as unknown as (...a: unknown[]) => string).apply(
                thisArg,
                args as unknown[]
              );
        },
        get(target, prop, receiver) {
          if (prop === "now") {
            return () => fixedTs;
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as unknown as typeof Date;

      // Override global Date
      (globalThis as unknown as { Date: typeof Date }).Date = FixedDate;

      // Stash original on global for teardown
      (
        globalThis as unknown as { __TEST_KIT_ORIGINAL_DATE__?: typeof Date }
      ).__TEST_KIT_ORIGINAL_DATE__ = originalDateRef;

      return {} as DateHelpers;
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
