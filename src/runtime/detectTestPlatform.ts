// No top-level React Native imports; pure Node-safe detection.

export type TestKitMode = 'web' | 'native';
export type PlatformSignals = {
    hasDom: boolean;
    isJsDomUA: boolean;
    rnPlatformOS: string | null;
    rnTLResolvable: boolean;
    rnResolvable: boolean;
    navProduct: string;
};

// +++ add: feature & weight plumbing
export type FusionFeatures = {
    hasDom: 0 | 1;
    isJsDomUA: 0 | 1;
    rnPlatformOS: 0 | 1;
    rnTLResolvable: 0 | 1;
    rnResolvable: 0 | 1;
    navProductReactNative: 0 | 1;
};

export type FusionWeights = {
    bias: number;
    w: { [K in keyof FusionFeatures]: number };
};

export type ClassWeights = Record<TestKitMode, FusionWeights>;

// Resolver override for tests only; null in production
// eslint-disable-next-line no-underscore-dangle
let __testResolve: ((id: string) => string) | null = null;

export const setResolverForTests = (fn?: (id: string) => string): void => {
    __testResolve = fn ?? null;
};

export const isDomAvailable = (): boolean => {
    const globalObject = globalThis as unknown as {
        document?: { createElement?: unknown };
        window?: unknown;
        navigator?: { userAgent?: unknown };
    };
    const structuralDomAvailable =
        typeof globalObject.document !== 'undefined' &&
        typeof globalObject.window !== 'undefined' &&
        typeof globalObject.document?.createElement === 'function';

    const userAgent = String(
        globalObject.navigator?.userAgent ?? ''
    ).toLowerCase();
    const userAgentHints =
        userAgent.includes('jsdom') || userAgent.includes('happy-dom');

    return structuralDomAvailable || userAgentHints;
};

const canResolve = (id: string): boolean => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const resolveFn = __testResolve ?? require.resolve;
        resolveFn(id);
        return true;
    } catch {
        return false;
    }
};

const isRNNavigator = (): boolean => {
    // RN preset: navigator.product === 'ReactNative'
    // JSDOM: usually "Gecko"
    const nav = (globalThis as unknown as { navigator?: { product?: unknown } })
        .navigator;
    const product =
        typeof nav?.product === 'string' ? nav.product.toLowerCase() : '';
    return product === 'reactnative';
};

const getRNPlatformOS = (): string | null => {
    if (!canResolve('react-native')) {
        return null;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const reactNativeModule = require('react-native');
        const platformOS =
            typeof reactNativeModule?.Platform?.OS === 'string'
                ? reactNativeModule.Platform.OS
                : null;
        return platformOS ?? null;
    } catch {
        return null;
    }
};

export const collectPlatformSignals = (): PlatformSignals => {
    const hasDom = isDomAvailable();
    const globalObject = globalThis as unknown as {
        navigator?: { userAgent?: unknown; product?: unknown };
    };
    const isJsDomUA = String(globalObject.navigator?.userAgent ?? '')
        .toLowerCase()
        .includes('jsdom');
    const rnTLResolvable = canResolve('@testing-library/react-native');
    const rnResolvable = canResolve('react-native');
    const rnPlatformOS = getRNPlatformOS();
    const navProduct =
        typeof globalObject.navigator?.product === 'string'
            ? (globalObject.navigator!.product as string)
            : '';
    return {
        hasDom,
        isJsDomUA,
        rnPlatformOS,
        rnTLResolvable,
        rnResolvable,
        navProduct,
    };
};

// +++ add: convert raw signals -> numeric features
export const buildFeatures = (
    platformSignals: PlatformSignals
): FusionFeatures => ({
    hasDom: platformSignals.hasDom ? 1 : 0,
    isJsDomUA: platformSignals.isJsDomUA ? 1 : 0,
    rnPlatformOS: typeof platformSignals.rnPlatformOS === 'string' ? 1 : 0,
    rnTLResolvable: platformSignals.rnTLResolvable ? 1 : 0,
    rnResolvable: platformSignals.rnResolvable ? 1 : 0,
    navProductReactNative:
        platformSignals.navProduct.toLowerCase() === 'reactnative' ? 1 : 0,
});

