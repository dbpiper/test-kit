/* eslint-disable import/first */
import type { UserEvent } from '@testing-library/user-event';

import type { KitContext } from '../types';
import { definePlugin } from '../helpers/definePlugin';
import { findClickableAncestorWeb } from './helpers/findClickableAncestorWeb';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const expect: any;

export type InteractionsHelpers = {
    clickCell: (label: string | RegExp) => Promise<void>;
    clickButton: (label: string | RegExp) => Promise<void>;
    clickByText: (text: string | RegExp) => Promise<void>;
    clickByTestId: (testId: string) => Promise<void>;
    typeText: (labelOrTestId: string | RegExp, text: string) => Promise<void>;
    selectViaKb: (label: string | RegExp) => Promise<void>;
    hoverElement: (label: string | RegExp) => Promise<void>;
    hoverText: (text: string | RegExp) => Promise<void>;
    clearSelections: () => Promise<void>;
    expectSelected: (label: string | RegExp) => Promise<void>;
    expectNotSelected: (label: string | RegExp) => Promise<void>;
};

export const interactionsPlugin = definePlugin<
    'interactions',
    InteractionsHelpers
>('interactions', {
    key: Symbol('interactions'),
    setup(ctx: KitContext) {
        const resolveWeb = () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const rtl =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-underscore-dangle
                (globalThis as any).__RTL__ ??
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('@testing-library/react');
            return rtl as typeof import('@testing-library/react');
        };
        const resolveScreen = () => resolveWeb().screen;
        const resolveAct = () => resolveWeb().act;
        const isWebUser = (candidate: unknown): candidate is UserEvent =>
            !!candidate &&
            typeof (candidate as { click?: unknown }).click === 'function';
        const maybeGetContainer = (ctx as Record<string, unknown>)
            .getContainer as (() => HTMLElement) | undefined;
        const getContainer = maybeGetContainer ?? (() => document.body);

        const maybeGetCell = (ctx as Record<string, unknown>).getCell as
            | ((label: string | RegExp) => HTMLElement)
            | undefined;
        const getCell =
            maybeGetCell ??
            ((label) =>
                resolveScreen().getByRole('gridcell', {
                    name: label,
                }));

        return {
            async clickCell(label: string | RegExp) {
                const el = resolveScreen().getByRole('gridcell', {
                    name: label,
                });
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.click(el);
                });
            },
            async clickButton(label: string | RegExp) {
                let btn: HTMLElement;
                try {
                    btn = resolveScreen().getByRole('button', {
                        name: label,
                    });
                } catch {
                    // If no role, find by text then walk up to a clickable ancestor
                    const byText = resolveScreen().getByText(label);
                    btn =
                        (findClickableAncestorWeb(byText) as HTMLElement) ??
                        byText;
                }
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.click(btn);
                });
            },
            async clickByText(text: string | RegExp) {
                const byText = resolveScreen().getByText(text);
                const el =
                    (findClickableAncestorWeb(byText) as HTMLElement) ?? byText;
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.click(el);
                });
            },
            async clickByTestId(testId: string) {
                const byTestId = resolveScreen().getByTestId(testId);
                const el =
                    (findClickableAncestorWeb(byTestId) as HTMLElement) ??
                    byTestId;
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.click(el);
                });
            },
            async typeText(labelOrTestId: string | RegExp, text: string) {
                let input: HTMLElement;
                try {
                    input = await resolveScreen().findByLabelText(
                        labelOrTestId as string
                    );
                } catch {
                    input = resolveScreen().getByTestId(
                        labelOrTestId as string
                    );
                }
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.clear(input);
                    await ctx.user.type(input, text);
                });
            },
            async selectViaKb(label: string | RegExp) {
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    const container = getContainer();
                    // Prefer starting from a known focus origin if provided
                    try {
                        container?.focus?.();
                    } catch {
                        // ignore focusing errors
                    }
                    const matches = (el: Element | null): boolean => {
                        if (!el) {
                            return false;
                        }
                        const aria =
                            (el as HTMLElement).getAttribute('aria-label') ??
                            '';
                        const text = (el as HTMLElement).textContent ?? '';
                        if (typeof label === 'string') {
                            return aria === label || text.includes(label);
                        }
                        return label.test(aria) || label.test(text);
                    };
                    // Check current focus first, then advance via Tab
                    for (let i = 0; i < 500; i++) {
                        const active =
                            document.activeElement as HTMLElement | null;
                        if (matches(active)) {
                            await ctx.user.keyboard('{Enter}');
                            return;
                        }
                        await ctx.user.tab();
                    }
                    throw new Error(`could not focus via keyboard: ${label}`);
                });
            },
            async clearSelections() {
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.keyboard('{Escape}');
                });
            },
            async hoverElement(label: string | RegExp) {
                const el = resolveScreen().getByLabelText(label);
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.hover(el);
                });
            },
            async hoverText(text: string | RegExp) {
                const el = resolveScreen().getByText(text);
                await resolveAct()(async () => {
                    if (!isWebUser(ctx.user)) {
                        throw new Error(
                            'test-kit: expected web userEvent instance'
                        );
                    }
                    await ctx.user.hover(el);
                });
            },
            async expectSelected(label: string | RegExp) {
                const el = getCell(label);
                expect(el).toHaveAttribute('aria-selected', 'true');
            },
            async expectNotSelected(label: string | RegExp) {
                const el = getCell(label);
                expect(el).not.toHaveAttribute('aria-selected', 'true');
            },
        };
    },
});
