import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    entries: ['src/index'],
    outDir: 'dist',
    clean: true,
    declaration: true,
    rollup: {
        emitCJS: true,
        esbuild: {
            target: 'es2020',
        },
    },
    externals: [
        'react',
        'react-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        'react-redux',
        '@reduxjs/toolkit',
        'redux',
    ],
});
