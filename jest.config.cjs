/** @type {import('jest').Config} */
module.exports = {
    projects: [
        {
            displayName: 'web',
            preset: 'ts-jest',
            testEnvironment: 'jest-environment-jsdom',
            roots: ['<rootDir>/tests'],
            testMatch: ['<rootDir>/tests/**/*.web.test.ts?(x)'],
            moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
            transform: {
                '^.+\\.(ts|tsx)$': [
                    'ts-jest',
                    {
                        tsconfig: '<rootDir>/tsconfig.json',
                    },
                ],
            },
            transformIgnorePatterns: [
                'node_modules/(?!(react|react-dom|@testing-library|@suerg)/)',
            ],
            setupFilesAfterEnv: ['<rootDir>/tests/setupTests.web.ts'],
            moduleNameMapper: {
                '\\.(css|less|scss)$': '<rootDir>/tests/styleMock.js',
            },
            clearMocks: true,
        },
        {
            displayName: 'native',
            preset: 'react-native',
            testEnvironment: 'node',
            roots: ['<rootDir>/tests'],
            testMatch: ['<rootDir>/tests/**/*.native.test.ts?(x)'],
            moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
            transform: {
                '^.+\\.[jt]sx?$': ['babel-jest'],
            },
            transformIgnorePatterns: [
                'node_modules/(?!(react-native|@react-native|react|react-dom|react-clone-referenced-element|@testing-library|@suerg)/)',
            ],
            setupFilesAfterEnv: ['<rootDir>/tests/setupTests.native.ts'],
            clearMocks: true,
        },
        {
            displayName: 'node',
            preset: 'ts-jest',
            testEnvironment: 'node',
            roots: ['<rootDir>/tests'],
            // Pick up "everything", then explicitly ignore web/native-tagged tests
            testMatch: [
                '<rootDir>/tests/**/*.test.ts?(x)',
                '<rootDir>/tests/**/*.spec.ts?(x)',
            ],
            testPathIgnorePatterns: [
                '/node_modules/',
                '\\.web\\.test\\.tsx?$',
                '\\.web\\.spec\\.tsx?$',
                '\\.native\\.test\\.tsx?$',
                '\\.native\\.spec\\.tsx?$',
            ],
            moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
            transform: {
                '^.+\\.(ts|tsx)$': [
                    'ts-jest',
                    { tsconfig: '<rootDir>/tsconfig.json' },
                ],
            },
            // Keep RN transforms out of this project; it’s pure Node helpers
            transformIgnorePatterns: ['<rootDir>/node_modules/'],
            // Optional: a tiny, empty setup so you can add Node-only hooks later
            // setupFilesAfterEnv: ['<rootDir>/tests/setupTests.node.ts'],
            clearMocks: true,
        },
    ],
};
