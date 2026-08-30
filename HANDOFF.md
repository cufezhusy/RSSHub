# HANDOFF — DR.dk Full-Text RSS for cufezhusy/RSSHub

This file lets the next AI session continue work **without re-discovering anything**. Read it fully before doing anything.

---

## 1. 项目背景

- 当前 repository 是 **cufezhusy 的 RSSHub fork**：
    ```
    https://github.com/cufezhusy/RSSHub
    ```
- 本次工作的目标：为 fork 增加 **DR.dk（Danmarks Radio）新闻全文 RSS**。
- 这些 RSS feed 后续会被用户的 **rss-translator** 项目消费（Full-text 是关键要求）。
- 工作仓库路径：`/home/zhuzhu/RSSHub`（本机工作目录）。

---

## 2. 当前完成状态

```
Status: DR.dk full-text RSS implementation completed
Production readiness: READY
```

已全部完成：

- ✅ DR 官方 RSS integration（7 个 feeds）
- ✅ DR article fetching（got + config.trueUA）
- ✅ `__NEXT_DATA__` extraction
- ✅ structured body rendering（component tree → HTML）
- ✅ full-text RSS output（description 内嵌完整正文）
- ✅ fallback handling（失败回退官方 RSS 摘要）
- ✅ caching（route cache + article content cache）
- ✅ tests（10 passed）
- ✅ documentation（description / radar 内嵌于 route 定义）

---

## 3. 已实现的 Routes

| Route         | DR 官方 RSS source                                   |
| ------------- | ---------------------------------------------------- |
| `/dr/nyheder` | `https://www.dr.dk/nyheder/service/feeds/senestenyt` |
| `/dr/indland` | `https://www.dr.dk/nyheder/service/feeds/indland`    |
| `/dr/udland`  | `https://www.dr.dk/nyheder/service/feeds/udland`     |
| `/dr/politik` | `https://www.dr.dk/nyheder/service/feeds/politik`    |
| `/dr/penge`   | `https://www.dr.dk/nyheder/service/feeds/penge`      |
| `/dr/viden`   | `https://www.dr.dk/nyheder/service/feeds/viden`      |
| `/dr/sport`   | `https://www.dr.dk/nyheder/service/feeds/sporten`    |

> 注意：DR 官方 RSS 地址在 `https://www.dr.dk/nyheder/service/feeds/<slug>`。
> 旧资料中的 `https://www.dr.dk/rss/*.xml` 已废弃（404）。不要使用旧地址。

---

## 4. 技术实现

代码位置：

```
lib/routes/dr/
├── namespace.ts          # DR (Danmarks Radio), url: dr.dk, lang: da
├── utils.ts              # 共享 parser / helper（所有 route 复用）
├── nyheder.ts            # /dr/nyheder
├── indland.ts            # /dr/indland
├── udland.ts             # /dr/udland
├── politik.ts            # /dr/politik
├── penge.ts              # /dr/penge
├── viden.ts              # /dr/viden
├── sport.ts              # /dr/sport
├── utils.test.mts        # 单元测试（10 tests）
└── fixtures/
    ├── feed.xml          # RSS fixture（真实 DR RSS 快照）
    └── article.html      # 文章 fixture（含 __NEXT_DATA__）
```

### 核心流程（utils.ts）

```
DR 官方 RSS（parser.parseURL）
    ↓
20 个 item
    ↓
每篇 fetchDRArticle(link) → cache.tryGet(`dr:article:${link}`)
    ↓
got 抓取文章 HTML（User-Agent: config.trueUA）
    ↓
extractDRArticle(html)
    ↓
__NEXT_DATA__ JSON → props.pageProps.viewProps.resource | article
    ↓
body component tree → HTML
```

### 正文来源

DR 页面正文位于 `<script id="__NEXT_DATA__" type="application/json">` 内嵌 JSON：

```json
props.pageProps.viewProps.resource   // "Kort nyt" 类短文
props.pageProps.viewProps.article    // 常规文章
```

正文通过 `body` 数组的 component tree 渲染为 HTML。

### 支持的 Component 类型（utils.ts 的 renderBody / renderInline）

| Component                 | 输出                                              |
| ------------------------- | ------------------------------------------------- |
| `ParagraphComponent`      | `<p>`（含 inline Text/Italic/Bold/Link）          |
| `HeadingComponent`        | `<h2>`                                            |
| `QuoteComponent`          | `<blockquote>` + `<footer>`(citation)             |
| `ImageComponent`          | `<figure><img><figcaption>`                       |
| `MediaComponent` (Clip)   | 视频 poster 图 `<figure>`（HLS 为 DRM，不可内嵌） |
| `EmphasizedListComponent` | `<ul><li>`（递归）                                |
| inline `Text`             | 转义文本                                          |
| inline `Italic`           | `<em>`                                            |
| inline `Bold`             | `<strong>`                                        |
| inline `Link`             | `<a href>`                                        |

### 被排除的内容

- `ReadMoreLinkComponent`（推荐文章）→ 排除
- `CodeComponent`（交互图形）→ 排除
- `OEmbedComponent`（内嵌播放器）→ 排除

### 共享设计

7 个 route 全部委托 `getNews(slug)`（utils.ts），每个 route 只配置不同的官方 RSS URL，**没有复制 scraper**。

