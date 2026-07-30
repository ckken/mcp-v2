# 全链路 E2E 验收规划

## 完成边界

这轮验收覆盖当前 Demo 已注册的全部能力，不把尚未实现的 Auth、Tasks、
Prompts 或 Codex Desktop 内嵌渲染写成已完成。

Runner 每次建立两个真实 MCP Client：

- modern Client 固定协议 `2026-07-28`
- legacy Client 验证 v2 Server 的 `legacy: "stateless"` fallback

所有结果由 `POST /api/e2e/run` 实时生成。前端只读取报告，不在浏览器里补造
成功状态。

## 20 个用例

| 分组 | 数量 | 覆盖范围 |
| --- | ---: | --- |
| Protocol | 3 | JSON HTTP、modern 握手、legacy fallback |
| Discovery | 2 | 8 个 Tool、MCP App Resource |
| Tools | 6 | health、订单命中/空结果、Dashboard 三种视图 |
| Skills | 5 | 发现、订单摘要两条路径、验证清单、未知 Skill 拒绝 |
| Verification | 2 | 完整证据链通过、未确认路径失败 |
| MCP Apps | 2 | 单文件 bridge、Tool 与 `ui://` 元数据 |

8 个注册 Tool 都会在套件中被真实调用：

```text
system.health
orders.search
orders.dashboard
skills.discover
skills.run
verification.start
verification.status
verification.finish
```

## 可视化验收

`E2E Lab` 使用 React Flow 将六个分组组织为场景闭环：

```text
E2E Runner → Protocol → Discovery → Tools
      ↑                                  ↓
 MCP Apps ← Verification ← Skills ←─────┘
```

收到服务端完整报告后，页面按原始顺序逐条回放 20 个真实用例；每个用例必须
经过 queued → running → passed/failed，所属场景节点和连线同步变化。播放
结束后再生成汇总结论。场景轨道可切换每组用例，并显示 run id、协议版本、
通过数、失败数、耗时和脱敏证据。

桌面与 390px Playwright 都要执行页面上的“运行全部 E2E”按钮，并验证
React Flow 画布、20 个用例的运行中状态、全部终态、六个场景切换和每一条
用例证据。E2E 页面不加载品牌 IP 图片。

MCP App 另走 sandbox iframe 验收：

```text
Overview → Orders → status=paid → Status → status=fulfilled
```

## 门禁

```bash
bun run typecheck
bun run test
bun run build
bun run acceptance:http
bun run acceptance:browser
bun run acceptance:codex
```

只有以上命令全部通过，且 `E2E Lab` 显示 `20/20`，这轮任务才算完成。
