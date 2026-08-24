# @deepseek-ai/dsh-client-ui-version-check

[English](README.md) | 中文

将鼠标悬停在左上角品牌 Logo 上，浮动显示已安装的 dsh 版本与可更新版本，并可通过居中的模态窗查看当前版本及后续版本的更新记录。这是一个双面插件：宿主半在 `host.describe` 中补充真实已装版本与最新发布版本；客户端半渲染非侵入的悬停浮层与模态窗，**零外部 CSS 依赖**（内置样式表，全部使用 dsh 主题 token）。

## 截图

![版本检查模态窗](docs/version-check-modal.png)

详情模态窗展示当前已装版本及后续版本的更新记录（含中英双语摘要），并随宿主 UI 主题自动适配。

## 功能

- **悬停浮层**（左上角品牌 Logo）：`dsh 版本` + `可更新版本` + 更新状态（有新版本可更新 / 已是最新 / 获取最新版本失败）。
- **刷新按钮**：绕过 60 秒客户端缓存，重新请求 `/api/host.describe`。
- **详情模态窗**：调用 GitHub releases API（CORS 开放），过滤出当前已装版本及后续版本（新→旧），提取每个 release 的中文与英文更新摘要，在居中的主题化模态窗中展示。可通过右上角关闭按钮、点击遮罩或按 Esc 关闭。
- **摘要内链接可点击**：更新摘要中的原始 HTML 链接、markdown 链接与裸 http(s) URL 会渲染为可点击链接，点击后在新标签页打开（`rel="noopener noreferrer"`）。其余内容一律以纯文本渲染——脚本、样式、图片与表单会被丢弃，第三方 release body 无法向宿主页面注入内容或发起任何请求。
- **主题原生适配**：所有颜色使用 dsh 设计 token（`--dsw-alias-*`、`--dsw-static-amber-*`），自动跟随浅色/深色主题；字号继承宿主 body，并通过 `em` 等比缩放。

## 非侵入设计

- **不注册任何核心槽位**——侧边栏品牌槽位仍归官方品牌插件所有。
- 通过 DOM 观察定位品牌按钮（结构特征：`button[aria-label="新建会话"/"New session"]` 且首个子元素是含嵌套 span 的 span——「新建会话」按钮的首个子元素是 SVG 图标，两者不会混淆）。
- 浮层与模态窗均为 `position: fixed` 元素，挂载于 `document.body`，避开侧边栏列的 overflow 裁剪。
- 版本数据通过原始 POST `/api/host.describe` 获取（绕过核心客户端 schema 的字段剥离），带 60 秒缓存。

## 宿主半

在运行时包装 `apiProxy.host.describe`，在响应返回前补充：

- `version`：真实已装版本，读取自 `@deepseek-ai/dsh/package.json`。
- `latestVersion`：来自 npm registry 的最新发布版本（优先用户配置的 registry，其次官方源，镜像作为兜底），带 10 分钟 TTL、每个候选 2.5 秒超时与请求去重。失败返回 `null`，绝不破坏 `host.describe`。

完全不触碰核心包。

## 安装

本包同时承载两个面（`main` = 宿主半，`exports["./client"]` = 客户端半，`dsh.client.platform: "web"`）。安装到 web profile 的 node_modules，并通过 profile 的插件补丁文件（如 `cordis.patch.yml`）注册：

```yaml
- insert:
    - id: ui-version-check
      name: '@deepseek-ai/dsh-client-ui-version-check'
```

首次新增插件需重启服务器（plugin-set 变化要重启才进入 loader）；此后 bundle 内容更新只需浏览器强制刷新（Ctrl+F5）。

## 模型体验

无；插件仅在浏览器中读取 `host.describe` 与 GitHub releases API，不触达任何模型请求。

#### KV Cache 影响

无；本包既不组装也不发送任何 provider 请求。

## 已知限制与待办

- **最新版本查询仅在宿主侧**——客户端渲染 `host.describe` 返回的内容；没有本插件时，上游 `host.describe` 的 version 仍是 `0.0.1` 占位符。
- **更新记录来自 GitHub**——离线或 CORS 受限环境下显示「无法获取更新摘要」并提供重试按钮。
- **品牌按钮检测依赖结构**——通过 `aria-label` + 嵌套 span 形状定位侧边栏品牌按钮；未来布局变化可能需要更新 `isBrandButton`。
- **待办**——将纯文本摘要提取升级为完整的 markdown 更新记录渲染。
