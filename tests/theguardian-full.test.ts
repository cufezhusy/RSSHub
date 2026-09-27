import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyModulesToNamespaces, type NamespacesType } from '../lib/registry-helpers';
import { route as chinaRoute } from '../lib/routes/theguardian/china';
import { route as editorialRoute } from '../lib/routes/theguardian/editorial';
import { route as fullRoute } from '../lib/routes/theguardian/full';
import type { Data } from '../lib/types';
import cache from '../lib/utils/cache';
import ofetch from '../lib/utils/ofetch';
import parser from '../lib/utils/rss-parser';

vi.mock('../lib/utils/cache', () => ({ default: { tryGet: vi.fn() } }));
vi.mock('../lib/utils/ofetch', () => ({ default: vi.fn() }));
vi.mock('../lib/utils/rss-parser', () => ({ default: { parseURL: vi.fn() } }));

const rootUrl = 'https://www.theguardian.com';

const baseFeed = {
    title: 'The Guardian - feed',
    link: rootUrl,
    description: 'description',
    items: [
        { title: 'Article 1', link: `${rootUrl}/article-1`, content: '<p>Summary 1</p>', pubDate: '2026-01-01T00:00:00.000Z' },
        { title: 'Article 2', link: `${rootUrl}/article-2`, content: '<p>Summary 2</p>', pubDate: '2026-01-02T00:00:00.000Z' },
    ],
};

const fullArticle = (url: string) => `<html><body><div id="maincontent"><p>Full ${url}</p></div></body></html>`;

const invokeFull = (path: string) => fullRoute.handler!({ req: { param: () => path } } as unknown as Context) as Promise<Data>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.tryGet).mockImplementation(async (_key, load) => load());
    vi.mocked(ofetch).mockImplementation(async (url) => fullArticle(String(url)));
    vi.mocked(parser.parseURL).mockResolvedValue(baseFeed as never);
});

describe('The Guardian generic full-text route', () => {
    it('exposes the generic route path under the guardian namespace', () => {
        expect(fullRoute.path).toBe('/full/:path{.+}');
        expect(fullRoute.parameters).toHaveProperty('path');

        const namespaces = {} as NamespacesType;
        applyModulesToNamespaces({ '/theguardian/full.ts': { route: fullRoute } }, namespaces);
        expect(namespaces.theguardian.routes).toHaveProperty('/full/:path{.+}');
    });

    it.each(['football', 'world', 'business', 'technology', 'football/premierleague', 'tone/editorials', 'football/series/thefiver', 'profile/editorial'])('derives the official Guardian RSS URL for /full/%s', async (path) => {
        const feed = await invokeFull(path);

        expect(parser.parseURL).toHaveBeenCalledWith(`${rootUrl}/${path}/rss`);
        expect(feed.link).toBe(`${rootUrl}/${path}`);
        expect(feed.title).toBe(`The Guardian - ${path}`);
        expect(feed.item).toHaveLength(2);
    });

    it('reuses the shared extractor so item descriptions contain the full article', async () => {
        const feed = await invokeFull('football');

        expect(ofetch).toHaveBeenCalledWith(`${rootUrl}/article-1`);
        expect(feed.item![0].description).toContain(`Full ${rootUrl}/article-1`);
        expect(feed.item![0].title).toBe('Article 1');
        expect(feed.item![0].pubDate).toBe('2026-01-01T00:00:00.000Z');
    });

    it('falls back to the official RSS description when full article extraction fails', async () => {
        vi.mocked(ofetch).mockResolvedValue('<html><body><p>No #maincontent here</p></body></html>');

        const feed = await invokeFull('world');

        expect(feed.item).toHaveLength(2);
        expect(feed.item![0].description).toBe('<p>Summary 1</p>');
        expect(feed.item![1].description).toBe('<p>Summary 2</p>');
    });

    it('keeps the feed working when one article cannot be fetched', async () => {
        vi.mocked(ofetch).mockImplementation(async (url) => {
            if (String(url).endsWith('/article-1')) {
                throw new Error('upstream unavailable');
            }
            return fullArticle(String(url));
        });

        const feed = await invokeFull('world');

        expect(feed.item).toHaveLength(2);
        expect(feed.item![0].description).toBe('<p>Summary 1</p>');
        expect(feed.item![1].description).toContain('Full');
    });

    it.each(['https://evil.example.com/foo', '//evil.example.com/foo', 'world'])('never leaves the Guardian hostname for path %s', async (path) => {
        await invokeFull(path);

        const requestedUrl = vi.mocked(parser.parseURL).mock.calls[0][0];
        expect(new URL(requestedUrl).hostname).toBe('www.theguardian.com');
        expect(new URL(requestedUrl).hostname).not.toBe('evil.example.com');
    });
});

describe('The Guardian legacy full-text routes', () => {
    it('keeps /theguardian/china functional', async () => {
        expect(chinaRoute.path).toBe('/china');

        const feed = (await chinaRoute.handler!({} as never)) as Data;

        expect(parser.parseURL).toHaveBeenCalledWith(`${rootUrl}/world/china/rss`);
        expect(feed.link).toBe(`${rootUrl}/world/china`);
        expect(feed.title).toBe('The Guardian - China');
        expect(feed.item![0].description).toContain('Full');
    });

    it('keeps /theguardian/editorial functional', async () => {
        expect(editorialRoute.path).toBe('/editorial');

        const feed = (await editorialRoute.handler!({} as never)) as Data;

        expect(parser.parseURL).toHaveBeenCalledWith(`${rootUrl}/tone/editorials/rss`);
        expect(feed.link).toBe(`${rootUrl}/profile/editorial`);
        expect(feed.title).toBe('The Guardian - Editorial');
        expect(feed.item![0].description).toContain('Full');
    });
});
