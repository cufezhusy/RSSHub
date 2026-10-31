import type { Data, Route } from '@/types';

import { categoryOptions, getCategoryFeed, isCategory, validCategoryKeys } from './feed';

export const route: Route = {
    path: ['/dept/:category?', '/:category?'],
    name: '手机虎扑网',
    url: 'm.hupu.com',
    maintainers: ['nczitzk', 'hyoban'],
    example: '/hupu/nba',
    parameters: {
        category: {
            description: '分类，可选值：nba、cba、soccer，默认为空（首页）',
            default: '',
            options: categoryOptions,
        },
    },
    description: `::: tip
电竞分类参见 [游戏热帖](https://bbs.hupu.com/all-gg) 的对应路由 [\`/hupu/all/all-gg\`](https://rsshub.app/hupu/all/all-gg)。
:::`,
    categories: ['bbs'],
    radar: [
        {
            source: ['m.hupu.com/:category', 'm.hupu.com/'],
            target: '/:category',
        },
    ],
    handler: async (ctx): Promise<Data> => {
        const category = ctx.req.param('category') || '';
        if (!isCategory(category)) {
            throw new Error('Invalid category. Valid options are: ' + validCategoryKeys.join(', '));
        }

        return getCategoryFeed(category);
    },
};
