import type { Route } from '@/types';

import { getCategoryFeed } from './feed';

const taTitlePrefix = 'TA';

export const route: Route = {
    path: '/soccer-ta',
    categories: ['bbs'],
    example: '/hupu/soccer-ta',
    name: '足球 TA',
    url: 'm.hupu.com',
    maintainers: ['cufezhusy'],
    description: `只显示标题以 \`TA\` 开头的足球文章，即虎扑足球频道中来自 The Athletic 的翻译长文，过滤掉大量短讯。等价于 [\`/hupu/soccer?filter_title=^TA\`](https://rsshub.app/hupu/soccer?filter_title=^TA)。`,
    handler: () => getCategoryFeed('soccer', { title: '虎扑 - 足球 - TA', titlePrefix: taTitlePrefix }),
};
