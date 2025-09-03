import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts', 'src/index.native.ts', 'src/index.unified.ts'],
    outDir: 'dist',
    clean: true,
    dts: true,
    format: ['esm', 'cjs'],
    target: 'es2020',
    external: [
        // Web/testing
        'react',
        'react-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        'react-redux',
        '@reduxjs/toolkit',
        'redux',

        // Native/testing
        '@testing-library/react-native',

        // React Native core
        'react-native',

        // Specific common RN libraries
        'react-native-gesture-handler',
        'react-native-reanimated',
        'react-native-safe-area-context',
        'react-native-screens',
        'react-native-vector-icons',
        'react-native-svg',
        'react-native-webview',
        'react-native-linear-gradient',
        'react-native-localize',
        'react-native-device-info',
        'react-native-permissions',
        'react-native-config',
        'react-native-keyboard-aware-scroll-view',
        'react-native-uuid',
        'react-native-mmkv',
        'react-native-fast-image',
        'react-native-share',
        'react-native-image-picker',
        'react-native-pager-view',
        'react-native-bootsplash',

        // Scoped RN libraries
        '@react-native-async-storage/async-storage',
        '@react-native-masked-view/masked-view',
        '@react-native-community/netinfo',

        // React Navigation
        '@react-navigation/native',
        '@react-navigation/bottom-tabs',
        '@react-navigation/stack',
        '@react-navigation/drawer',
        '@react-navigation/native-stack',

        // React Native Firebase
        '@react-native-firebase/app',
        '@react-native-firebase/auth',
        '@react-native-firebase/messaging',
        '@react-native-firebase/crashlytics',
        '@react-native-firebase/analytics',
        '@react-native-firebase/perf',
        '@react-native-firebase/remote-config',

        // Metro/build tool related
        '@react-native/metro-config',
        '@react-native/babel-preset',
        'metro',
        'metro-config',

        // Broad patterns to ensure all RN-related deps are externalized
        /^@react-navigation\//,
        /^@react-native\//,
        /^@react-native-community\//,
        /^@react-native-firebase\//,
        /^react-native(-.*)?$/,
    ],
});
