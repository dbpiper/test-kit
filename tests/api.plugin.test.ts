/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    describe,
    it,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals';
import axios from 'axios';

import { apiPlugin } from '../src/plugins/api';

describe('apiPlugin (integration style)', () => {
    let api: ReturnType<ReturnType<typeof apiPlugin>['setup']>;
    const plugin = apiPlugin();

    beforeEach(() => {
        // Enable verbose debug logs inside the plugin for these tests
        process.env.TEST_KIT_API_DEBUG = 'true';
        api = plugin.setup({} as any);
        api.clear();
    });

    afterEach(() => {
        plugin.teardown?.({} as any);
        delete process.env.TEST_KIT_API_DEBUG;
    });

    it('records calls, returns mocked responses, and handles unmatched calls', async () => {
        api.onGet('/api/users', { ok: 1 }, 200);
        api.onGet('/api/projects', { ok: 2 }, 200);

        const resA = await fetch('http://localhost/api/users');
        const jsonA = await (resA as any).json();
        expect(jsonA).toEqual({ ok: 1 });

        const resB = await fetch('http://localhost/api/projects');
        const jsonB = await (resB as any).json();
        expect(jsonB).toEqual({ ok: 2 });

        // Unmatched call returns { data: {} } and still records
        const resU = await fetch('http://localhost/api/unmatched?y=1');
        const jsonU = await (resU as any).json();
        expect(jsonU).toEqual({ data: {} });

        await api.expectCalledTimes('GET', '/api/users', 1);
        await api.expectCalledTimes('GET', '/api/projects', 1);
        const callsA = api.getCalls('GET', '/api/users');
        expect(callsA.length).toBe(1);

        await api.waitForIdle();
        await api.expectNoPending();
    });

    it('records aborts for fetch(), axios with signal, and axios with cancelToken', async () => {
        api.onGetHang('/hang-fetch');
        api.onGetHang('/hang-axios-signal');
        api.onGetHang('/hang-axios-cancel');

        // fetch + AbortController
        const ctrlFetch = new AbortController();
        const pFetch = fetch('http://localhost/hang-fetch', {
            signal: ctrlFetch.signal,
        }).catch(() => undefined);
        ctrlFetch.abort();

        // axios with signal
        const ctrlAxios = new AbortController();
        const pAxiosSignal = axios
            .get('http://localhost/hang-axios-signal', {
                signal: ctrlAxios.signal,
            })
            .catch(() => undefined);
        ctrlAxios.abort();

        // axios with legacy CancelToken
        const { CancelToken }: any = axios as any;
        const source = CancelToken.source();
        const pAxiosCancel = axios
            .get('http://localhost/hang-axios-cancel', {
                cancelToken: source.token,
            })
            .catch(() => undefined);
        source.cancel('test-cancel');

        await Promise.all([pFetch, pAxiosSignal, pAxiosCancel]);

        await api.expectAbortedTimes('GET', '/hang-fetch', 1);
        await api.expectAbortedTimes('GET', '/hang-axios-signal', 1);
        await api.expectAbortedTimes('GET', '/hang-axios-cancel', 1);

        const aborted = api.getAbortedCalls();
        expect(aborted.length).toBeGreaterThanOrEqual(3);

        await api.waitForIdle();
    });

    it('covers absolute/relative matching, XHR behavior, chaos networkError, and pending mocks', async () => {
        // Absolute path match requires exact full URL equality
        api.onGet(
            'http://example.com/api/absolute?a=1&b=2',
            { abs: true },
            200
        );
        const resAbs = await fetch('http://example.com/api/absolute?a=1&b=2');
        const jsonAbs = await (resAbs as any).json();
        expect(jsonAbs).toEqual({ abs: true });

        // Relative with query params (keys case-insensitive, values case-sensitive)
        api.onGet('/api/search?q=one&x=2', { rel: true }, 200);
        const resRel = await fetch('http://localhost/api/search?x=2&q=one');
        const jsonRel = await (resRel as any).json();
        expect(jsonRel).toEqual({ rel: true });

        // Unmatched with array headers path
        await fetch('http://localhost/api/unmatched-headers', {
            headers: [['X-Test', 'y']],
        } as any).then((res) => (res as any).json());

        // XHR unmatched returns { data: {} }
        const xhrUn = new (global as any).XMLHttpRequest();
        const xhrUnPromise = new Promise<{ status: number; text: string }>(
            (resolve) => {
                xhrUn.onload = () =>
                    resolve({ status: xhrUn.status, text: xhrUn.responseText });
            }
        );
        xhrUn.open('GET', 'http://localhost/api/xhr-unmatched');
        xhrUn.send();
        const xhrUnRes = await xhrUnPromise;
        expect(xhrUnRes.status).toBe(200);
        expect(xhrUnRes.text).toBe(JSON.stringify({ data: {} }));

        // XHR hang + abort records abort
        api.onGetHang('/api/xhr-hang');
        const xhr = new (global as any).XMLHttpRequest();
        const xhrPromise = new Promise<void>((resolve) => {
            xhr.onabort = () => resolve();
            xhr.onerror = () => resolve();
        });
        xhr.open('GET', 'http://localhost/api/xhr-hang');
        xhr.send();
        setTimeout(() => xhr.abort(), 0);
        await xhrPromise;
        await api.expectAbortedTimes('GET', '/api/xhr-hang', 1);

        // chaos.networkError -> reject with Network Error
        api.chaos.networkError('/api/network-error');
        await expect(
            fetch('http://localhost/api/network-error')
        ).rejects.toThrow(/Network Error/i);

        // Leave an unused mock to exercise expectNoPending failure path
        api.onGet('/never', { ok: true }, 200);
        await expect(api.expectNoPending()).rejects.toThrow(
            /Mocks never called/
        );

        // getCalls endsWith matching
        const calls = api.getCalls('GET', '/api/xhr-unmatched');
        expect(calls.length).toBeGreaterThanOrEqual(1);

        await api.waitForIdle();
    });

    it('covers chaos responses (rateLimit/serverError/timeout) and axios non-2xx error path', async () => {
        api.chaos.rateLimit('/api/rate-limited');
        api.chaos.serverError('/api/server-error');
        api.chaos.timeout('/api/request-timeout');

        const rl = await fetch('http://localhost/api/rate-limited');
        expect((rl as any).status).toBe(429);
        const se = await fetch('http://localhost/api/server-error');
        expect((se as any).status).toBe(500);
        const to = await fetch('http://localhost/api/request-timeout');
        expect((to as any).status).toBe(408);

        // Reinstall mocks for axios since each mock has repeat=1 by default
        api.onGet('/api/rate-limited', { message: 'Too many requests' }, 429);
        api.onGet('/api/server-error', { message: 'Server error' }, 500);
        api.onGet('/api/request-timeout', { message: 'Request timeout' }, 408);

        // Axios adapter throws for non-2xx
        await expect(
            axios.get('http://localhost/api/rate-limited')
        ).rejects.toMatchObject({
            response: { status: 429 },
        });
        await expect(
            axios.get('http://localhost/api/server-error')
        ).rejects.toMatchObject({
            response: { status: 500 },
        });
        await expect(
            axios.get('http://localhost/api/request-timeout')
        ).rejects.toMatchObject({
            response: { status: 408 },
        });
    });

    it('covers getCalls with method-only and no-args, POST/PUT/DELETE matching, and clear() active branch', async () => {
        // POST/PUT/DELETE with descriptive paths
        api.onPost('/api/widgets', { ok: 'created' }, 201);
        api.onPut('/api/widgets/1', { ok: 'updated' }, 200);
        api.onDelete('/api/widgets/1', { ok: 'deleted' }, 200);

        await fetch('http://localhost/api/widgets', { method: 'POST' });
        await fetch('http://localhost/api/widgets/1', { method: 'PUT' });
        await fetch('http://localhost/api/widgets/1', { method: 'DELETE' });

        // getCalls variations
        expect(api.getCalls('POST').length).toBeGreaterThanOrEqual(1);
        expect(api.getCalls().length).toBeGreaterThanOrEqual(3);
        expect(api.getCalls('POST', '/api/widgets').length).toBe(1);

        // Create active request then clear to exercise branch
        api.onGetHang('/will-hang');
        // Fire and immediately clear (active.size > 0)
        // Ignore rejection from fetch because we are clearing immediately
        // to avoid waiting for completion.
        void fetch('http://localhost/will-hang');
        api.clear();
        await api.expectNoPending();
    });

    it('restores AXIOS_HTTP_ADAPTER env var on teardown when originally set', async () => {
        const prev = process.env.AXIOS_HTTP_ADAPTER;
        process.env.AXIOS_HTTP_ADAPTER = 'fetch';
        // New plugin instance to capture env
        const plg = apiPlugin();
        const inst = plg.setup({} as any);
        inst.clear();
        plg.teardown?.({} as any);
        expect(process.env.AXIOS_HTTP_ADAPTER).toBe('fetch');
        // Restore test env
        if (prev === undefined) {
            delete process.env.AXIOS_HTTP_ADAPTER;
        } else {
            process.env.AXIOS_HTTP_ADAPTER = prev;
        }
    });

    it('covers promise resolve/reject bodies in fetch and XHR, and Module.require patch path', async () => {
        // fetch with Promise.reject body -> rejects with Network Error
        api.onGet(
            '/api/fetch-promise-reject',
            Promise.reject(new Error('x')),
            200
        );
        await expect(
            fetch('http://localhost/api/fetch-promise-reject')
        ).rejects.toThrow(/Network Error/i);

        // fetch with Promise.resolve body -> resolves
        api.onGet('/api/fetch-promise-ok', Promise.resolve({ ok: true }), 200);
        const okRes = await fetch('http://localhost/api/fetch-promise-ok');
        expect(await (okRes as any).json()).toEqual({ ok: true });

        // XHR success
        api.onGet('/api/xhr-ok', { ok: 1 }, 200);
        const xhrOk = new (global as any).XMLHttpRequest();
        const xhrOkPromise = new Promise<{ status: number; text: string }>(
            (resolve) => {
                xhrOk.onload = () =>
                    resolve({ status: xhrOk.status, text: xhrOk.responseText });
            }
        );
        xhrOk.open('GET', 'http://localhost/api/xhr-ok');
        xhrOk.send();
        const ok = await xhrOkPromise;
        expect(ok.status).toBe(200);
        expect(ok.text).toBe(JSON.stringify({ ok: 1 }));

        // XHR promise reject
        api.onGet('/api/xhr-reject', Promise.reject(new Error('y')), 200);
        const xhrBad = new (global as any).XMLHttpRequest();
        const xhrBadPromise = new Promise<number>((resolve) => {
            xhrBad.onerror = () => resolve(xhrBad.status);
        });
        xhrBad.open('GET', 'http://localhost/api/xhr-reject');
        xhrBad.send();
        const badStatus = await xhrBadPromise;
        expect(badStatus).toBe(0);

        // XHR network error
        api.chaos.networkError('/xhr-neterr');
        const xhrNE = new (global as any).XMLHttpRequest();
        const xhrNEPromise = new Promise<number>((resolve) => {
            xhrNE.onerror = () => resolve(xhrNE.status);
        });
        xhrNE.open('GET', 'http://localhost/xhr-neterr');
        xhrNE.send();
        const neStatus = await xhrNEPromise;
        expect(neStatus).toBe(0);

        // Trigger Module.prototype.require patch path
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('axios');
    });

    it('expectCalledTimes timeout path (waits briefly and fails)', async () => {
        // Expect a call that will not happen; default timeout is ~1s
        await expect(api.expectCalledTimes('GET', '/nope', 1)).rejects.toThrow(
            /Timed out/i
        );
    });

    it('axios.request is patched and works via adapter', async () => {
        api.onGet('/api/axios-request', { ok: true }, 200);
        const res = await axios.request({
            method: 'GET',
            baseURL: 'http://localhost',
            url: '/api/axios-request',
        });
        expect(res.data).toEqual({ ok: true });
    });

    it('axios adapter propagates AbortController signal and cancelToken', async () => {
        // signal path
        api.onGetHang('/api/axios-hang-signal');
        const ctrl = new AbortController();
        const p1 = axios
            .get('http://localhost/api/axios-hang-signal', {
                signal: ctrl.signal,
            })
            .catch((err) => err);
        ctrl.abort();
        const e1: any = await p1;
        expect(['AbortError', 'CanceledError']).toContain(e1 && e1.name);

        // cancelToken path
        const { CancelToken }: any = axios as any;
        api.onGetHang('/api/axios-hang-cancel');
        const source = CancelToken.source();
        const p2 = axios
            .get('http://localhost/api/axios-hang-cancel', {
                cancelToken: source.token,
            })
            .catch((err) => err);
        source.cancel('stop');
        const e2: any = await p2;
        expect(e2 && e2.message).toBeDefined();
    });

    it('XHR matched request records headers and body in calls', async () => {
        api.onGet('/api/xhr-with-headers', { ok: 1 }, 200);
        const xhr = new (global as any).XMLHttpRequest();
        const done = new Promise<void>((resolve) => {
            xhr.onload = () => resolve();
        });
        xhr.open('GET', 'http://localhost/api/xhr-with-headers');
        xhr.setRequestHeader('X-Test', '1');
        xhr.send();
        await done;
        const calls = api.getCalls('GET', '/api/xhr-with-headers');
        expect(calls[0].headers['X-Test']).toBe('1');
    });

    it('records query params for unmatched fetch calls (including arrays and case-insensitive keys)', async () => {
        await fetch(
            'http://localhost/api/unmatched-query?one=1&one=2&Two=3'
        ).then((res) => (res as any).json());
        const calls = api.getCalls('GET', '/api/unmatched-query');
        expect(calls.length).toBeGreaterThanOrEqual(1);
        const query = calls[0].query as Record<string, string | string[]>;
        expect(query.one).toEqual(['1', '2']);
        expect((query as any).two || (query as any).Two).toBe('3');
    });

    it('clear resets calls and aborted calls', async () => {
        api.onGetHang('/api/will-abort');
        const ctrl = new AbortController();
        const promise = fetch('http://localhost/api/will-abort', {
            signal: ctrl.signal,
        }).catch(() => undefined);
        ctrl.abort();
        await promise;
        expect(api.getCalls().length).toBeGreaterThan(0);
        expect(api.getAbortedCalls().length).toBeGreaterThan(0);
        api.clear();
        expect(api.getCalls().length).toBe(0);
        expect(api.getAbortedCalls().length).toBe(0);
    });

    it('patches future axios requires via Module.prototype.require (without touching cache)', async () => {
        await new Promise<void>((resolve, reject) => {
            jest.isolateModules(() => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const {
                        apiPlugin: factory,
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                    } = require('../src/plugins/api');
                    const plg = factory();
                    const inst = plg.setup({} as any);
                    inst.onGet('/api/lazy-axios', { ok: true }, 200);
                    // Require axios after setup so the Module.require hook patches it
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
                    const axiosLazy = require('axios');
                    axiosLazy
                        .get('http://localhost/api/lazy-axios')
                        .then((resp: any) => {
                            try {
                                expect(resp.data).toEqual({ ok: true });
                                plg.teardown?.({} as any);
                                resolve();
                            } catch (err) {
                                reject(err as Error);
                            }
                        }, reject)
                        .catch(reject);
                } catch (err) {
                    reject(err as Error);
                }
            });
        });
    });

    it('axios adapter returns raw text for non-JSON responses', async () => {
        api.onGet('/api/plain-text', 'hello-world', 200);
        const res = await axios.get('http://localhost/api/plain-text');
        expect(res.data).toBe('hello-world');
    });

    // TODO: find a way to test this
    it.skip('patches axios-like candidates from require cache when axios lacks defaults', async () => {
        await new Promise<void>((resolve, reject) => {
            jest.isolateModules(() => {
                try {
                    jest.doMock('axios', () => ({}), { virtual: true });

                    const fakeCandidate: any = {
                        defaults: { adapter: undefined },
                        request(cfg: unknown) {
                            return Promise.resolve({ data: 'unpatched', cfg });
                        },
                    };
                    jest.doMock('fake-axios-candidate', () => fakeCandidate, {
                        virtual: true,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const loadedCandidate = require('fake-axios-candidate');
                    // eslint-disable-next-line no-console
                    console.log(
                        '[TEST] loadedCandidate before setup',
                        loadedCandidate
                    );

                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const {
                        apiPlugin: factory,
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                    } = require('../src/plugins/api');
                    const plg = factory();
                    const inst = plg.setup({} as any);
                    inst.onGet('/api/cache-patched', { ok: true }, 200);

                    (loadedCandidate as any).defaults
                        .adapter({
                            method: 'GET',
                            baseURL: 'http://localhost',
                            url: '/api/cache-patched',
                        })
                        .then((resp: any) => {
                            try {
                                expect(resp.data).toEqual({ ok: true });
                                plg.teardown?.({} as any);
                                resolve();
                            } catch (err) {
                                reject(err as Error);
                            }
                        }, reject)
                        .catch(reject);
                } catch (err) {
                    reject(err as Error);
                }
            });
        });
    });

    // TODO: find a way to test this
    it.skip('Module.require path patches late-loaded axios (including request replacement)', async () => {
        await new Promise<void>((resolve, reject) => {
            jest.isolateModules(() => {
                try {
                    jest.doMock(
                        'axios',
                        () => ({
                            defaults: { adapter: undefined },
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            request(_cfg: any) {
                                return Promise.resolve({
                                    data: 'unpatched',
                                });
                            },
                            get(url: string, cfg: any) {
                                return (this as any).request({
                                    method: 'GET',
                                    url,
                                    ...cfg,
                                });
                            },
                        }),
                        { virtual: true }
                    );

                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const {
                        apiPlugin: factory,
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                    } = require('../src/plugins/api');
                    const plg = factory();
                    const inst = plg.setup({} as any);
                    inst.onGet('/api/late-axios', { ok: true }, 200);

                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const axiosLateModule = require('axios');
                    // eslint-disable-next-line no-console
                    console.log(
                        '[TEST] axiosLateModule after setup',
                        axiosLateModule
                    );
                    const candidate = axiosLateModule?.defaults
                        ? axiosLateModule
                        : axiosLateModule?.default?.defaults
                          ? axiosLateModule.default
                          : axiosLateModule;

                    (candidate as any).defaults
                        .adapter({
                            method: 'GET',
                            baseURL: 'http://localhost',
                            url: '/api/late-axios',
                        })
                        .then((resp: any) => {
                            try {
                                expect(resp.data).toEqual({ ok: true });
                                plg.teardown?.({} as any);
                                resolve();
                            } catch (err) {
                                reject(err as Error);
                            }
                        }, reject)
                        .catch(reject);
                } catch (err) {
                    reject(err as Error);
                }
            });
        });
    });
});
