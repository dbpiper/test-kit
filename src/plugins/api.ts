/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-continue */

import { definePlugin } from '../helpers/definePlugin';

export enum ApiVerboseArea {
    AxiosPatch = 'AxiosPatch',
    JestMocks = 'JestMocks',
    ModuleHook = 'ModuleHook',
    Requests = 'Requests',
}

// Minimal helper to build a URL string similar to axios.getUri when axios is not available
function buildUrlFromConfig(config: {
    baseURL?: string;
    url?: string;
}): string {
    const base =
        config.baseURL ||
        ((globalThis as unknown as { location?: { origin?: string } }).location
            ?.origin ??
            'http://localhost');
    const path = config.url || '';
    try {
        return new URL(path, base).toString();
    } catch {
        const baseTrim = String(base).replace(/\/$/, '');
        const pathTrim = String(path).replace(/^\//, '');
        return `${baseTrim}/${pathTrim}`;
    }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type Route = {
    method: HttpMethod;
    rawPath: string;
    isAbsolute: boolean;
    status: number;
    body: unknown;
    remainingUses: number;
};

export type ApiCallRecord = {
    method: HttpMethod;
    path: string;
    base: string;
    query?: Record<string, string | string[]>;
    headers: Record<string, string>;
    body?: unknown;
    timestamp: number;
};

export type ApiConfig = {
    debug?: boolean;
    verbose?: ApiVerboseArea[] | Set<ApiVerboseArea>;
};

export type ApiHelpers = {
    onGet(path: string, body: unknown, status?: number, repeat?: number): void;
    onPost(path: string, body: unknown, status?: number, repeat?: number): void;
    onPut(path: string, body: unknown, status?: number, repeat?: number): void;
    onDelete(
        path: string,
        body: unknown,
        status?: number,
        repeat?: number
    ): void;
    onGetHang(path: string): void;
    chaos: {
        rateLimit(path: string): void;
        serverError(path: string): void;
        timeout(path: string): void;
        networkError(path: string): void;
    };
    getCalls(method?: HttpMethod, path?: string): ApiCallRecord[];
    expectCalledTimes(
        method: HttpMethod,
        path: string,
        times: number
    ): Promise<void>;
    expectAbortedTimes(
        method: HttpMethod,
        path: string,
        times: number
    ): Promise<void>;
    clear(): void;
    waitForIdle(): Promise<void>;
    expectNoPending(): Promise<void>;
    getAbortedCalls(): {
        method: HttpMethod;
        path: string;
        timestamp: number;
    }[];
};

export const apiPlugin = (config: ApiConfig = {}) => {
    let originalXHR: typeof XMLHttpRequest;
    let originalFetch: typeof fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalAxiosAdapter: any;
    let originalAxiosAdapterEnv: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalAxiosRequest: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalModuleRequire: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalModuleLoad: any;

    return definePlugin<'api', ApiHelpers>('api', {
        key: Symbol('api'),
        setup() {
            const { debug = false } = config;
            const verboseSet: Set<ApiVerboseArea> = Array.isArray(
                config.verbose
            )
                ? new Set(config.verbose)
                : config.verbose instanceof Set
                  ? config.verbose
                  : new Set<ApiVerboseArea>();

            originalXHR = (
                globalThis as unknown as {
                    XMLHttpRequest: typeof XMLHttpRequest;
                }
            ).XMLHttpRequest;
            originalFetch = (globalThis as unknown as { fetch: typeof fetch })
                .fetch;

            // Force axios to use XHR adapter
            // regardless of Node/browser env so our FakeXHR intercepts
            originalAxiosAdapterEnv = (
                globalThis as unknown as {
                    process?: { env?: Record<string, string | undefined> };
                }
            ).process?.env?.AXIOS_HTTP_ADAPTER as string | undefined;
            ((
                globalThis as unknown as {
                    process?: { env?: Record<string, string | undefined> };
                }
            ).process ??= { env: {} }).env = {
                ...((
                    globalThis as unknown as {
                        process?: { env?: Record<string, string | undefined> };
                    }
                ).process?.env ?? {}),
                AXIOS_HTTP_ADAPTER: 'xhr',
            };

            const globalState = globalThis as unknown as {
                __testKitApi?: {
                    calls: ApiCallRecord[];
                    abortedCalls: {
                        method: HttpMethod;
                        path: string;
                        timestamp: number;
                    }[];
                    mockRoutes: Route[];
                    nextRequestId: number;
                    active: Set<number>;
                    idleResolvers: Array<() => void>;
                };
            };
            // eslint-disable-next-line no-underscore-dangle
            const shared = (globalState.__testKitApi ??= {
                calls: [] as ApiCallRecord[],
                abortedCalls: [] as {
                    method: HttpMethod;
                    path: string;
                    timestamp: number;
                }[],
                mockRoutes: [] as Route[],
                nextRequestId: 1,
                active: new Set<number>(),
                idleResolvers: [] as Array<() => void>,
            });

            const { calls, abortedCalls, mockRoutes } = shared;

            // Minimal event emitter to avoid DOM EventTarget/CustomEvent in RN
            const listeners: Record<
                string,
                Array<(detail: unknown) => void>
            > = {};
            const on = (
                event: 'call' | 'abort',
                fn: (detail: unknown) => void
            ) => {
                (listeners[event] ||= []).push(fn);
                return () => {
                    const arr = listeners[event];
                    if (!arr) {
                        return;
                    }
                    const idx = arr.indexOf(fn);
                    if (idx >= 0) {
                        arr.splice(idx, 1);
                    }
                };
            };
            const emit = (event: 'call' | 'abort', detail: unknown) => {
                (listeners[event] || []).forEach((fn) => fn(detail));
            };

            function isEnvDebugEnabled(): boolean {
                const envVal = (
                    globalThis as unknown as {
                        process?: { env?: Record<string, string | undefined> };
                    }
                ).process?.env?.TEST_KIT_API_DEBUG;
                return (
                    envVal != null && String(envVal).toLowerCase() === 'true'
                );
            }

            function logUser(...args: unknown[]) {
                const verboseEnabled = debug || isEnvDebugEnabled();
                if (verboseEnabled) {
                    // eslint-disable-next-line no-console
                    console.log('[API Plugin]', ...args);
                }
            }

            function logInternal(area: ApiVerboseArea, ...args: unknown[]) {
                const verboseEnabled = debug || isEnvDebugEnabled();
                if (verboseEnabled && verboseSet.has(area)) {
                    // eslint-disable-next-line no-console
                    console.log('[API Plugin]', ...args);
                }
            }

            function recordCall(apiCallRecord: ApiCallRecord) {
                calls.push(apiCallRecord);
                logUser(
                    'recordCall',
                    apiCallRecord.method,
                    apiCallRecord.path,
                    {
                        query: apiCallRecord.query,
                        base: apiCallRecord.base,
                    }
                );
                emit('call', apiCallRecord);
            }

            function recordAbort(abortRecord: {
                method: HttpMethod;
                path: string;
                timestamp: number;
            }) {
                abortedCalls.push(abortRecord);
                emit('abort', abortRecord);
            }

            function startRequest(): number {
                const id = shared.nextRequestId++;
                shared.active.add(id);
                logInternal(
                    ApiVerboseArea.Requests,
                    `startRequest: id=${id}, active.size=${shared.active.size}`
                );
                return id;
            }

            function endRequest(id: number) {
                logInternal(
                    ApiVerboseArea.Requests,
                    `endRequest: id=${id}, active.size=${shared.active.size}`
                );
                if (!shared.active.delete(id)) {
                    logInternal(
                        ApiVerboseArea.Requests,
                        `endRequest: id=${id} was already removed`
                    );
                    return;
                }
                if (shared.active.size === 0) {
                    logInternal(
                        ApiVerboseArea.Requests,
                        'endRequest: resolving all idle resolvers'
                    );
                    shared.idleResolvers.forEach((resolve) => resolve());
                    shared.idleResolvers = [];
                }
            }

            function waitForIdle(): Promise<void> {
                logInternal(
                    ApiVerboseArea.Requests,
                    `waitForIdle called, active.size=${shared.active.size}`
                );
                if (shared.active.size === 0) {
                    logInternal(
                        ApiVerboseArea.Requests,
                        'waitForIdle resolving immediately'
                    );
                    return Promise.resolve();
                }
                logInternal(
                    ApiVerboseArea.Requests,
                    `waitForIdle waiting, active.size=${shared.active.size}`
                );
                return new Promise((resolve) => {
                    shared.idleResolvers.push(resolve);
                    // Failsafe: avoid indefinite hangs if a request leaks
                    (
                        globalThis as unknown as {
                            setTimeout: typeof setTimeout;
                        }
                    ).setTimeout(() => {
                        if (shared.active.size > 0) {
                            logInternal(
                                ApiVerboseArea.Requests,
                                'waitForIdle timeout reached; force-resolving idle and clearing active requests'
                            );
                            shared.active.clear();
                            const resolvers = shared.idleResolvers.splice(0);
                            resolvers.forEach((resolver) => resolver());
                        }
                    }, 5000);
                });
            }

            function installHang(method: HttpMethod, rawPath: string) {
                logUser(`installHang called for ${method} ${rawPath}`);
                mockRoutes.push({
                    method,
                    rawPath,
                    isAbsolute: /^https?:\/\//i.test(rawPath),
                    status: 200,
                    body: new Promise<never>(() => {}),
                    remainingUses: 1,
                });
                logInternal(
                    ApiVerboseArea.Requests,
                    `installHang completed, mockRoutes.length=${mockRoutes.length}`
                );
            }

            async function expectEventTimes(
                eventName: 'call' | 'abort',
                method: HttpMethod,
                path: string,
                times: number,
                timeoutMs = 1000
            ) {
                const bucket = eventName === 'call' ? calls : abortedCalls;
                const wantPath = path.startsWith('/') ? path : `/${path}`;

                type RecordType =
                    | ApiCallRecord
                    | {
                          method: HttpMethod;
                          path: string;
                          timestamp: number;
                      };
                const matches = (record: RecordType) =>
                    record.method === method && record.path === wantPath;
                if (bucket.filter(matches).length >= times) {
                    return;
                }

                const deadline = Date.now() + timeoutMs;
                while (Date.now() < deadline) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await Promise.race([
                            new Promise<void>((resolve) => {
                                const off = on(eventName, () => {
                                    off();
                                    resolve();
                                });
                            }),
                            new Promise<never>((_resolve, reject) => {
                                (
                                    globalThis as unknown as {
                                        setTimeout: typeof setTimeout;
                                    }
                                ).setTimeout(
                                    () =>
                                        reject(
                                            new Error(
                                                `timed out waiting for ${eventName}`
                                            )
                                        ),
                                    deadline - Date.now()
                                );
                            }),
                        ]);
                    } catch {
                        /* swallow */
                    }

                    if (bucket.filter(matches).length >= times) {
                        return;
                    }
                }

                const seen = bucket.filter(matches);
                throw new Error(
                    `Timed out after ${timeoutMs}ms waiting for ${times} '${eventName}' events of ${method} ${path}.\n` +
                        `Saw ${seen.length}:\n${seen
                            .map((record) => JSON.stringify(record))
                            .join('\n')}`
                );
            }

            function matchRoute(method: HttpMethod, fullUrl: string) {
                const baseOrigin =
                    (
                        globalThis as unknown as {
                            location?: { origin?: string };
                        }
                    ).location?.origin ?? 'http://localhost';
                const url = new URL(fullUrl, baseOrigin);
                const actual = url.pathname;
                const actualParams = url.searchParams;

                // Newer mocks should take precedence over older ones.
                for (let i = mockRoutes.length - 1; i >= 0; i -= 1) {
                    const route = mockRoutes[i];
                    if (route.method !== method || route.remainingUses <= 0) {
                        continue;
                    }

                    if (route.isAbsolute) {
                        if (route.rawPath === fullUrl) {
                            return {
                                route,
                                stubPath: new URL(fullUrl).pathname,
                                mount: '',
                            };
                        }
                        continue;
                    }

                    const maybeRaw = route.rawPath;
                    // Try to use axios.getUri if axios is available at runtime; otherwise fall back
                    let stubFull: string;
                    try {
                        // eslint-disable-next-line max-len
                        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                        const maybeAxios: unknown =
                            typeof require !== 'undefined'
                                ? require('axios')
                                : undefined;
                        const ax = maybeAxios as
                            | {
                                  getUri?: (cfg: {
                                      baseURL?: string;
                                      url?: string;
                                  }) => string;
                              }
                            | undefined;
                        if (ax?.getUri) {
                            stubFull = ax.getUri({
                                baseURL: baseOrigin,
                                url: maybeRaw,
                            });
                        } else {
                            stubFull = buildUrlFromConfig({
                                baseURL: baseOrigin,
                                url: maybeRaw,
                            });
                        }
                    } catch {
                        stubFull = buildUrlFromConfig({
                            baseURL: baseOrigin,
                            url: maybeRaw,
                        });
                    }
                    const stubUrl = new URL(stubFull);
                    const stubPath = stubUrl.pathname;

                    if (actual.endsWith(stubPath)) {
                        if (stubUrl.search) {
                            let paramsMatch = true;
                            // Build a case-insensitive map of actual query params
                            const actualLower: Record<string, string[]> = {};
                            for (const [key, value] of Array.from(
                                actualParams.entries()
                            )) {
                                const lk = key.toLowerCase();
                                (actualLower[lk] ||= []).push(value);
                            }
                            for (const [key, value] of Array.from(
                                stubUrl.searchParams.entries()
                            )) {
                                const lk = key.toLowerCase();
                                const vals = actualLower[lk] || [];
                                if (!vals.includes(value)) {
                                    paramsMatch = false;
                                    break;
                                }
                            }
                            if (!paramsMatch) {
                                continue;
                            }
                        }

                        const mount = actual.slice(
                            0,
                            actual.length - stubPath.length
                        );
                        return { route, stubPath, mount };
                    }
                }
                return undefined;
            }

            class FakeXHR {
                readyState = 0;
                status = 0;
                response = '';
                responseText = '';
                onreadystatechange: (() => void) | null = null;
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                onabort: (() => void) | null = null;
                private method!: string;
                private url!: string;
                private timerId?: ReturnType<typeof setTimeout>;
                private headers: Record<string, string> = {};
                private body: unknown;
                private matched?: {
                    route: Route;
                    stubPath: string;
                    mount: string;
                };
                private requestId?: number;
                private aborted = false;

                open(method: string, url: string) {
                    this.method = method.toUpperCase();
                    this.url = url;
                    this.readyState = 1;
                    this.onreadystatechange?.();
                }

                setRequestHeader(key: string, value: string) {
                    this.headers[key] = value;
                }

                send(body?: unknown) {
                    this.body = body;

                    const match = matchRoute(
                        this.method as HttpMethod,
                        this.url
                    );
                    if (!match) {
                        // Record unmatched calls too, for introspection (path/query)
                        try {
                            const urlObj = new URL(this.url);
                            recordCall({
                                method: this.method as HttpMethod,
                                base: urlObj.origin,
                                path: urlObj.pathname.replace(/\/$/, ''),
                                headers: this.headers,
                                body: this.body,
                                timestamp: Date.now(),
                                query: (() => {
                                    const queryParams: Record<
                                        string,
                                        string | string[]
                                    > = {};
                                    urlObj.searchParams.forEach(
                                        (value, key) => {
                                            if (!queryParams[key]) {
                                                queryParams[key] = value;
                                            } else if (
                                                Array.isArray(queryParams[key])
                                            ) {
                                                (
                                                    queryParams[key] as string[]
                                                ).push(value);
                                            } else {
                                                queryParams[key] = [
                                                    queryParams[key] as string,
                                                    value,
                                                ];
                                            }
                                        }
                                    );
                                    return Object.keys(queryParams).length
                                        ? queryParams
                                        : undefined;
                                })(),
                            });
                        } catch {
                            /* ignore parse issues */
                        }
                        this.readyState = FakeXHR.DONE;
                        this.status = 200;
                        const bodyText = JSON.stringify({ data: {} });
                        this.responseText = bodyText;
                        this.response = bodyText;
                        this.onreadystatechange?.();
                        this.onload?.();
                        return;
                    }

                    this.requestId = startRequest();
                    const orig = this.onreadystatechange;
                    this.onreadystatechange = () => {
                        if (this.readyState === FakeXHR.DONE) {
                            endRequest(this.requestId!);
                            this.onreadystatechange = orig;
                        }
                        orig?.();
                    };

                    match.route.remainingUses--;
                    this.matched = match;

                    recordCall({
                        method: this.method as HttpMethod,
                        base: new URL(this.url).origin,
                        path: match.stubPath.replace(/\/$/, ''),
                        headers: this.headers,
                        body: this.body,
                        timestamp: Date.now(),
                        query: (() => {
                            const queryParams: Record<
                                string,
                                string | string[]
                            > = {};
                            new URL(
                                this.url,
                                (
                                    globalThis as unknown as {
                                        location?: { origin?: string };
                                    }
                                ).location?.origin ?? 'http://localhost'
                            ).searchParams.forEach((value, key) => {
                                if (!queryParams[key]) {
                                    queryParams[key] = value;
                                } else if (Array.isArray(queryParams[key])) {
                                    (queryParams[key] as string[]).push(value);
                                } else {
                                    queryParams[key] = [
                                        queryParams[key] as string,
                                        value,
                                    ];
                                }
                            });
                            return Object.keys(queryParams).length
                                ? queryParams
                                : undefined;
                        })(),
                    });

                    if (match.route.status === 0) {
                        this.timerId = (
                            globalThis as unknown as {
                                setTimeout: typeof setTimeout;
                            }
                        ).setTimeout(() => {
                            this.timerId = undefined;
                            this.readyState = FakeXHR.DONE;
                            this.status = 0;
                            this.onreadystatechange?.();
                            this.onerror?.();
                        }, 0);
                        return;
                    }

                    const finish = (responseBody: unknown) => {
                        if (this.aborted) {
                            return;
                        }
                        this.timerId = (
                            globalThis as unknown as {
                                setTimeout: typeof setTimeout;
                            }
                        ).setTimeout(() => {
                            this.timerId = undefined;
                            this.readyState = FakeXHR.DONE;
                            this.status = match.route.status;
                            const txt = JSON.stringify(responseBody);
                            this.responseText = txt;
                            this.response = txt;
                            this.onreadystatechange?.();
                            this.onload?.();
                        }, 0);
                    };

                    if (match.route.body instanceof Promise) {
                        (match.route.body as Promise<unknown>)
                            .then((resolved) => finish(resolved))
                            .catch(() => {
                                if (this.aborted) {
                                    return;
                                }
                                this.timerId = (
                                    globalThis as unknown as {
                                        setTimeout: typeof setTimeout;
                                    }
                                ).setTimeout(() => {
                                    this.readyState = FakeXHR.DONE;
                                    this.status = 0;
                                    this.onreadystatechange?.();
                                    this.onerror?.();
                                }, 0);
                            });
                    } else {
                        finish(match.route.body);
                    }
                }

                abort() {
                    logInternal(
                        ApiVerboseArea.Requests,
                        `XHR abort called for ${this.method} ${this.url}`
                    );
                    logInternal(
                        ApiVerboseArea.Requests,
                        'matched:',
                        this.matched
                    );
                    this.aborted = true;
                    if (this.timerId != null) {
                        (
                            globalThis as unknown as {
                                clearTimeout: typeof clearTimeout;
                            }
                        ).clearTimeout(this.timerId);
                        this.timerId = undefined;
                    }
                    const stubPath =
                        this.matched?.stubPath || new URL(this.url).pathname;
                    logUser(
                        `Recording abort with path: ${stubPath.replace(/\/$/, '')}`
                    );
                    recordAbort({
                        method: this.method as HttpMethod,
                        path: stubPath.replace(/\/$/, ''),
                        timestamp: Date.now(),
                    });
                    logInternal(
                        ApiVerboseArea.Requests,
                        'Current abortedCalls:',
                        abortedCalls
                    );
                    this.readyState = 4;
                    this.status = 0;
                    this.onreadystatechange?.();
                    this.onabort?.();
                    this.onerror?.();
                }

                static UNSENT = 0;
                static OPENED = 1;
                static HEADERS_RECEIVED = 2;
                static LOADING = 3;
                static DONE = 4;
            }

            const gFetch = async (
                input: RequestInfo | URL,
                init?: RequestInit
            ) => {
                const url =
                    typeof input === 'string'
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url;
                const method = (
                    init?.method || 'GET'
                ).toUpperCase() as HttpMethod;
                const match = matchRoute(method, url);
                const ResponseCtor = (
                    globalThis as unknown as { Response?: typeof Response }
                ).Response;
                const makeResponse = (
                    bodyText: string,
                    status: number,
                    headers?: Record<string, string>
                ) =>
                    ResponseCtor
                        ? new ResponseCtor(bodyText, { status, headers })
                        : ({
                              ok: status >= 200 && status < 300,
                              status,
                              json: async () => JSON.parse(bodyText),
                              text: async () => bodyText,
                          } as unknown as Response);

                if (!match) {
                    // Record unmatched calls as well, so tests can assert query/path
                    try {
                        const urlObj = new URL(url);
                        recordCall({
                            method,
                            base: urlObj.origin,
                            path: urlObj.pathname.replace(/\/$/, ''),
                            headers:
                                init?.headers instanceof Headers
                                    ? (() => {
                                          const obj: Record<string, string> =
                                              {};
                                          (init.headers as Headers).forEach(
                                              (value, key) => {
                                                  obj[key] = String(value);
                                              }
                                          );
                                          return obj;
                                      })()
                                    : Array.isArray(init?.headers)
                                      ? Object.fromEntries(init.headers)
                                      : (init?.headers as Record<
                                            string,
                                            string
                                        >) || {},
                            body: init?.body,
                            timestamp: Date.now(),
                            query: (() => {
                                const queryParams: Record<
                                    string,
                                    string | string[]
                                > = {};
                                urlObj.searchParams.forEach((value, key) => {
                                    if (!queryParams[key]) {
                                        queryParams[key] = value;
                                    } else if (
                                        Array.isArray(queryParams[key])
                                    ) {
                                        (queryParams[key] as string[]).push(
                                            value
                                        );
                                    } else {
                                        queryParams[key] = [
                                            queryParams[key] as string,
                                            value,
                                        ];
                                    }
                                });
                                return Object.keys(queryParams).length
                                    ? queryParams
                                    : undefined;
                            })(),
                        });
                    } catch {
                        /* ignore */
                    }
                    return Promise.resolve(
                        makeResponse(JSON.stringify({ data: {} }), 200, {
                            'Content-Type': 'application/json',
                        })
                    );
                }

                match.route.remainingUses--;
                const requestId = startRequest();
                recordCall({
                    method,
                    base: new URL(url).origin,
                    path: match.stubPath.replace(/\/$/, ''),
                    headers:
                        init?.headers instanceof Headers
                            ? (() => {
                                  const obj: Record<string, string> = {};
                                  (init.headers as Headers).forEach(
                                      (value, key) => {
                                          obj[key] = String(value);
                                      }
                                  );
                                  return obj;
                              })()
                            : Array.isArray(init?.headers)
                              ? Object.fromEntries(init.headers)
                              : (init?.headers as Record<string, string>) || {},
                    body: init?.body,
                    timestamp: Date.now(),
                    query: (() => {
                        const queryParams: Record<string, string | string[]> =
                            {};
                        new URL(
                            url,
                            (
                                globalThis as unknown as {
                                    location?: { origin?: string };
                                }
                            ).location?.origin ?? 'http://localhost'
                        ).searchParams.forEach((value, key) => {
                            if (!queryParams[key]) {
                                queryParams[key] = value;
                            } else if (Array.isArray(queryParams[key])) {
                                (queryParams[key] as string[]).push(value);
                            } else {
                                queryParams[key] = [
                                    queryParams[key] as string,
                                    value,
                                ];
                            }
                        });
                        return Object.keys(queryParams).length
                            ? queryParams
                            : undefined;
                    })(),
                });

                logUser(
                    `Mock found for ${method} ${url} -> ${match.route.rawPath}`
                );

                if (match.route.status === 0) {
                    endRequest(requestId);
                    return Promise.reject(new Error('Network Error'));
                }

                if (!(match.route.body instanceof Promise)) {
                    const bodyText = JSON.stringify(match.route.body);
                    endRequest(requestId);
                    return Promise.resolve(
                        makeResponse(bodyText, match.route.status, {
                            'Content-Type': 'application/json',
                        })
                    );
                }

                return new Promise<Response>((resolve, reject) => {
                    let tid: ReturnType<typeof setTimeout>;
                    let aborted = false;
                    const signal = init?.signal;

                    const onAbort = () => {
                        logInternal(
                            ApiVerboseArea.Requests,
                            `Fetch abort called for ${method} ${url}`
                        );
                        logInternal(ApiVerboseArea.Requests, 'match:', match);
                        if (aborted) {
                            return;
                        }
                        aborted = true;
                        clearTimeout(tid);
                        const abortPath = match.stubPath.replace(/\/$/, '');
                        logUser(
                            `Recording fetch abort with path: ${abortPath}`
                        );
                        recordAbort({
                            method,
                            path: abortPath,
                            timestamp: Date.now(),
                        });
                        logInternal(
                            ApiVerboseArea.Requests,
                            'Current abortedCalls:',
                            abortedCalls
                        );
                        endRequest(requestId);
                        const err = new Error('Aborted');
                        (err as { name?: string }).name = 'AbortError';
                        reject(err);
                    };

                    if (signal) {
                        signal.addEventListener('abort', onAbort);
                        if (signal.aborted) {
                            onAbort();
                            return;
                        }
                    }

                    const sendResponse = (responseBody: unknown) => {
                        if (aborted) {
                            return;
                        }
                        tid = (
                            globalThis as unknown as {
                                setTimeout: typeof setTimeout;
                            }
                        ).setTimeout(() => {
                            if (aborted) {
                                return;
                            }
                            const bodyText = JSON.stringify(responseBody);
                            resolve(
                                makeResponse(bodyText, match.route.status, {
                                    'Content-Type': 'application/json',
                                })
                            );
                            signal?.removeEventListener('abort', onAbort);
                        }, 0);
                    };

                    if (match.route.body instanceof Promise) {
                        (match.route.body as Promise<unknown>)
                            .then((resolved) => sendResponse(resolved))
                            .catch(() => {
                                if (aborted) {
                                    return;
                                }
                                reject(new Error('Network Error'));
                            });
                    }
                }).finally(() => {
                    endRequest(requestId);
                });
            };

            (globalThis as unknown as { fetch: typeof fetch }).fetch =
                gFetch as unknown as typeof fetch;

            // Force axios (if available) to use
            // fetch/XHR adapter so our mocks intercept in Node/Jest
            try {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                const maybeAxios: unknown =
                    typeof require !== 'undefined'
                        ? require('axios')
                        : undefined;
                // Support both CJS and ESM default export shapes
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const axiosLocal: any | undefined =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (maybeAxios as any)?.defaults
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (maybeAxios as any)
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (maybeAxios as any)?.default?.defaults
                          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (maybeAxios as any).default
                          : undefined;
                // Generic adapter that drives requests through gFetch,
                // independent of the specific axios module instance
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const makeAdapter = () => async (config: any) => {
                    const url: string = (() => {
                        if (
                            typeof config.url === 'string' &&
                            /^https?:\/\//i.test(config.url)
                        ) {
                            return config.url as string;
                        }
                        return buildUrlFromConfig({
                            baseURL: config.baseURL,
                            url: config.url,
                        });
                    })();
                    const method = (config.method || 'GET').toUpperCase();
                    const headers = config.headers || {};
                    const body = config.data;
                    try {
                        // Wire axios cancellation into fetch via AbortController
                        // Prefer config.signal (axios v1), fallback to legacy cancelToken
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const controller: AbortController | undefined = (():
                            | AbortController
                            | undefined => {
                            // If neither signal nor cancelToken provided,
                            // skip controller to avoid unnecessary listeners
                            if (!config.signal && !config.cancelToken) {
                                return undefined;
                            }
                            const ctrl = new AbortController();
                            const externalSignal: AbortSignal | undefined =
                                config.signal;
                            if (externalSignal) {
                                if (externalSignal.aborted) {
                                    try {
                                        ctrl.abort();
                                    } catch {
                                        /* ignore */
                                    }
                                } else {
                                    externalSignal.addEventListener(
                                        'abort',
                                        () => {
                                            try {
                                                ctrl.abort();
                                            } catch {
                                                /* ignore */
                                            }
                                        }
                                    );
                                }
                            }
                            // axios < v1 CancelToken support
                            const { cancelToken } = config;
                            if (
                                cancelToken &&
                                cancelToken.promise &&
                                typeof cancelToken.promise.then === 'function'
                            ) {
                                cancelToken.promise
                                    .then(() => {
                                        try {
                                            ctrl.abort();
                                        } catch {
                                            /* ignore */
                                        }
                                    })
                                    .catch(() => {
                                        /* ignore */
                                    });
                            }
                            return ctrl;
                        })();

                        const res = await gFetch(url, {
                            method,
                            headers,
                            body,
                            // Only pass a signal if we created a controller;
                            // avoids forcing fetch polyfills to require AbortController
                            ...(controller
                                ? { signal: controller.signal }
                                : {}),
                        });
                        const text = await res.text();
                        const data = (() => {
                            try {
                                return JSON.parse(text);
                            } catch {
                                return text;
                            }
                        })();
                        if (res.status < 200 || res.status >= 300) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const err: any = new Error(
                                `Request failed with status code ${res.status}`
                            );
                            err.response = {
                                data,
                                status: res.status,
                                statusText: String(res.status),
                                headers: {},
                                config,
                            };
                            err.request = { status: res.status };
                            throw err;
                        }
                        return {
                            data,
                            status: res.status,
                            statusText: String(res.status),
                            headers: {},
                            config,
                            request: { status: res.status },
                        };
                    } catch (error) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        if (!(error as any).response) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const err: any =
                                error instanceof Error
                                    ? error
                                    : new Error('Network Error');
                            err.request = { status: 0 };
                            throw err;
                        }
                        throw error;
                    }
                };

                // Helper to patch any axios-like candidate in-place
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const patchAxiosLike = (candidate: any) => {
                    try {
                        if (!candidate || !candidate.defaults) {
                            logInternal(
                                ApiVerboseArea.AxiosPatch,
                                'patchAxiosLike: skipped (no defaults)'
                            );
                            return false;
                        }
                        logInternal(
                            ApiVerboseArea.AxiosPatch,
                            'patchAxiosLike: candidate defaults found',
                            {
                                hasAdapter: !!candidate.defaults.adapter,
                                adapterType: typeof candidate.defaults.adapter,
                                hasRequest: !!candidate.request,
                            }
                        );
                        if (originalAxiosAdapter == null) {
                            originalAxiosAdapter = candidate.defaults.adapter;
                            logInternal(
                                ApiVerboseArea.AxiosPatch,
                                'patchAxiosLike: captured original adapter'
                            );
                        }
                        // eslint-disable-next-line no-param-reassign
                        candidate.defaults.adapter = makeAdapter();
                        logInternal(
                            ApiVerboseArea.AxiosPatch,
                            'patchAxiosLike: assigned test adapter'
                        );
                        try {
                            if (!originalAxiosRequest && candidate.request) {
                                originalAxiosRequest = candidate.request;
                                // eslint-disable-next-line no-param-reassign
                                candidate.request = (config: unknown) =>
                                    (
                                        makeAdapter() as unknown as (
                                            cfg: unknown
                                        ) => Promise<unknown>
                                    )(config);
                                logInternal(
                                    ApiVerboseArea.AxiosPatch,
                                    'patchAxiosLike: replaced request()'
                                );
                            }
                        } catch {
                            /* ignore */
                        }
                        return true;
                    } catch {
                        logInternal(
                            ApiVerboseArea.AxiosPatch,
                            'patchAxiosLike: error while patching'
                        );
                        return false;
                    }
                };

                if (axiosLocal?.defaults) {
                    patchAxiosLike(axiosLocal);
                }

                // Best-effort: patch any other loaded axios modules in the require cache
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let cache: any | undefined;
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const Module = require('module');
                        cache =
                            (typeof require !== 'undefined' &&
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (require as any).cache) ||
                            // eslint-disable-next-line max-len
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
                            (Module as any)?._cache;
                    } catch {
                        cache =
                            (typeof require !== 'undefined' &&
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (require as any).cache) ||
                            undefined;
                    }
                    if (cache) {
                        // eslint-disable-next-line guard-for-in, no-restricted-syntax
                        for (const key in cache) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const exp: any = cache[key]?.exports;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const candidates: any[] = [];
                            if (exp?.defaults) {
                                candidates.push(exp);
                            }
                            if (exp?.default?.defaults) {
                                candidates.push(exp.default);
                            }
                            // eslint-disable-next-line no-restricted-syntax
                            for (const candidate of candidates) {
                                const patched = patchAxiosLike(candidate);
                                logInternal(
                                    ApiVerboseArea.AxiosPatch,
                                    'cache-scan: processed',
                                    key,
                                    { patched }
                                );
                            }
                        }
                    }
                } catch {
                    /* ignore cache scan */
                }

                // Jest-specific: scan registered virtual mocks and force-instantiate
                // them so we can patch their exports as axios-like candidates.
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let jestGlobal: any = (globalThis as unknown as any).jest;
                    if (!jestGlobal) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            const j = require('@jest/globals');
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            jestGlobal =
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (j && (j as any).jest) ||
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (j as any)?.default?.jest;
                        } catch {
                            /* ignore */
                        }
                    }
                    logInternal(
                        ApiVerboseArea.JestMocks,
                        'jest-global-detect',
                        {
                            present: !!jestGlobal,
                            type: typeof jestGlobal,
                            hasRequireMock:
                                jestGlobal &&
                                typeof jestGlobal.requireMock === 'function',
                            keys: (() => {
                                try {
                                    return Object.keys(jestGlobal || {}).slice(
                                        0,
                                        10
                                    );
                                } catch {
                                    return [] as string[];
                                }
                            })(),
                        }
                    );
                    if (
                        jestGlobal &&
                        typeof jestGlobal.requireMock === 'function'
                    ) {
                        // Collect possible factory maps from various Jest internals
                        // across versions. Fall back to scanning any Map-like fields.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const candidateFactoryMaps: any[] = [];
                        const direct = jestGlobal._mockFactories;
                        if (direct) {
                            candidateFactoryMaps.push(direct);
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const reg: any = jestGlobal._moduleMockRegistry;
                        if (reg) {
                            if (reg._mockFactories) {
                                candidateFactoryMaps.push(reg._mockFactories);
                            }
                            if (reg._rawModuleFactories) {
                                candidateFactoryMaps.push(
                                    reg._rawModuleFactories
                                );
                            }
                            if (reg._factories) {
                                candidateFactoryMaps.push(reg._factories);
                            }
                        }
                        // Heuristic: scan all jestGlobal props that look Map-like
                        for (const key of Object.keys(jestGlobal)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const maybeMapLike: any =
                                jestGlobal[key as keyof typeof jestGlobal];
                            const looksMapLike =
                                maybeMapLike &&
                                (typeof maybeMapLike.forEach === 'function' ||
                                    typeof maybeMapLike.keys === 'function');
                            if (
                                looksMapLike &&
                                candidateFactoryMaps.indexOf(maybeMapLike) ===
                                    -1
                            ) {
                                candidateFactoryMaps.push(maybeMapLike);
                            }
                        }

                        const seen = new Set<string>();
                        const WRAPPED = Symbol.for('test-kit.api.wrapFactory');
                        for (const factories of candidateFactoryMaps) {
                            try {
                                const names: string[] = [];
                                try {
                                    const objectKeys = Object.keys(
                                        factories || {}
                                    );
                                    logInternal(
                                        ApiVerboseArea.JestMocks,
                                        'jest-mocks: factory map keys sample',
                                        {
                                            sample: objectKeys.slice(0, 5),
                                            length: objectKeys.length,
                                        }
                                    );
                                    // Plain-object style registry: treat
                                    // own enumerable keys as module names
                                    for (const keyName of objectKeys) {
                                        const candidateVal: unknown =
                                            // eslint-disable-next-line max-len
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            (factories as any)[keyName];
                                        const isFactoryLike =
                                            typeof candidateVal ===
                                                'function' ||
                                            (candidateVal &&
                                                typeof candidateVal ===
                                                    'object');
                                        if (isFactoryLike) {
                                            names.push(keyName);
                                        }
                                    }
                                } catch {
                                    /* ignore */
                                }
                                if (typeof factories.keys === 'function') {
                                    try {
                                        for (const name of factories.keys()) {
                                            if (typeof name === 'string') {
                                                names.push(name);
                                            }
                                        }
                                    } catch {
                                        /* ignore */
                                    }
                                }
                                if (typeof factories.forEach === 'function') {
                                    try {
                                        factories.forEach(
                                            (_value: unknown, key: unknown) => {
                                                if (typeof key === 'string') {
                                                    names.push(key);
                                                }
                                            }
                                        );
                                    } catch {
                                        /* ignore */
                                    }
                                }
                                logInternal(
                                    ApiVerboseArea.JestMocks,
                                    'jest-mocks: discovered factories',
                                    {
                                        count: names.length,
                                    }
                                );
                                for (const name of names) {
                                    try {
                                        if (
                                            typeof factories.get ===
                                                'function' &&
                                            typeof factories.set === 'function'
                                        ) {
                                            const existing =
                                                factories.get(name);
                                            if (
                                                typeof existing ===
                                                    'function' &&
                                                // eslint-disable-next-line max-len
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                !(existing as any)[WRAPPED]
                                            ) {
                                                const originalFactory =
                                                    existing as unknown as (
                                                        ...args: unknown[]
                                                    ) => unknown;
                                                const wrapped =
                                                    function wrappedFactory(
                                                        this: unknown,
                                                        ...args: unknown[]
                                                    ) {
                                                        const exp =
                                                            originalFactory.apply(
                                                                this,
                                                                args
                                                            );
                                                        try {
                                                            const expWithDefaults =
                                                                typeof exp ===
                                                                    'object' &&
                                                                exp !==
                                                                    undefined
                                                                    ? (exp as {
                                                                          defaults?: unknown;
                                                                          default?: {
                                                                              defaults?: unknown;
                                                                          };
                                                                      })
                                                                    : undefined;
                                                            if (
                                                                expWithDefaults?.defaults !==
                                                                    undefined ||
                                                                expWithDefaults
                                                                    ?.default
                                                                    ?.defaults !==
                                                                    undefined
                                                            ) {
                                                                const expWithDefaults =
                                                                    exp as {
                                                                        defaults?: unknown;
                                                                        default?: {
                                                                            defaults?: unknown;
                                                                        };
                                                                    };
                                                                const cand =
                                                                    expWithDefaults.defaults !==
                                                                    undefined
                                                                        ? expWithDefaults
                                                                        : expWithDefaults.default;
                                                                patchAxiosLike(
                                                                    cand
                                                                );
                                                                logInternal(
                                                                    ApiVerboseArea.JestMocks,
                                                                    'jest-mocks: patched export from wrapped factory',
                                                                    name
                                                                );
                                                            }
                                                        } catch {
                                                            /* ignore */
                                                        }
                                                        return exp;
                                                    } as unknown as typeof existing;
                                                // eslint-disable-next-line max-len
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                (wrapped as any)[WRAPPED] =
                                                    true;
                                                factories.set(name, wrapped);
                                                logInternal(
                                                    ApiVerboseArea.JestMocks,
                                                    'jest-mocks: wrapped',
                                                    name
                                                );
                                            }
                                        }
                                    } catch {
                                        /* ignore per-factory wrap */
                                    }
                                    if (seen.has(name)) {
                                        continue;
                                    }
                                    seen.add(name);
                                    try {
                                        const exp =
                                            jestGlobal.requireMock(name);
                                        const cand = exp?.defaults
                                            ? exp
                                            : exp?.default?.defaults
                                              ? exp.default
                                              : undefined;
                                        if (cand) {
                                            // Patch already-instantiated mock export
                                            patchAxiosLike(cand);
                                            logInternal(
                                                ApiVerboseArea.JestMocks,
                                                'jest-mocks: patched export',
                                                name
                                            );
                                        }
                                    } catch {
                                        /* ignore per-mock errors */
                                    }
                                }
                            } catch {
                                /* ignore this factory map */
                            }
                        }
                    }
                } catch {
                    /* ignore jest factory scan */
                }

                // Also patch Module.prototype.require to catch future axios requires
                try {
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                    const Module = require('module');
                    const proto = (
                        Module as {
                            prototype?: {
                                require?: unknown;
                            };
                        }
                    ).prototype;
                    if (
                        proto &&
                        typeof proto.require === 'function' &&
                        !originalModuleRequire
                    ) {
                        originalModuleRequire = proto.require;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any, func-names
                        proto.require = function (
                            this: unknown,
                            request: string,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ...args: any[]
                        ) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const exp: any = originalModuleRequire.apply(this, [
                                request,
                                ...args,
                            ]);
                            try {
                                // Patch axios explicitly, but also any module that looks axios-like
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const candidate: any | undefined =
                                    request === 'axios'
                                        ? exp?.defaults
                                            ? exp
                                            : exp?.default?.defaults
                                              ? exp.default
                                              : undefined
                                        : exp?.defaults
                                          ? exp
                                          : exp?.default?.defaults
                                            ? exp.default
                                            : undefined;
                                if (candidate) {
                                    const patched = patchAxiosLike(candidate);
                                    logInternal(
                                        ApiVerboseArea.ModuleHook,
                                        'Module.require: processed',
                                        request,
                                        { patched }
                                    );
                                }
                            } catch {
                                /* ignore */
                            }
                            return exp;
                        } as typeof proto.require;
                    }
                } catch {
                    /* ignore intercept setup 2 */
                }

                // Patch Module._load as well to catch late axios loads in Jest/runtime
                try {
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                    const Module = require('module');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (
                        Module &&
                        typeof (Module as { _load?: unknown })._load ===
                            'function' &&
                        !originalModuleLoad
                    ) {
                        type ModuleWithLoad = {
                            _load: (
                                request: string,
                                parent: NodeModule | null,
                                isMain: boolean
                            ) => unknown;
                        };
                        originalModuleLoad = (Module as ModuleWithLoad)._load;
                        // eslint-disable-next-line func-names, no-underscore-dangle
                        (Module as ModuleWithLoad)._load = function (
                            request: string,
                            // eslint-disable-next-line max-len
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
                            _parent: any,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            _isMain: boolean
                        ) {
                            // eslint-disable-next-line max-len
                            // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-explicit-any
                            const exp: any = originalModuleLoad.apply(
                                this,
                                // eslint-disable-next-line prefer-rest-params
                                arguments as unknown as [
                                    string,
                                    unknown,
                                    boolean,
                                ]
                            );
                            try {
                                // Patch axios explicitly, but also any module that looks axios-like
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const candidate: any | undefined =
                                    request === 'axios'
                                        ? exp?.defaults
                                            ? exp
                                            : exp?.default?.defaults
                                              ? exp.default
                                              : undefined
                                        : exp?.defaults
                                          ? exp
                                          : exp?.default?.defaults
                                            ? exp.default
                                            : undefined;
                                if (candidate) {
                                    const patched = patchAxiosLike(candidate);
                                    logInternal(
                                        ApiVerboseArea.ModuleHook,
                                        'Module._load: processed',
                                        request,
                                        { patched }
                                    );
                                }
                            } catch {
                                /* ignore */
                            }
                            return exp;
                        };
                    }
                } catch {
                    /* ignore intercept setup 3 */
                }
            } catch {
                // axios not installed; no-op. Fetch/XHR interception still works.
            }

            // Override XMLHttpRequest
            (
                globalThis as unknown as {
                    XMLHttpRequest: typeof XMLHttpRequest;
                }
            ).XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;

            function install(
                method: HttpMethod,
                rawPath: string,
                body: unknown,
                status = 200,
                repeat = 1
            ) {
                logUser(`Installing mock for ${method} ${rawPath}`);
                mockRoutes.push({
                    method,
                    rawPath,
                    isAbsolute: /^https?:\/\//i.test(rawPath),
                    status,
                    body,
                    remainingUses: repeat,
                });
            }

            const onGet = (
                path: string,
                body: unknown,
                status?: number,
                repeat?: number
            ) => install('GET', path, body, status ?? 200, repeat ?? 1);
            const onPost = (
                path: string,
                body: unknown,
                status?: number,
                repeat?: number
            ) => install('POST', path, body, status ?? 200, repeat ?? 1);
            const onPut = (
                path: string,
                body: unknown,
                status?: number,
                repeat?: number
            ) => install('PUT', path, body, status ?? 200, repeat ?? 1);
            const onDelete = (
                path: string,
                body: unknown,
                status?: number,
                repeat?: number
            ) => install('DELETE', path, body, status ?? 200, repeat ?? 1);

            const chaos = {
                rateLimit: (path: string) =>
                    onGet(path, { message: 'Too many requests' }, 429),
                serverError: (path: string) =>
                    onGet(path, { message: 'Server error' }, 500),
                timeout: (path: string) =>
                    onGet(path, { message: 'Request timeout' }, 408),
                networkError: (path: string) => {
                    mockRoutes.push({
                        method: 'GET',
                        rawPath: path,
                        isAbsolute: /^https?:\/\//i.test(path),
                        status: 0,
                        body: null,
                        remainingUses: 1,
                    });
                },
            };

            const getCalls = (method?: HttpMethod, path?: string) => {
                const norm = path
                    ? path.startsWith('/')
                        ? path
                        : `/${path}`
                    : undefined;
                return calls.filter((call) => {
                    if (method && call.method !== method) {
                        return false;
                    }
                    if (!norm) {
                        return true;
                    }
                    return call.path === norm || call.path.endsWith(norm);
                });
            };

            const expectCalledTimes = (
                method: HttpMethod,
                path: string,
                times: number
            ) => expectEventTimes('call', method, path, times);
            const expectAbortedTimes = (
                method: HttpMethod,
                path: string,
                times: number
            ) => expectEventTimes('abort', method, path, times);

            const clear = () => {
                calls.length = 0;
                mockRoutes.length = 0;
                abortedCalls.length = 0;
                shared.nextRequestId = 1;
                if (shared.active.size > 0) {
                    shared.active.clear();
                    const resolvers = shared.idleResolvers.splice(0);
                    resolvers.forEach((resolver) => resolver());
                }
            };

            const getAbortedCalls = () => abortedCalls;

            const expectNoPending = async () => {
                await waitForIdle();
                const pending = mockRoutes.filter(
                    (route) => route.remainingUses > 0
                );
                if (pending.length) {
                    throw new Error(
                        `Mocks never called: ${pending
                            .map((route) => `${route.method} ${route.rawPath}`)
                            .join(', ')}`
                    );
                }
            };

            return {
                onGet,
                onPost,
                onPut,
                onDelete,
                onGetHang: (path: string) => installHang('GET', path),
                chaos,
                getCalls,
                expectCalledTimes,
                clear,
                expectNoPending,
                getAbortedCalls,
                expectAbortedTimes,
                waitForIdle,
            };
        },
        teardown() {
            (
                globalThis as unknown as {
                    XMLHttpRequest: typeof XMLHttpRequest;
                }
            ).XMLHttpRequest = originalXHR;
            (globalThis as unknown as { fetch: typeof fetch }).fetch =
                originalFetch;
            // Restore axios adapter env selection
            const proc = (
                globalThis as unknown as {
                    process?: { env?: Record<string, string | undefined> };
                }
            ).process;
            if (proc?.env) {
                if (originalAxiosAdapterEnv === undefined) {
                    delete proc.env.AXIOS_HTTP_ADAPTER;
                } else {
                    proc.env.AXIOS_HTTP_ADAPTER = originalAxiosAdapterEnv;
                }
            }
            // Restore Module.prototype.require if we patched it
            try {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                const Module = require('module');
                if (originalModuleRequire && Module?.prototype?.require) {
                    Module.prototype.require = originalModuleRequire;
                    originalModuleRequire = undefined;
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (originalModuleLoad && (Module as any)?._load) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (Module as any)._load = originalModuleLoad;
                    originalModuleLoad = undefined;
                }
            } catch {
                /* ignore */
            }
            // Restore axios adapter only if axios is available
            try {
                // eslint-disable-next-line max-len
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                const maybeAxios: unknown =
                    typeof require !== 'undefined'
                        ? require('axios')
                        : undefined;
                // Support both CJS and ESM default export shapes
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const axiosLocal: any | undefined =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (maybeAxios as any)?.defaults
                        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (maybeAxios as any)
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (maybeAxios as any)?.default?.defaults
                          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (maybeAxios as any).default
                          : undefined;
                if (axiosLocal?.defaults) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (axiosLocal as any).defaults.adapter = originalAxiosAdapter;
                    if (originalAxiosRequest) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (axiosLocal as any).request = originalAxiosRequest;
                        originalAxiosRequest = undefined;
                    }
                }
            } catch {
                // ignore
            }
        },
    });
};
