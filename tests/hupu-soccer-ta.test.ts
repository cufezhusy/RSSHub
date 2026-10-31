import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyModulesToNamespaces, type NamespacesType } from '../lib/registry-helpers';
import { route as hupuRoute } from '../lib/routes/hupu/index';
import { route as soccerTaRoute } from '../lib/routes/hupu/soccer-ta';
import type { Data } from '../lib/types';
import cache from '../lib/utils/cache';
import got from '../lib/utils/got';

vi.mock('../lib/utils/cache', () => ({ default: { tryGet: vi.fn() } }));
vi.mock('../lib/utils/got', () => ({ default: vi.fn() }));

const soccerUrl = 'https://m.hupu.com/soccer';

// Shapes taken from the live m.hupu.com/soccer __NEXT_DATA__ payload; titles are real TA items.
const news = [
    {
        nid: '1',
        title: 'TA：图赫尔曾想在拜仁买阿劳霍；感激巴萨愿意放他去利物浦',
        link: 'https://m.hupu.com/bbs/1',
        tid: '1',
        publishTime: '2026-10-31 13:34:05',
    },
    {
        nid: '2',
        title: 'TA跟队：亲历弗爵后曼联每任主帅下课，卡里克能撑过6个月吗',
        link: 'https://m.hupu.com/bbs/2',
        tid: '2',
        publishTime: '2026-10-31 14:11:46',
    },
    {
        nid: '3',
        title: '官方：国足11月热身赛在肇庆进行，对手为马来西亚、巴林',
        link: 'https://bbs.hupu.com/3.html',
        tid: '3',
        publishTime: '2026-10-31 15:13:43',
    },
    {
        nid: '4',
        title: 'ta：小写开头不应命中',
        link: 'https://m.hupu.com/bbs/4',
        tid: '4',
        publishTime: '2026-10-31 15:20:00',
    },
    {
        nid: '5',
        title: '抽卡决定足球起点！拼出你的传奇天赋',
        link: 'huputiyu://webview/openencodeurl?url=https%3A%2F%2Factivity-static.hupu.com',
        tid: null,
        publishTime: '2026-10-31 16:30:32',
    },
];

const pageHtml = (items: unknown[]) =>
    `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: { pageProps: { schedules: [], news: items, supportHydrate: true } },
    })}</script></body></html>`;

const articleHtml = (url: string) => `<html><body><div class="bbs-user-info-name">作者</div><div class="second-line-user-info"><span>11:00</span></div><div id="bbs-thread-content"><p>正文 ${url}</p></div></body></html>`;

const requestedUrls = () => vi.mocked(got).mock.calls.map(([request]: any[]) => (typeof request === 'string' ? request : request?.url));

const invokeTa = () => soccerTaRoute.handler!({} as unknown as Context) as Promise<Data>;

const invokeLegacy = (category: string) =>
    hupuRoute.handler!({
        req: {
            param: (name: string) => (name === 'category' ? category : undefined),
        },
    } as unknown as Context) as Promise<Data>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.tryGet).mockImplementation(async (_key, load) => load());
    vi.mocked(got).mockImplementation(async (request: any) => {
        const url = typeof request === 'string' ? request : request?.url;
        return { data: url === soccerUrl ? pageHtml(news) : articleHtml(url) };
    });
});

describe('Hupu soccer TA route', () => {
    it('exposes the /soccer-ta path inside the hupu namespace', () => {
        expect(soccerTaRoute.path).toBe('/soccer-ta');
        expect(soccerTaRoute.example).toBe('/hupu/soccer-ta');

        const namespaces = {} as NamespacesType;
        applyModulesToNamespaces({ '/hupu/soccer-ta.ts': { route: soccerTaRoute } }, namespaces);
        expect(namespaces.hupu.routes).toHaveProperty('/soccer-ta');
    });

    it('keeps only items whose title starts with TA, in source order', async () => {
        const feed = await invokeTa();

        expect(feed.title).toBe('虎扑 - 足球 - TA');
        expect(feed.link).toBe(soccerUrl);
        expect(feed.item?.map((item) => item.title)).toEqual(['TA：图赫尔曾想在拜仁买阿劳霍；感激巴萨愿意放他去利物浦', 'TA跟队：亲历弗爵后曼联每任主帅下课，卡里克能撑过6个月吗']);
    });

    it('fetches the soccer index once and article details only for matched items', async () => {
        await invokeTa();

        expect(requestedUrls()).toEqual([soccerUrl, 'https://m.hupu.com/bbs/1', 'https://m.hupu.com/bbs/2']);
    });

    it('maps guid, link and pubDate for the matched items', async () => {
        const feed = await invokeTa();

        expect(feed.item?.[0]).toMatchObject({
            guid: '1',
            link: 'https://m.hupu.com/bbs/1',
        });
        expect(feed.item?.[1]).toMatchObject({
            guid: '2',
            link: 'https://m.hupu.com/bbs/2',
        });
        expect(feed.item?.[0].pubDate).toBeInstanceOf(Date);
    });

    it('keeps the existing /hupu/soccer feed unchanged', async () => {
        expect(hupuRoute.path).toEqual(['/dept/:category?', '/:category?']);

        const feed = await invokeLegacy('soccer');

        expect(feed.title).toBe('虎扑 - 足球');
        expect(feed.link).toBe(soccerUrl);
        expect(feed.item?.map((item) => item.title)).toEqual(news.map((item) => item.title));
    });

    it('still rejects unknown categories', async () => {
        await expect(invokeLegacy('basketball')).rejects.toThrow('Invalid category. Valid options are: nba, cba, soccer');
    });
});
