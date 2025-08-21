// Project-wide headlamp defaults for test-kit
const config = {
    // Always run sequentially to match multi-project Jest setup
    sequential: true,

    // Ensure Jest reads our multi-project config reliably
    jestArgs: ['--no-watchman'],

    // Coverage-context defaults
    coverage: {
        abortOnFailure: true,
        mode: 'auto' as const,
        pageFit: true,
    },

    // Changed-context defaults
    changed: {
        depth: 20,
    } as const,
};

export default config;
