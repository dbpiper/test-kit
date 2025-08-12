import { createKit } from '../src';

describe('createKit inside test (web)', () => {
    it('does not throw and exposes date helpers when created inside a test', () => {
        const kit = createKit();

        // Sanity: core helpers should exist
        expect(kit.screen).toBeDefined();
        expect(kit.user).toBeDefined();

        // Date plugin should be available without attempting to register hooks here
        expect(kit.date).toBeDefined();
        expect(typeof kit.date.resetForTest).toBe('function');
        expect(typeof kit.date.registerJestDateHooks).toBe('function');

        // Basic date operations should be callable
        kit.date.resetForTest();
        kit.date.freeze();
        kit.date.unfreeze();
    });
});
