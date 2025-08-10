/* eslint-disable no-continue */
import axios from 'axios';

import { definePlugin } from '../helpers/definePlugin';

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

    return definePlugin<'api', ApiHelpers>('api', {
        key: Symbol('api'),
        setup() {
            const { debug = false } = config;

            originalXHR = (
                globalThis as unknown as {
                    XMLHttpRequest: typeof XMLHttpRequest;
                }
            ).XMLHttpRequest;
            originalFetch = (globalThis as unknown as { fetch: typeof fetch })
                .fetch;

            const calls: ApiCallRecord[] = [];
            const abortedCalls: {
                method: HttpMethod;
                path: string;
                timestamp: number;
            }[] = [];
            const mockRoutes: Route[] = [];

            let nextRequestId = 1;
            const active = new Set<number>();
            let idleResolvers: Array<() => void> = [];

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

            function log(...args: unknown[]) {
                if (debug) {
                    // eslint-disable-next-line no-console
                    console.log('[API Plugin]', ...args);
                }
            }

            function recordCall(apiCallRecord: ApiCallRecord) {
                calls.push(apiCallRecord);
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
                const id = nextRequestId++;
                active.add(id);
                log(`startRequest: id=${id}, active.size=${active.size}`);
                return id;
            }

            function endRequest(id: number) {
                log(`endRequest: id=${id}, active.size=${active.size}`);
                if (!active.delete(id)) {
                    log(`endRequest: id=${id} was already removed`);
                    return;
                }
                if (active.size === 0) {
                    log('endRequest: resolving all idle resolvers');
                    idleResolvers.forEach((resolve) => resolve());
                    idleResolvers = [];
                }
            }

            function waitForIdle(): Promise<void> {
                log(`waitForIdle called, active.size=${active.size}`);
                if (active.size === 0) {
                    log('waitForIdle resolving immediately');
                    return Promise.resolve();
                }
                log(`waitForIdle waiting, active.size=${active.size}`);
                return new Promise((resolve) => {
                    idleResolvers.push(resolve);
                });
            }

            function installHang(method: HttpMethod, rawPath: string) {
                log(`installHang called for ${method} ${rawPath}`);
                mockRoutes.push({
                    method,
                    rawPath,
                    isAbsolute: /^https?:\/\//i.test(rawPath),
                    status: 200,
                    body: new Promise<never>(() => {}),
                    remainingUses: 1,
                });
                log(
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
                    const stubFull = axios.getUri({
                        baseURL: baseOrigin,
                        url: maybeRaw,
                    });
                    const stubUrl = new URL(stubFull);
                    const stubPath = stubUrl.pathname;

                    if (actual.endsWith(stubPath)) {
                        if (stubUrl.search) {
                            let paramsMatch = true;
                            for (const [key, value] of Array.from(
                                stubUrl.searchParams.entries()
                            )) {
                                if (!actualParams.getAll(key).includes(value)) {
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
                    log(`XHR abort called for ${this.method} ${this.url}`);
                    log('[API Plugin] matched:', this.matched);
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
                    log(
                        `[API Plugin] Recording abort with path: ${stubPath.replace(
                            /\/$/,
                            ''
                        )}`
                    );
                    recordAbort({
                        method: this.method as HttpMethod,
                        path: stubPath.replace(/\/$/, ''),
                        timestamp: Date.now(),
                    });
                    log('[API Plugin] Current abortedCalls:', abortedCalls);
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

                log(
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
                        log(`Fetch abort called for ${method} ${url}`);
                        log('[API Plugin] match:', match);
                        if (aborted) {
                            return;
                        }
                        aborted = true;
                        clearTimeout(tid);
                        const abortPath = match.stubPath.replace(/\/$/, '');
                        log(
                            `[API Plugin] Recording fetch abort with path: ${abortPath}`
                        );
                        recordAbort({
                            method,
                            path: abortPath,
                            timestamp: Date.now(),
                        });
                        log('[API Plugin] Current abortedCalls:', abortedCalls);
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

            // Force axios to use fetch/XHR adapter so our mocks intercept in Node/Jest
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            originalAxiosAdapter = (axios as any).defaults?.adapter;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (axios as any).defaults = (axios as any).defaults || {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (axios as any).defaults.adapter = async (config: any) => {
                const url = axios.getUri(config);
                const method = (config.method || 'GET').toUpperCase();
                const headers = config.headers || {};
                const body = config.data;
                try {
                    const res = await gFetch(url, { method, headers, body });
                    const text = await res.text();
                    const data = (() => {
                        try {
                            return JSON.parse(text);
                        } catch {
                            return text;
                        }
                    })();
                    // Reject for non-2xx like axios normally does
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
                    // Normalize network errors to include request.status = 0
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
                log(`Installing mock for ${method} ${rawPath}`);
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

            const getCalls = (method?: HttpMethod, path?: string) =>
                calls.filter(
                    (call) =>
                        (!method || call.method === method) &&
                        (!path ||
                            call.path ===
                                (path.startsWith('/') ? path : `/${path}`))
                );

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((axios as any).defaults) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (axios as any).defaults.adapter = originalAxiosAdapter;
            }
        },
    });
};
