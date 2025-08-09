import { definePlugin } from "../helpers/definePlugin";

type PerformanceTest = () => Promise<void>;
type PerformanceAssertion = (fn: PerformanceTest) => Promise<void>;

export type PerformanceHelpers = {
  shouldCompleteWithin: (maxMs: number) => void;
  shouldRenderWithin: (maxMs: number) => void;
  shouldUpdateWithin: (maxMs: number) => void;
  shouldInteractWithin: (maxMs: number) => void;
  run: (testFn: PerformanceTest) => Promise<void>;
};

export const performancePlugin = definePlugin<
  "performance",
  PerformanceHelpers
>("performance", {
  key: Symbol("performance"),
  setup() {
    const assertions: PerformanceAssertion[] = [];

    const shouldCompleteWithin = (maxMs: number) => {
      const assertion: PerformanceAssertion = async (fn) => {
        const t0 = performance.now();
        await fn();
        const ms = performance.now() - t0;
        expect(ms).toBeLessThan(maxMs);
      };
      assertions.push(assertion);
    };

    const shouldRenderWithin = (maxMs: number) => {
      const assertion: PerformanceAssertion = async (fn) => {
        const t0 = performance.now();
        await fn();
        const ms = performance.now() - t0;
        expect(ms).toBeLessThan(maxMs);
      };
      assertions.push(assertion);
    };

    const shouldUpdateWithin = (maxMs: number) => {
      const assertion: PerformanceAssertion = async (fn) => {
        const t0 = performance.now();
        await fn();
        const ms = performance.now() - t0;
        expect(ms).toBeLessThan(maxMs);
      };
      assertions.push(assertion);
    };

    const shouldInteractWithin = (maxMs: number) => {
      const assertion: PerformanceAssertion = async (fn) => {
        const t0 = performance.now();
        await fn();
        const ms = performance.now() - t0;
        expect(ms).toBeLessThan(maxMs);
      };
      assertions.push(assertion);
    };

    const run = async (testFn: PerformanceTest) => {
      for (const assertion of assertions) {
        // eslint-disable-next-line no-await-in-loop
        await assertion(testFn);
      }
    };

    return {
      shouldCompleteWithin,
      shouldRenderWithin,
      shouldUpdateWithin,
      shouldInteractWithin,
      run,
    };
  },
});