const DEFAULT_WEIGHTS: ClassWeights = {
    web: {
        bias: 0.5,
        w: {
            hasDom: 2.2,
            isJsDomUA: 0.8,
            rnPlatformOS: -3.0,
            rnTLResolvable: -2.0,
            rnResolvable: -1.2,
            navProductReactNative: -3.0,
        },
    },
    native: {
        bias: -0.2,
        w: {
            hasDom: -1.6,
            isJsDomUA: -0.5,
            rnPlatformOS: 3.2,
            rnTLResolvable: 2.1,
            rnResolvable: 1.1,
            navProductReactNative: 3.0,
        },
    },
};

const linear = (
    features: FusionFeatures,
    fusionWeights: FusionWeights
): number =>
    fusionWeights.bias +
    fusionWeights.w.hasDom * features.hasDom +
    fusionWeights.w.isJsDomUA * features.isJsDomUA +
    fusionWeights.w.rnPlatformOS * features.rnPlatformOS +
    fusionWeights.w.rnTLResolvable * features.rnTLResolvable +
    fusionWeights.w.rnResolvable * features.rnResolvable +
    fusionWeights.w.navProductReactNative * features.navProductReactNative;

const softmax2 = (
    firstLogit: number,
    secondLogit: number
): [number, number] => {
    const maxLogit = firstLogit > secondLogit ? firstLogit : secondLogit;
    const expFirst = Math.exp(firstLogit - maxLogit);
    const expSecond = Math.exp(secondLogit - maxLogit);
    const sumExp = expFirst + expSecond;
    return [expFirst / sumExp, expSecond / sumExp];
};

export const fuseSignals = (
    signals: PlatformSignals,
    weights: ClassWeights = DEFAULT_WEIGHTS
): {
    mode: TestKitMode;
    confidence: number;
    scores: Record<TestKitMode, number>;
} => {
    const features = buildFeatures(signals);
    const webLogit = linear(features, weights.web);
    const nativeLogit = linear(features, weights.native);
    const [probWeb, probNative] = softmax2(webLogit, nativeLogit);
    const mode: TestKitMode = probNative > probWeb ? 'native' : 'web';
    const confidence = Math.max(probWeb, probNative);
    return { mode, confidence, scores: { web: webLogit, native: nativeLogit } };
};

// No env-var based overrides for mode. Mode comes from requested or detection.

export const detectPlatform = (): TestKitMode => {
    const signals = collectPlatformSignals();

    // Strong signals should win fast to avoid surprise regressions
    if (typeof signals.rnPlatformOS === 'string') {
        return 'native';
    }
    if (isRNNavigator()) {
        return 'native';
    }

    // Neural-ish fusion for the ambiguous cases
    const { mode, confidence } = fuseSignals(signals);

    // If we’re decisive, trust fusion. If not, fall back to legacy heuristics.
    if (confidence >= 0.6) {
        return mode;
    }

    // Legacy tie-breakers to preserve current defaults
    if (signals.hasDom) {
        return 'web';
    }
    if (signals.rnTLResolvable || signals.rnResolvable) {
        return 'native';
    }
    return 'web';
};

export const resolveModes = (
    requested?: 'web' | 'native' | 'both'
): Array<TestKitMode> => {
    const choice = requested;

    if (choice === 'both') {
        return ['web', 'native'];
    }
    if (choice === 'web' || choice === 'native') {
        return [choice];
    }

    return [detectPlatform()];
};

export const debugPlatformDecision = (): void => {
    const signals = collectPlatformSignals();
    const features = buildFeatures(signals);
    const fused = fuseSignals(signals);
    // eslint-disable-next-line no-console
    console.warn(
        '[test-kit] platform signals:',
        signals,
        'features:',
        features,
        'fused:',
        fused
    );
};
