# Authenticated Entry Point Visibility

## Purpose

登录后的现代版和经典版界面使用统一、稳定的入口可见性策略。产品暂不展示的功能仍保留实现和直接访问能力，但不能从侧栏、移动菜单、命令菜单、顶部子导航或聚合页面标签中被重复发现。

## Hidden destinations

以下目的地不作为可发现的导航入口展示：

- `/finance/groupbuy`
- `/user-ranking`
- `/redemption-codes`
- `/subscriptions`
- `/groupbuy/admin`
- `/rebate`
- `/identity-verification/admin`

经典版使用与上述目的地对应的稳定 item key 执行同等过滤。

## Required behavior

- 根侧栏、响应式侧栏、命令菜单、经典顶部子导航和聚合页面标签必须应用隐藏策略。
- 财务中心必须显示钱包、发票和幸运抽奖，且保持该顺序；不得显示“拼团大厅”标签。
- 过滤必须依赖稳定 URL、section ID 或 item key，不得依赖翻译后的显示文本。
- 未列出的入口继续按现有权限、模块配置和排序规则显示。
- 被隐藏目的地的路由、页面组件、接口调用、支付流程和权限检查必须保留。
- 用户直接访问保留的路由时，应用继续执行原有路由和权限行为。

## Repository baseline

- `xiaoqi419/new-api` 是二开产品的开发、测试和发布基线。
- `QuantumNous/new-api` 是只用于独立上游同步任务的来源；同步必须经过冲突审查和验证后才能合入二开主线。
