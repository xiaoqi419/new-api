# 渠道思考等级上游后缀转换

渠道编辑提供默认关闭的 reasoning_effort_to_model_suffix 布尔设置。未开启时使用既有行为。

开启后对 OpenAI Chat reasoning_effort、Responses reasoning.effort，将上游模型变成主模型-等级，并移除消费的 effort 字段。支持 none/minimal/low/medium/high/xhigh/max，保留 Responses 其他 reasoning 字段，无等级不追加，避免重复后缀，非法等级返回 400。模型映射先于最终转换；原始计费身份保持。不推断 fast。

显式转换在透传时仍生效，保留其他未知字段。仅开启透传时不额外转换。渠道测试和实际转发、流式及非流式采用一致规则。

计费使用原始主模型价格，包括输入输出、缓存和阶梯表达式。生成的上游后缀不是新的必需定价项；既有独立请求模型定价优先级保持。预扣和结算安全边界保持。

界面支持所有已有语言并解释主模型计费，附更新日志。以请求体和计费结果回归验证。
