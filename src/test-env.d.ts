// minimal globals used by plugins
declare const jest: {
    useFakeTimers(): void;
    useRealTimers(): void;
    setSystemTime(date: Date): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mock(moduleName: string, factory: () => any): void;
};

// minimal expect signature used by plugins
type TestKitMatcher = {
    toBeLessThan: (max: number) => void;
    toHaveAttribute: (name: string, value?: string) => void;
    not: {
        toHaveAttribute: (name: string, value?: string) => void;
    };
};

declare const expect: (actual: unknown) => TestKitMatcher;

interface Window {
    XMLHttpRequest: typeof XMLHttpRequest;
    fetch: typeof fetch;
}
