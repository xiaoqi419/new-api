# Outcome
渠道可选择把标准思考等级转换成上游模型后缀，同时以用户请求的主模型计费。

# Scope
默认关闭的渠道开关；OpenAI Chat 和 Responses；渠道测试遵守透传；主模型计费回归；渠道编辑、翻译和更新日志。

# Non-goals
不新增括号语法，不推断 fast 定价，不调整生产配置，不自动部署。

# Acceptance examples
- A1: 开关默认关闭，保存和重新编辑保持值，关闭时原有请求和计费行为保持。
- A2: 开启后 Chat model=gpt-5.6-sol 与 reasoning_effort=low 转为上游 gpt-5.6-sol-low，并移除 effort。
- A3: Responses reasoning.effort 同样转换，保留其他 reasoning 字段。
- A4: 无等级不追加后缀，避免重复后缀，非法等级返回明确客户端错误。
- A5: 生成后缀不需另配价格；输入输出缓存价格及阶梯计费使用原主模型，预扣和结算一致。
- A6: 显式转换与透传组合时保留未知字段；仅透传时渠道测试不再剥除 GPT 后缀。
- A7: 流式与非流式以及后台测试采用一致转换规则。
- A8: 界面多语言和更新日志完整，Go 定向测试、relaykit 独立构建与前端检查通过。

# Constraints and invariants
独立工作区，保留所有数据与凭据，relaykit 独立。生产发布遵守 PR/CI/合并流程。

# Decisions
用户确认标准模型名与思考参数、渠道单独开启及主模型计费，并回复“可以 开始实现吧”。无等级不猜默认值，显式转换开关允许在透传时只改相关字段；保持单 change。

# Open questions
无。

# Verification expectations
确定性的请求与计费回归测试及独立只读 Verifier，覆盖所有验收项。
