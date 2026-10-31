import type { Data, DataItem } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

import type { HomePostItem, HupuApiResponse, NewsDataItem } from './types';
import { isHomePostItem } from './types';
import { extractNextData, getEntryDetails } from './utils';

const rootUrl = 'https://m.hupu.com';

const categories = {
    nba: {
        title: 'NBA',
        data: 'newsData',
    },
    cba: {
        title: 'CBA',
        data: 'newsData',
    },
    soccer: {
        title: '足球',
        data: 'news',
    },
    '': {
        title: '首页',
        data: 'res',
    },
} as const;

export type Category = keyof typeof categories;

export const isCategory = (key: string): key is Category => Object.hasOwn(categories, key);

export const categoryOptions = Object.entries(categories).map(([key, value]) => ({
    label: value.title,
    value: key,
}));

export const validCategoryKeys = Object.keys(categories).filter(Boolean);

type PagePropsData = Partial<Record<(typeof categories)[keyof typeof categories]['data'], Array<HomePostItem | NewsDataItem>>>;

const toDataItem = (item: HomePostItem | NewsDataItem): DataItem =>
    isHomePostItem(item)
        ? {
              title: item.title,
              link: item.url.replace(/bbs\.hupu\.com/, 'm.hupu.com/bbs'),
              guid: item.tid,
              category: item.label ? [item.label] : undefined,
          }
        : {
              title: item.title,
              pubDate: timezone(parseDate(item.publishTime), 8),
              link: item.link.replace(/bbs\.hupu\.com/, 'm.hupu.com/bbs'),
              guid: item.tid,
          };

export const getCategoryFeed = async (category: Category, options: { title?: string; titlePrefix?: string } = {}): Promise<Data> => {
    const { title, titlePrefix } = options;
    const currentUrl = `${rootUrl}/${category}`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    const data = extractNextData<HupuApiResponse>(response.data, currentUrl);
    const { pageProps } = data.props;

    const dataKey = categories[category].data;
    if (!Object.hasOwn(pageProps, dataKey)) {
        throw new Error(`Expected '${dataKey}' property not found in pageProps for category: ${category || 'home'}`);
    }

    const pagePropsData: PagePropsData = pageProps;
    const rawData = pagePropsData[dataKey];
    const rawDataArray = Array.isArray(rawData) ? rawData : [];

    const mappedItems = rawDataArray.map((item) => toDataItem(item));
    const filteredItems = titlePrefix ? mappedItems.filter((item) => item.title.startsWith(titlePrefix)) : mappedItems;

    // Fetch details only for the items that will be rendered, and skip links without a readable page.
    const items = await Promise.all(filteredItems.filter((item) => item.link && !/subject/.test(item.link)).map((item) => getEntryDetails(item)));

    return {
        title: title ?? `虎扑 - ${categories[category].title}`,
        link: currentUrl,
        item: items,
    };
};