---

## 5. Cache / Performance

```
route cache:            ~5 min（RSSHub 默认 CACHE_EXPIRE）
article content cache:  ~1 hour（RSSHub 默认 CACHE_CONTENT_EXPIRE）
```

- Cache key：`dr:article:<article_url>`（每篇文章独立）。
- **冷缓存**：最多 20 个 article 请求（一次并发，`Promise.all`）。
- **Warm cache**：基本不需要重新抓取 DR（实测 warm 响应 ~10ms）。
- **没有额外的 concurrency limit**：Production Review 已确认 `Promise.all` + `cache.tryGet` 模式与 RSSHub 现有 news routes（theguardian / npr / cnbc / bbc）完全一致，无需修改。
- 如需未来增强：仓库已有 `p-map` 依赖，可仿 shoppingdesign 加 `{ concurrency: 5 }`。

---

## 6. Fallback

如果 DR article extraction 失败（抓取异常 / 无正文 / 空 body / reels / liveblog）：

```
full article
    ↓
RSS description / contentSnippet
```

- 单篇失败 **不会**导致整个 feed 失败。
- 失败结果会被 `cache.tryGet` 缓存为 `'null'`，route 中 `article?.content` 判为 falsy → 走 fallback，TTL 过期后自动重试。

---

## 7. Known limitations

- `/reels/` 视频内容可能没有正文（fallback 到 RSS 摘要）。
- liveblog / live news 某些页面可能没有 body（fallback）。
- `MediaComponent` 视频只保留 poster 图 + description（无法内嵌 DRM 视频）。
- interactive `CodeComponent` 不输出。
- `OEmbedComponent` 不输出。
- **DR 若未来移除 `__NEXT_DATA__`，全文提取可能失效，但 feed 会 fallback 到 RSS 摘要，不会 crash。**

---

## 8. Tests

```bash
npx vitest run lib/routes/dr/utils.test.mts
→ Test Files  1 passed (1)
→ Tests       10 passed (10)
```

```bash
pnpm build:routes     → passed
pnpm lint             → passed
npx tsc --noEmit      → passed
pnpm format:check     → passed
```

> 完整测试套件（`pnpm vitest`）中的 9 个失败是**已有环境问题**：Redis（未运行）、Playwright（浏览器未安装）、httpbingo（外网依赖）。
> 已通过 `git stash` 验证这些失败在**不含 DR 修改**时同样存在，与 DR 无关。

> 测试文件用 `.test.mts` 后缀（而非 `.test.ts`），因为 RSSHub dev-registry 用 `/.tsx?$/` 扫描 `lib/routes`，`.test.ts` 会被误当路由模块破坏 `build:routes`；`.mts` 不被该 pattern 匹配但被 vitest 发现。

---

## 9. Git 状态

Commit：

```
06c6bfa51 feat: add full-text DR.dk news RSS routes
```

（这是 DR implementation commit，已 push。）

```
Working tree: clean
Remote: origin (https://github.com/cufezhusy/RSSHub.git)
Branch: master
Push: completed
```

后续还会有第二个 commit：

```
docs: add project handoff（即本文件）
```

---

## 10. 下一步任务 ⭐ 最重要的部分

> **下一步不是重新实现 DR RSS。**

DR RSS implementation 已完成并 push。下一步应该是：

```
1. 拉取/确认最新 master
2. 检查 commit（应看到 06c6bfa51 + docs commit）
3. 确认 DR routes（/dr/nyheder 等 7 条）
4. 部署到 Fly.io
5. 验证线上 RSS
6. 确认线上 full-text extraction
7. 将线上 DR RSS 接入 rss-translator
```

**Fly.io deployment 尚未执行。不要在本次任务中部署 Fly.io**（除非下一次任务明确要求）。

---

## 11. Deployment context

- `fly.toml` 存在：✅
- Fly app name（来自 `fly.toml`）：`rsshub`
- 当前 deployment 状态：**未确认**。
    - 本机 `fly status` 返回 `Could not find App "rsshub"`（可能是账号未认证、org 不同、或 app 从未创建）。
    - **部署前必须确认** app 归属 / 认证状态。

```
Fly.io app name: verify before deployment (fly.toml 中写的是 "rsshub"，但 fly status 找不到该 app)
```

不要猜 app name。部署前先 `fly auth whoami` 与 `fly status` 确认。

---

## 12. 给下一次 AI 的工作原则

```
Important:

- Do not reimplement DR routes.
- Do not modify rss-translator unless explicitly requested.
- Do not change unrelated RSSHub routes.
- Verify current git state before making changes.
- Run tests before deployment.
- Do not assume Fly.io deployment succeeded; verify it explicitly.
- After deployment, test the actual public RSS URLs.
```

---

## 关键参考（来自 Production Review）

- DR 官方 RSS 地址在 `https://www.dr.dk/nyheder/service/feeds/<slug>`。
- 全文提取依赖 `__NEXT_DATA__`（Next.js 内嵌 JSON），是当前 DR 页面最稳定的结构化数据源。
- DR GraphQL API（`/tjenester/steffi/graphql`）需要 API key，不可直接用。
- 每 feed 默认 20 items；可用 RSSHub 通用 `?limit=` 参数控制输出条数。
