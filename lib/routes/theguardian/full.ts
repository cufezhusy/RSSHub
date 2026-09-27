import type { Route } from '@/types';

import { getFeed } from './utils';

const rootUrl = 'https://www.theguardian.com';

export const route: Route = {
    path: '/full/:path{.+}',
    categories: ['traditional-media'],
    example: '/theguardian/full/football',
    parameters: { path: 'Section path found in the Guardian URL, e.g. `football/premierleague` or `tone/editorials`' },
    name: 'Full Text',
    maintainers: ['Polynomia', 'HenryQW'],
    handler,
    description: 'Provides full text articles for any Guardian index page by appending `/rss` to the given path.',
};

function handler(ctx) {
    const path = ctx.req.param('path');
    const link = `${rootUrl}/${path}`;
    const rss = `${link}/rss`;

    if (new URL(rss).hostname !== 'www.theguardian.com') {
        throw new Error('Invalid Guardian path');
    }

    return getFeed({
        link,
        title: path,
        rss,
    });
}
