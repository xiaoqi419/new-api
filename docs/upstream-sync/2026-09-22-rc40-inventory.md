# rc.40 integration upstream inventory

Baseline: `2d054b38054f7fef1a46c6dbbd61e0cdf8c1997e`  
Target: `9310231b3c27fea933e939b46cf26e0ce67192e3`

This is a commit-provenance inventory, not a count of missing features. Prior squashed integrations require behavioral comparison. Every row must receive a final disposition (already-equivalent / integrated / superseded / deliberate divergence) with evidence before verification passes. No pending row may silently disappear.

| Commit | Date | Upstream change | Disposition | Evidence |
| --- | --- | --- | --- | --- |
| [a073f74b3](https://github.com/QuantumNous/new-api/commit/a073f74b38a33bb154821089c097658cbdcc0fbe) | 2026-08-26 | refactor: deprecate int32 (#7025) | pending audit | — |
| [8c25eee71](https://github.com/QuantumNous/new-api/commit/8c25eee71ba03ea19851dcc4f12ee4ecfcfb0808) | 2026-08-26 | chore(build): upgrade Bun to 1.4.0 | pending audit | — |
| [8f6961c67](https://github.com/QuantumNous/new-api/commit/8f6961c675932f406260ff0c218bc2aa0603e9b2) | 2026-08-26 | feat: vllm thinking_token_budget (#7027) | pending audit | — |
| [cae3676ec](https://github.com/QuantumNous/new-api/commit/cae3676ec6f46ee5ef596443256f78c4e9b34ceb) | 2026-08-27 | feat: glm chanel /v1/responses (#7050) | pending audit | — |
| [ba2e9287b](https://github.com/QuantumNous/new-api/commit/ba2e9287bb7a8002116c03daa4c457a330054871) | 2026-08-27 | feat(ollama): passthrough Claude Messages and OpenAI Responses (#7051) | pending audit | — |
| [e468b7391](https://github.com/QuantumNous/new-api/commit/e468b73915e5028e9849de62c5018a0faa203012) | 2026-08-27 | docs: update PR template and remove PR Check workflow (#7053) | pending audit | — |
| [692e8d6ee](https://github.com/QuantumNous/new-api/commit/692e8d6ee6a9a1620c2d731cb51a1e3154a7042b) | 2026-08-29 | fix(web): restore admin unbinding for built-in providers (#6987) | pending audit | — |
| [ac381acf4](https://github.com/QuantumNous/new-api/commit/ac381acf4bf41204b97bb26b4c58c83275877a2e) | 2026-08-29 | fix(billing): 修复时间规则恒真表达式导致倍率全天生效 (#6934) | pending audit | — |
| [7037ac15b](https://github.com/QuantumNous/new-api/commit/7037ac15bd8a29f8ee3e2b74e784bcdb75d67d22) | 2026-08-29 | fix(docker): add relaykit go.mod to dev build context (#7072) | pending audit | — |
| [eb48396d5](https://github.com/QuantumNous/new-api/commit/eb48396d5fe97d27772d0cd5e3ca8aa5caa4f3e9) | 2026-08-29 | feat(task): replace built-in task adaptors with a sandboxed JS plugin system (#7076) | pending audit | — |
| [0f2a2075a](https://github.com/QuantumNous/new-api/commit/0f2a2075ab072ea7e20ffa5dd5d58dbf1b6b5b22) | 2026-08-29 | fix(relay): 请求参数校验错误返回 HTTP 400 (#6774) | pending audit | — |
| [98d50d538](https://github.com/QuantumNous/new-api/commit/98d50d5383a33432ff6c30b129461b170e5cbffc) | 2026-08-29 | fix(web): recheck setup status after page reload (#6968) | pending audit | — |
| [b80d633cf](https://github.com/QuantumNous/new-api/commit/b80d633cf586b001cfbb4200bae93e65abe57c2b) | 2026-08-29 | feat(auth): encrypt password login transport | pending audit | — |
| [8454082f9](https://github.com/QuantumNous/new-api/commit/8454082f930f44593e92791c2581ffc63eb30a59) | 2026-08-29 | feat(chat): add AQBot preset (#7079) | pending audit | — |
| [918427d8a](https://github.com/QuantumNous/new-api/commit/918427d8ab41f6adaa4113d0496f1f8621855b70) | 2026-08-29 | feat(auth): make password encryption opt-in #6743 | pending audit | — |
| [6c22550ea](https://github.com/QuantumNous/new-api/commit/6c22550ea325d4fea0e0ece52412cb1e4449291c) | 2026-08-30 | feat(task): resolve channel-mapped aliases and case variants for plugin models | pending audit | — |
| [66031a09d](https://github.com/QuantumNous/new-api/commit/66031a09d99f2ac4e0b94e2c41f04ed691a79304) | 2026-08-30 | fix(model): disable PostgreSQL prepared statements for pooler compatibility | pending audit | — |
| [0bee5d441](https://github.com/QuantumNous/new-api/commit/0bee5d4410296e972bf0076414ade786c2c799c8) | 2026-08-30 | fix(ali): honor image response format (#5513) (#7048) | pending audit | — |
| [dc4732cfe](https://github.com/QuantumNous/new-api/commit/dc4732cfed712b004d3d3d94a414d3ff127a93cc) | 2026-08-30 | feat(web): factory task plugins update only with the system | pending audit | — |
| [b5b94bc68](https://github.com/QuantumNous/new-api/commit/b5b94bc685fd2251551df826dab3575ab262f6dc) | 2026-08-30 | fix(subscription): 无有效订阅时前端如实显示「仅用订阅」偏好 (#6222) (#7086) | pending audit | — |
| [1751f43ee](https://github.com/QuantumNous/new-api/commit/1751f43ee07edc9eb0c56fd9b23586861b43df46) | 2026-08-30 | fix(sqlite): enable WAL + working busy timeout + _txlock=immediate to stop concurrent write lockouts (#7030) | pending audit | — |
| [6eb6f35ed](https://github.com/QuantumNous/new-api/commit/6eb6f35ed211b7459cae3b9f13286b9c93fc1bd6) | 2026-08-30 | fix(model): return string from JSON column Valuers for pg simple protocol | pending audit | — |
| [b518d0033](https://github.com/QuantumNous/new-api/commit/b518d0033b670f5518b8a2f1cf8ea0142a9d1b8d) | 2026-08-30 | fix(relay): bound the wait for upstream response headers (fixes unbounded heap growth → OOM) (#6949) | pending audit | — |
| [74158715c](https://github.com/QuantumNous/new-api/commit/74158715cde6d7b767ead23d9a2af64b7b58a588) | 2026-08-30 | fix initialize database | pending audit | — |
| [69a41eead](https://github.com/QuantumNous/new-api/commit/69a41eeadc81adb08d04346512c76d62fd6203db) | 2026-08-30 | fix(model): drop leftover prefill_groups unique constraints before AutoMigrate (#7100) | pending audit | — |
| [2bf0820f4](https://github.com/QuantumNous/new-api/commit/2bf0820f4b89530acf14d389ba3e8229211933fa) | 2026-08-30 | Revert "fix(model): drop leftover prefill_groups unique constraints before Au…" (#7101) | pending audit | — |
| [2b6f1dfef](https://github.com/QuantumNous/new-api/commit/2b6f1dfefbe217fed31fc0726717cc7de6958e8e) | 2026-08-30 | fix(model): drop leftover prefill_groups unique constraints before AutoMigrate | pending audit | — |
| [8c8c4153d](https://github.com/QuantumNous/new-api/commit/8c8c4153d4b80d54352d21593de41aa9a6178f7e) | 2026-08-31 | fix(log): preserve quota in usage statistics (#7108) | pending audit | — |
| [27ff6a876](https://github.com/QuantumNous/new-api/commit/27ff6a8767e728f879d52770c273d4f73214a430) | 2026-08-31 | fix(model): migrate legacy token key constraints | pending audit | — |
| [67a0585d0](https://github.com/QuantumNous/new-api/commit/67a0585d0f252dfca445c11b7600971b7eeb8eea) | 2026-08-31 | fix(docs): correct Video API links across localized READMEs (#7116) | pending audit | — |
| [b7017c251](https://github.com/QuantumNous/new-api/commit/b7017c251badaacaab840646a959635d00665e2d) | 2026-09-01 | fix(model): do not treat no-op system task state writes as lock loss (#7135) | pending audit | — |
| [0ed497f06](https://github.com/QuantumNous/new-api/commit/0ed497f066a68613375124303ef54f220267b334) | 2026-09-01 | feat(relay): hosted-tool conversion fidelity, reasoning normalization, and billing usage integrity (#7137) | pending audit | — |
| [bbd97446c](https://github.com/QuantumNous/new-api/commit/bbd97446c26092f2e7250af429096064b9e0f899) | 2026-09-03 | fix(relay): follow-up billing integrity and conversion completions (#7170) | pending audit | — |
| [aece11d2f](https://github.com/QuantumNous/new-api/commit/aece11d2f7f095a33052696c5d28d3656609a99e) | 2026-09-03 | feat(plugin): add MiniMax-H3 /v2 video generation to the hailuo task … (#7168) | pending audit | — |
| [d8ca0ed0b](https://github.com/QuantumNous/new-api/commit/d8ca0ed0bb596e910e1955461e7691e40d224d70) | 2026-09-03 | chore: let owners use human PR templates | pending audit | — |
| [73afad588](https://github.com/QuantumNous/new-api/commit/73afad588ca7af07134fa423e8a33fdea6c855b2) | 2026-09-03 | fix(plugin): account for MiniMax-H3 input media usage (#7171) | pending audit | — |
| [057f71c23](https://github.com/QuantumNous/new-api/commit/057f71c2336c3981187b732a9d06f65490e9a946) | 2026-09-03 | fix(logs): isolate privileged metadata | pending audit | — |
| [219c9e063](https://github.com/QuantumNous/new-api/commit/219c9e06341f1b100e2c572a5f97c45f151fd280) | 2026-09-03 | 优化匿名冷启动与公开内容接口的重复回源请求 (#7166) | pending audit | — |
| [9f506dd7f](https://github.com/QuantumNous/new-api/commit/9f506dd7f905c288b4a119a8197cd64b77eb4a3f) | 2026-09-03 | refactor(logs): simplify LogOther projection and dedupe sensitive keys | pending audit | — |
| [9df450fe5](https://github.com/QuantumNous/new-api/commit/9df450fe54e1a874a5339b7c38a61014217f02c3) | 2026-09-03 | feat(task): give polling hooks a real query context, host HTTP classification, and bounded poll failures | pending audit | — |
| [36dbbf0f7](https://github.com/QuantumNous/new-api/commit/36dbbf0f77e710455e745048f4a32e8120ad3fd2) | 2026-09-03 | fix: keep ETag valid across different JSON packages | pending audit | — |
| [8f5ab8e40](https://github.com/QuantumNous/new-api/commit/8f5ab8e4048a90d88b20ae1e6d5228b04233d3b8) | 2026-09-03 | fix(ci): resolve release version from trigger tag | pending audit | — |
| [32c261923](https://github.com/QuantumNous/new-api/commit/32c261923a9786c64d2af087327ef057e7bde7e3) | 2026-09-03 | fix(task): explain 503 when a plugin-claimed model has no channel | pending audit | — |
| [3a9f41ee8](https://github.com/QuantumNous/new-api/commit/3a9f41ee85cc369f5b8d7fe6e62ff4e7bf3a9ec8) | 2026-09-04 | fix: temp disable /messages/count_tokens | pending audit | — |
| [7c044d7c5](https://github.com/QuantumNous/new-api/commit/7c044d7c5c2d2beadf16b21910950f8f593bc3ef) | 2026-09-04 | feat(relay): explicit @ model modifiers and canonical billing identity | pending audit | — |
| [6b659fd61](https://github.com/QuantumNous/new-api/commit/6b659fd61c50e35d559c41520a0fff7b8aea56a4) | 2026-09-05 | fix(relay): preserve reasoning effort without implicit remapping | pending audit | — |
| [d5803532b](https://github.com/QuantumNous/new-api/commit/d5803532bdccde3a2b1583291f51e92d3519b1c6) | 2026-09-05 | docs: require expression pricing and consolidated tests | pending audit | — |
| [eb99ab1b4](https://github.com/QuantumNous/new-api/commit/eb99ab1b40343c3317bb47981cccdbb2b159a5fa) | 2026-09-05 | feat(billing): add built-in expression pricing for gpt-6-astra | pending audit | — |
| [2cf177ac4](https://github.com/QuantumNous/new-api/commit/2cf177ac487e62c627c7d423b65735ba2481ef4f) | 2026-09-06 | perf(common): 批量复制 RawMessage，优化请求深拷贝 (#7221) | pending audit | — |
| [49ec46966](https://github.com/QuantumNous/new-api/commit/49ec4696682530781a036eab1ac195f0b04706c0) | 2026-09-06 | fix(relay): apply model-specific OpenAI chat capabilities (#7211) | pending audit | — |
| [d8cb17744](https://github.com/QuantumNous/new-api/commit/d8cb177440ceaae422d5bfd96c258d47af4e0f1d) | 2026-09-06 | feat(security): add access token management and audit logs | pending audit | — |
| [9a8674425](https://github.com/QuantumNous/new-api/commit/9a8674425c5a43435a259b58bb928a55d26be990) | 2026-09-06 | fix(db): avoid redundant schema migrations on restart | pending audit | — |
| [45c3fbe8a](https://github.com/QuantumNous/new-api/commit/45c3fbe8aeb049f03c13e14298a40b87aea5bd87) | 2026-09-06 | fix(security): bind verification proofs to sessions and actions | pending audit | — |
| [3e84ec0ab](https://github.com/QuantumNous/new-api/commit/3e84ec0ab8239cf2277f8a10d45566630a9c10fa) | 2026-09-06 | feat(auth): migrate Telegram to unified OAuth | pending audit | — |
| [a8729b5c3](https://github.com/QuantumNous/new-api/commit/a8729b5c3709cc01d88fc3f2db5b91347fc9129e) | 2026-09-06 | feat(security): require verification for access token management | pending audit | — |
| [0973dc2b8](https://github.com/QuantumNous/new-api/commit/0973dc2b8f550de71b75fdd3805576d3ce6ccf42) | 2026-09-06 | feat(security): harden account binding and password changes | pending audit | — |
| [3f8a50cf8](https://github.com/QuantumNous/new-api/commit/3f8a50cf8877683669cd812240a0beaf7b171c32) | 2026-09-06 | feat(audit): complete token and quota operation records | pending audit | — |
| [521cebf58](https://github.com/QuantumNous/new-api/commit/521cebf585efc2e782dd9fb93d0f66752c8d3c32) | 2026-09-06 | fix(dashboard): simplify completed setup guide | pending audit | — |
| [6f2333990](https://github.com/QuantumNous/new-api/commit/6f2333990613bf3e9dd36f541fc380148c7b5175) | 2026-09-06 | feat(auth): unify login verification and secure account deletion | pending audit | — |
| [0c76e4dae](https://github.com/QuantumNous/new-api/commit/0c76e4dae77a279e015329b7478e6f02d6b62edd) | 2026-09-06 | feat(models): rework model/vendor management and pricing | pending audit | — |
| [3b4652269](https://github.com/QuantumNous/new-api/commit/3b4652269a6a6d9e2c8650a84ee8c4e447e6473b) | 2026-09-07 | feat(ali): support wan3.0 all-in-one video models | pending audit | — |
| [6e10f9bc9](https://github.com/QuantumNous/new-api/commit/6e10f9bc927a4eae889864a6ef601359d53526b9) | 2026-09-07 | fix(relay): preserve Kimi K3 dynamic tool loading messages | pending audit | — |
| [7bbe85bcb](https://github.com/QuantumNous/new-api/commit/7bbe85bcb09546e0b89572bf97198fc94889be3d) | 2026-09-07 | refactor(json): route JSON helpers through a host-injectable codec | pending audit | — |
| [387a40914](https://github.com/QuantumNous/new-api/commit/387a40914853310d69adc2f52474134ced5f4811) | 2026-09-07 | fix(web): keep drawer popups interactive and shim storage in tests | pending audit | — |
| [5c7cca015](https://github.com/QuantumNous/new-api/commit/5c7cca015525212a7ac2741da7f3b51fa2e30db0) | 2026-09-07 | fix(perf): return hourly success-rate series for model health bar | pending audit | — |
| [6298b0f32](https://github.com/QuantumNous/new-api/commit/6298b0f3238461b9629dfc1c00866f8325123aa1) | 2026-09-07 | fix(plugin): suppress factory layer when disabling an overridden task plugin | pending audit | — |
| [92bc7ff73](https://github.com/QuantumNous/new-api/commit/92bc7ff73c5ef215496d09d3e4b5769c9e35006b) | 2026-09-07 | fix(plugins): make sunoapi alias-safe and lock alias echo across built-ins | pending audit | — |
| [210734bb7](https://github.com/QuantumNous/new-api/commit/210734bb73bc3c6e37548af90360aa4226566fe2) | 2026-09-07 | refactor(task): remove the custom-plugin layer switch | pending audit | — |
| [bee45b58a](https://github.com/QuantumNous/new-api/commit/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1) | 2026-09-07 | fix(web): switch the pricing card grid to three columns at xl | pending audit | — |
| [75e533209](https://github.com/QuantumNous/new-api/commit/75e533209490a8ef3a8b5e3d93e4dac03ba19bcf) | 2026-09-08 | feat(pricing): support site currency in pricing editors | pending audit | — |
| [99974a814](https://github.com/QuantumNous/new-api/commit/99974a814f00a26dfa7431beb313e487529bbeed) | 2026-09-08 | feat(plugins): extend plugin metadata and icon support | pending audit | — |
| [984330920](https://github.com/QuantumNous/new-api/commit/984330920061e014159c7581b8fcdb726de2c247) | 2026-09-08 | feat(web): improve plugin management and marketplace | pending audit | — |
| [eb76b136b](https://github.com/QuantumNous/new-api/commit/eb76b136b85ecba9d6ad19c714c5781e51815530) | 2026-09-08 | feat(channels): improve plugin channel setup and icons | pending audit | — |
| [0e0ba152b](https://github.com/QuantumNous/new-api/commit/0e0ba152bdcc6891f6053047ccf14d41b3cad60a) | 2026-09-08 | feat(pricing): improve pricing editors and log display | pending audit | — |
| [71c1fd7ca](https://github.com/QuantumNous/new-api/commit/71c1fd7caad738db4d13aabbf28eeadb293d0cfe) | 2026-09-08 | feat(models): improve model listing, pricing and visibility filters | pending audit | — |
| [a5e41a893](https://github.com/QuantumNous/new-api/commit/a5e41a893379e49bd9e1d025e775c04df8961c95) | 2026-09-08 | feat(usage-logs): refine mobile layout and keep quick actions visible | pending audit | — |
| [2bec37062](https://github.com/QuantumNous/new-api/commit/2bec370629aa72d74d3f598b953a4d33b8bcbf7d) | 2026-09-08 | feat(web): refine API key and user quota displays | pending audit | — |
| [8f72ecbbf](https://github.com/QuantumNous/new-api/commit/8f72ecbbfd86ded5ee15373921533eed3d334a9a) | 2026-09-08 | feat(usage-logs): add searchable group filter | pending audit | — |
| [551bb63ed](https://github.com/QuantumNous/new-api/commit/551bb63edf4007d7c4b0930504faf6db87012d73) | 2026-09-08 | fix(keys): show desktop quota amounts side by side | pending audit | — |
| [bd22e45a7](https://github.com/QuantumNous/new-api/commit/bd22e45a740a7c02c328704dc419d8795237cb74) | 2026-09-08 | style(keys): widen the desktop quota column | pending audit | — |
| [950644c9d](https://github.com/QuantumNous/new-api/commit/950644c9d54445bdd8796643e4e2e18e13167a4c) | 2026-09-08 | fix(keys): preserve spacing after desktop quota content | pending audit | — |
| [524455fac](https://github.com/QuantumNous/new-api/commit/524455fac3c438321df4ae9ed4ffd11bc635cc4f) | 2026-09-08 | feat(redemptions): add batch deletion and optional file exports | pending audit | — |
| [fff0635bb](https://github.com/QuantumNous/new-api/commit/fff0635bb14b8ec5f10df9e582a83591df841902) | 2026-09-08 | docs: update project architecture and Go conventions | pending audit | — |
| [ebe4c368f](https://github.com/QuantumNous/new-api/commit/ebe4c368f28787919ea478c0abf1ea7101978179) | 2026-09-08 | refactor: modernize Go code conventions | pending audit | — |
| [ea7cb0ba4](https://github.com/QuantumNous/new-api/commit/ea7cb0ba4e0f82e2bfa5e55752eb68bdf902f71b) | 2026-09-08 | refactor(web): unify table cells and quota details | pending audit | — |
| [9bf328d97](https://github.com/QuantumNous/new-api/commit/9bf328d9749751757d5d6b74088d514813a618bd) | 2026-09-08 | fix: preserve provider fields in Sora video queries | pending audit | — |
| [4fc9d1f1f](https://github.com/QuantumNous/new-api/commit/4fc9d1f1fa77c0cfdd9719cb59ff9ecc9885d66a) | 2026-09-09 | fix(options): rebuild options table primary key and stop pricing writes resetting rows | pending audit | — |
| [c79b74b68](https://github.com/QuantumNous/new-api/commit/c79b74b68358180c68440057596bdc34a99cc649) | 2026-09-09 | fix(frontend): deduplicate /api/status requests (#7189) | pending audit | — |
| [876903a8e](https://github.com/QuantumNous/new-api/commit/876903a8eb22c44e395c03da38f6701c650651ae) | 2026-09-09 | fix: 修正火山方舟渠道获取模型列表的端点路径 (#7203) | pending audit | — |
| [d52bdc0b4](https://github.com/QuantumNous/new-api/commit/d52bdc0b4087d50d87eb06387e86b2be53e85cd4) | 2026-09-09 | feat(billing): add time-based pricing editor and expression previews | pending audit | — |
| [12be9975c](https://github.com/QuantumNous/new-api/commit/12be9975c0bf01fa175a2bb3360607767c8ba5fb) | 2026-09-09 | fix(web): unify server error notifications | pending audit | — |
| [a20574136](https://github.com/QuantumNous/new-api/commit/a20574136b2746e9afc4b268c99cf99b3f6cc68b) | 2026-09-09 | fix(alibaba): correct Wan model protocols and usage accounting | pending audit | — |
| [7cf9b473f](https://github.com/QuantumNous/new-api/commit/7cf9b473f61eb7dc09f6f0782192f17595140a08) | 2026-09-09 | fix(web): keep model pricing content in one scroll area | pending audit | — |
| [064ed943e](https://github.com/QuantumNous/new-api/commit/064ed943e1ac40e3eaca1b58ffb7fa5dacb3fde3) | 2026-09-09 | feat(billing): support fixed per-request expression pricing | pending audit | — |
| [bdef11750](https://github.com/QuantumNous/new-api/commit/bdef117505247769268b209665fb3ad7554c3da7) | 2026-09-09 | fix: restore add split button in advanced custom routes (#7289) | pending audit | — |
| [b6566f33d](https://github.com/QuantumNous/new-api/commit/b6566f33d908fee574c8a6da2a23c4fd5df7353c) | 2026-09-11 | feat: clarify passkey website configuration | pending audit | — |
| [3e1b8b153](https://github.com/QuantumNous/new-api/commit/3e1b8b15324941ff20c77616737d8dd984582d33) | 2026-09-11 | feat(plugins): display localized changelogs with English fallback | pending audit | — |
| [3cea2bf79](https://github.com/QuantumNous/new-api/commit/3cea2bf799a61e07ad53368538fdb7064b017d77) | 2026-09-11 | feat(relaykit): preserve cached input token breakdowns | pending audit | — |
| [f362c7c51](https://github.com/QuantumNous/new-api/commit/f362c7c51b86a97e1fc72e4d48280cf53a5d2cb9) | 2026-09-11 | feat(billingexpr): support image cache and quantity variables | pending audit | — |
| [f064bffa2](https://github.com/QuantumNous/new-api/commit/f064bffa2b65dd2c6348b375f8b91bab41aabc19) | 2026-09-11 | fix(billing): validate image quantities before reserving quota | pending audit | — |
| [f256e40bc](https://github.com/QuantumNous/new-api/commit/f256e40bcb29292376edb5f0ba2e74ffa463aced) | 2026-09-11 | feat(billing): add expression defaults for GPT image models | pending audit | — |
| [25ec832fa](https://github.com/QuantumNous/new-api/commit/25ec832faa48031dd74f6fff0f58390e29a79f7c) | 2026-09-11 | feat(pricing): convert legacy prices into expression drafts | pending audit | — |
| [39294418a](https://github.com/QuantumNous/new-api/commit/39294418af4c920950be1b8c1fed0ed0d2bea52e) | 2026-09-11 | feat(web): extend expression pricing editors and usage details | pending audit | — |
| [b3e279464](https://github.com/QuantumNous/new-api/commit/b3e279464c82d6b1bd9fca6ce27f67c4c9246fec) | 2026-09-11 | feat(web): review legacy pricing conversion before applying drafts | pending audit | — |
| [505805a4c](https://github.com/QuantumNous/new-api/commit/505805a4c3ab55fbcf6227ec110226ff1c193e0b) | 2026-09-11 | feat(web): unify channel setup and refine model and settings editors | pending audit | — |
| [d4c26bfb8](https://github.com/QuantumNous/new-api/commit/d4c26bfb8dcb7434a0bc1e0d6153e848d86c39b4) | 2026-09-11 | fix(channels): allow editing multi-key selection strategy | pending audit | — |
| [ab489ab88](https://github.com/QuantumNous/new-api/commit/ab489ab8842b26f3dbc2d7a384e7c0ab0f700e0e) | 2026-09-11 | feat(channels): add plugin extensions to provider and model selection | pending audit | — |
| [251b76d86](https://github.com/QuantumNous/new-api/commit/251b76d8633ec4eeb1064dcdb5eb806ecf1a8668) | 2026-09-11 | feat(web): add administrator update reminders | pending audit | — |
| [74629e29f](https://github.com/QuantumNous/new-api/commit/74629e29f83f506bb523c5542aa851947bd423eb) | 2026-09-11 | feat(plugins): enhance task streaming and model pricing | pending audit | — |
| [385d2dfd1](https://github.com/QuantumNous/new-api/commit/385d2dfd10d821b25c8a6766bd16eea248cb1652) | 2026-09-11 | feat(auth): add safe multi-RP ID passkey support | pending audit | — |
| [129f21b69](https://github.com/QuantumNous/new-api/commit/129f21b6942ed433fd7eea1239b4a24d8b58b48b) | 2026-09-12 | fix(plugins): normalize invalid UTF-8 in JSON state | pending audit | — |
| [c9a110190](https://github.com/QuantumNous/new-api/commit/c9a110190c5241c24d9d66de340431f5e9873db6) | 2026-09-12 | fix(channels): show built-in base URLs as placeholders | pending audit | — |
| [be36cbb8f](https://github.com/QuantumNous/new-api/commit/be36cbb8facf99d523197f9e18d02b7605331048) | 2026-09-12 | test(security): provide query client for passkey verification tests | pending audit | — |
| [007d69942](https://github.com/QuantumNous/new-api/commit/007d69942d24eeea9edd4665f812d07ed11b3b97) | 2026-09-12 | fix(model): migrate renamed prefill group unique indexes | pending audit | — |
| [2ba615761](https://github.com/QuantumNous/new-api/commit/2ba61576146f0583f789ee6845f2280cb86819ce) | 2026-09-12 | feat(web): share collapsible mobile table filters | pending audit | — |
| [043ff99a5](https://github.com/QuantumNous/new-api/commit/043ff99a51ecad8229389ddd04f45f4b25a23ac6) | 2026-09-12 | fix: handle legacy database constraints and scoped policies | pending audit | — |
| [33142f0ae](https://github.com/QuantumNous/new-api/commit/33142f0aee7c87b2110f25dbddcb861dbdc2c44e) | 2026-09-13 | fix: refine sign-in page behavior | pending audit | — |
| [7fd063819](https://github.com/QuantumNous/new-api/commit/7fd06381976cbea126d1f20973548bf60f20e37d) | 2026-09-13 | fix(auth): restore saved compatible passkey domains | pending audit | — |
| [815217ba6](https://github.com/QuantumNous/new-api/commit/815217ba648ff800c4f583fbfa36ba286cee6b2d) | 2026-09-14 | test(web): stabilize flaky frontend suite timeouts and motion visibility races (#7367) | pending audit | — |
| [d92612038](https://github.com/QuantumNous/new-api/commit/d926120384109a9e55b0cd54a06bb6e3ae860a2c) | 2026-09-14 | fix: unify model provider detection and add Wan icon (#7373) | pending audit | — |
| [d1c79d728](https://github.com/QuantumNous/new-api/commit/d1c79d7288221768a5f7270649d691ac5a137def) | 2026-09-14 | fix(dashboard): align weekly default range (#7355) | pending audit | — |
| [2509e25fa](https://github.com/QuantumNous/new-api/commit/2509e25fa0601d26f5b8fbb3194ec76689a91a77) | 2026-09-14 | fix(web): prevent combobox dropdowns opening on dialog autofocus (#7365) | pending audit | — |
| [76f7dafd2](https://github.com/QuantumNous/new-api/commit/76f7dafd2b82fc305533ce6a3065b3de2d338bae) | 2026-09-14 | fix(audio): normalize file extension case in GetAudioDuration (#7321) | pending audit | — |
| [04c64734c](https://github.com/QuantumNous/new-api/commit/04c64734cc7c2e58a9efd0b247182330f3f52cce) | 2026-09-14 | fix(pricing): keep model status bar spacing uniform (#7284) | pending audit | — |
| [9fe0457ee](https://github.com/QuantumNous/new-api/commit/9fe0457ee1f4b9de407a254500d54f5a8f41ee29) | 2026-09-14 | Add Responses WebSocket relay support (#5062) | pending audit | — |
| [8529f209c](https://github.com/QuantumNous/new-api/commit/8529f209c85913de9ec98c5af49dcfce4a41361a) | 2026-09-15 | feat: vllm channel && sglang channel (#7332) | pending audit | — |
| [2bfb89c1b](https://github.com/QuantumNous/new-api/commit/2bfb89c1b99d5eb7a799ba5706813614bfb6189a) | 2026-09-15 | fix(pricing): prevent sort menu layout shift (#7145) | pending audit | — |
| [8e5e09166](https://github.com/QuantumNous/new-api/commit/8e5e09166cf83731df1819fd1cb9c50ea2576ed6) | 2026-09-15 | fix(ollama): preserve tool calls from final stream frame / 保留流式末尾帧的 tool calls (#7376) | pending audit | — |
| [62f8db775](https://github.com/QuantumNous/new-api/commit/62f8db775bcdaa5da144d9c4a36f5ead82de3ac5) | 2026-09-15 | feat(channel): 修复获取DeepSeek余额错误 (#6814) | pending audit | — |
| [d3874db61](https://github.com/QuantumNous/new-api/commit/d3874db61fce61b6c0f5c37523b21912a3f2658d) | 2026-09-15 | feat(rate-limit): optimize in-memory limiter allocation and cleanup (#6807) | pending audit | — |
| [5caafd3d8](https://github.com/QuantumNous/new-api/commit/5caafd3d84dc74c8b0d081524f57a534b3980cb0) | 2026-09-15 | feat(ollama): add per-channel OpenAI-compatible chat switch (#7382) | pending audit | — |
| [fa90b2312](https://github.com/QuantumNous/new-api/commit/fa90b2312cfb686aaa6010f9280bffcf0bf6d391) | 2026-09-15 | fix(gemini): accept case-insensitive thinkingLevel and log canonical effort (#7387) | pending audit | — |
| [81336fc69](https://github.com/QuantumNous/new-api/commit/81336fc69b8a932e70c24a8dbf439bec94c98328) | 2026-09-15 | fix(gemini): reject :countTokens as an unknown route instead of relaying it as generateContent (#7388) | pending audit | — |
| [610334dbd](https://github.com/QuantumNous/new-api/commit/610334dbd760f1c5199a09ae5f860f11451f4c56) | 2026-09-15 | fix(relay): request stream usage on every cross-protocol conversion to OpenAI chat (#7389) | pending audit | — |
| [69a500298](https://github.com/QuantumNous/new-api/commit/69a50029819a26c53e6babd276d49cfe2f8880ad) | 2026-09-15 | feat(channel): per-route pass-through for advanced custom channels (#7386) | pending audit | — |
| [7209b6db9](https://github.com/QuantumNous/new-api/commit/7209b6db95ef33bfb0f6344ebf61c1fec9af780c) | 2026-09-17 | fix(middleware): 隐藏无可用渠道错误中的任务插件标识 (#7414) | pending audit | — |
| [57791e31c](https://github.com/QuantumNous/new-api/commit/57791e31c62bdf97df855f3b7dc912046b3bc990) | 2026-09-18 | docs(github): tighten issue and PR templates for pass-through and unfiltered AI text (#7438) | pending audit | — |
| [ed0ad6e3f](https://github.com/QuantumNous/new-api/commit/ed0ad6e3ff9f8785a19d93cba73cf06ef2219668) | 2026-09-18 | feat(channels): add compact quick options to channel editor | pending audit | — |
| [07578faf2](https://github.com/QuantumNous/new-api/commit/07578faf26d1a21c70bf0fbf29f12730a212c583) | 2026-09-18 | fix(billing): count upstream images by payload instead of data length | pending audit | — |
| [d82678a97](https://github.com/QuantumNous/new-api/commit/d82678a9708b611d52386c01f04238ec01f07463) | 2026-09-18 | docs: move billing rules to .agents/rules/billing.md behind a read gate | pending audit | — |
| [0cde9d94f](https://github.com/QuantumNous/new-api/commit/0cde9d94f6d3b77d5258ca6b36959f895d26f2a4) | 2026-09-18 | feat(channels): add floating model redirect workbench to channel editor | pending audit | — |
| [8b2c7105f](https://github.com/QuantumNous/new-api/commit/8b2c7105f91f2316f90eb86f9b1c6b98774c7105) | 2026-09-18 | feat(relay): classify the protocol outcome on StreamStatus | pending audit | — |
| [73a471f3a](https://github.com/QuantumNous/new-api/commit/73a471f3a8b1cdf5dfe371184dfc3579cdcbefcc) | 2026-09-18 | feat(policy): add request policies settings and routing decision records | pending audit | — |
| [8a11b4305](https://github.com/QuantumNous/new-api/commit/8a11b4305ed139b55ee91f914c6a19d59c783d72) | 2026-09-18 | refactor(relaykit): surface reasoning conversion diagnostics | pending audit | — |
| [a5b40663d](https://github.com/QuantumNous/new-api/commit/a5b40663d3307fc5011c85b83eb18bbaa33dbad2) | 2026-09-18 | perf(metrics): record relay outcomes at the request boundary and classify stream results | pending audit | — |
| [6237d9d77](https://github.com/QuantumNous/new-api/commit/6237d9d77eb0544329b88ff96d71c1715af4268f) | 2026-09-18 | fix(rate-limit): reserve model rate-limit slots and judge success by response outcome | pending audit | — |
| [75f3d246e](https://github.com/QuantumNous/new-api/commit/75f3d246e2b1d6a3ea56342d9bc82cb3e1d0b6e2) | 2026-09-18 | fix(responses-ws): carry stream_id through events and correlate errors | pending audit | — |
| [90134d5b6](https://github.com/QuantumNous/new-api/commit/90134d5b6bff1a66affa35c5bd8e90e3d74a93f8) | 2026-09-18 | feat(system-tasks): add filtered task history with cleanup | pending audit | — |
| [a8ed7f7c5](https://github.com/QuantumNous/new-api/commit/a8ed7f7c5f24e56c2f1612126d82e9fec625056c) | 2026-09-18 | fix(plugins/hailuo): bill only the dimensions each model family supports | pending audit | — |
| [e2471403c](https://github.com/QuantumNous/new-api/commit/e2471403c77957818b939ad86bbeccd051d2d042) | 2026-09-18 | fix(pricing): adjust billing expression condition display | pending audit | — |
| [42cbe6206](https://github.com/QuantumNous/new-api/commit/42cbe6206a62550896c8371d62a6f15bad5b3e05) | 2026-09-18 | chore(web): add intl-locale lint plugin and update agent rules | pending audit | — |
| [d80694366](https://github.com/QuantumNous/new-api/commit/d8069436612e08bd0d96169222b10031556d09a7) | 2026-09-18 | fix(web): tidy channel health policy layout | pending audit | — |
| [ae249f4ec](https://github.com/QuantumNous/new-api/commit/ae249f4ecbaf3ae9b1fc62cf377ca5a764b9a002) | 2026-09-18 | feat(responses-ws): extend channel support and share routing with HTTP | pending audit | — |
| [fa3cc1c6b](https://github.com/QuantumNous/new-api/commit/fa3cc1c6b9b13f7bf25c3e896d439185d326ac9c) | 2026-09-18 | feat(web): offer the Responses WebSocket toggle for advanced custom, sub2api and new-api channels | pending audit | — |
| [32ef6d216](https://github.com/QuantumNous/new-api/commit/32ef6d216f9fa0a2aa182bd8aad9a02daf3767c8) | 2026-09-18 | feat(web): add channel passthrough controls and usage guidance | pending audit | — |
| [9e905a83e](https://github.com/QuantumNous/new-api/commit/9e905a83e1d6c369b3aa43de4f04ab244cce3205) | 2026-09-18 | refactor: show subscription deductions and improve cost display (#7272) | pending audit | — |
| [ed7c4e35d](https://github.com/QuantumNous/new-api/commit/ed7c4e35d4297962991ac5f00eea504ceac0fbd0) | 2026-09-18 | feat(log): flag upstream response model mismatches (#7418) | pending audit | — |
| [e2bb05f70](https://github.com/QuantumNous/new-api/commit/e2bb05f70ed6b6725a83ff6f1c97dbd2c2f640d4) | 2026-09-18 | fix(relay): map Images output_tokens_details into img_o billing (#7410) | pending audit | — |
| [55a6cd2a4](https://github.com/QuantumNous/new-api/commit/55a6cd2a44eaf189bbd565dd2cdfa591d19b06d6) | 2026-09-18 | fix(responses): estimate usage for streams cut before terminal usage (#7427) | pending audit | — |
| [3524fe0b1](https://github.com/QuantumNous/new-api/commit/3524fe0b15794d8d19378827d36a7edc0b0e91ea) | 2026-09-18 | fix issue template (#7441) | pending audit | — |
| [2906e4f77](https://github.com/QuantumNous/new-api/commit/2906e4f779b715f282ae11203211dca77051d5af) | 2026-09-18 | fix(oauth): require account evidence before migrating legacy GitHub bindings | pending audit | — |
| [3e8c358da](https://github.com/QuantumNous/new-api/commit/3e8c358da09b4598a946712db8219ff44f197475) | 2026-09-18 | fix: forward reasoning_effort to zhipu upstream (#7124) | pending audit | — |
| [946c730ed](https://github.com/QuantumNous/new-api/commit/946c730ed00806650fef509c74a868dda2847f7c) | 2026-09-19 | perf: avoid repeated Claude tool-name lookups (#7447) | pending audit | — |
| [ea336ed66](https://github.com/QuantumNous/new-api/commit/ea336ed6654a97c0c27e004581578231e0d92824) | 2026-09-19 | fix(log): hide funding source labels when subscriptions are not in play (#7450) | pending audit | — |
| [96b0da227](https://github.com/QuantumNous/new-api/commit/96b0da2273a187b3fd9621f77b10dcebd046e2f6) | 2026-09-19 | refactor(log): 恢复费用气泡并用图标区分订阅来源 (#7451) | pending audit | — |
| [1ea24a050](https://github.com/QuantumNous/new-api/commit/1ea24a050d5e276584d744122810b8dc57b10f0e) | 2026-09-19 | docs: refresh project README across languages | pending audit | — |
| [e04c05c2b](https://github.com/QuantumNous/new-api/commit/e04c05c2b929c0df6cc35227f860cf6e19d480c7) | 2026-09-19 | fix(web): 修复小数输入限制和日志分组选项未遮挡的问题 (#7453) | pending audit | — |
| [b0bf2580e](https://github.com/QuantumNous/new-api/commit/b0bf2580e2491869ee9fe861c12b86153c3fe5f4) | 2026-09-19 | docs: restore README badge and partner placement | pending audit | — |
| [972aed197](https://github.com/QuantumNous/new-api/commit/972aed1972820389ea0b603ca58f03f846fbf790) | 2026-09-19 | fix(log): derive response model mismatch from names instead of a stored flag (#7464) | pending audit | — |
| [a89037d0b](https://github.com/QuantumNous/new-api/commit/a89037d0b9b065da8582959018321abbc48db549) | 2026-09-20 | fix(web): start linked-account verification from the provider button | pending audit | — |
| [ef70d1b79](https://github.com/QuantumNous/new-api/commit/ef70d1b79998db9bb32b6b79205afbc4b9f8716b) | 2026-09-20 | chore: drop trailing blank line from .gitignore | pending audit | — |
| [b932e6d87](https://github.com/QuantumNous/new-api/commit/b932e6d876cda4fa49528b5cdb873d9fc5e31b6f) | 2026-09-20 | fix(web): robustly display conditional task billing prices | pending audit | — |
| [9c3d3aeb3](https://github.com/QuantumNous/new-api/commit/9c3d3aeb3c30ea09c7ad0f810c86205c4da558d7) | 2026-09-20 | perf(web): lazy-load provider icons and reduce page rerenders | pending audit | — |
| [33320407f](https://github.com/QuantumNous/new-api/commit/33320407f4f5dcf5bc635ee6d73dcc31c8bcc031) | 2026-09-20 | fix(web): isolate OIDC discovery when saving OAuth settings | pending audit | — |
| [4c34f25a4](https://github.com/QuantumNous/new-api/commit/4c34f25a49f1cf491479e3842b2251e8a6908851) | 2026-09-20 | feat(channel): bind multiple task plugins to New API channels | pending audit | — |
| [2d7aef741](https://github.com/QuantumNous/new-api/commit/2d7aef7414e8671b1ac7db336bc170eeb7cc5e2b) | 2026-09-20 | fix(web): restore CC Switch model dropdown | pending audit | — |
| [6b638788c](https://github.com/QuantumNous/new-api/commit/6b638788c645a6c9164c5c6394827e3f5e3a1abd) | 2026-09-20 | fix(channels): preview upstream model changes before applying | pending audit | — |
| [db536ec8b](https://github.com/QuantumNous/new-api/commit/db536ec8bcbbc63034d009a7257ecee0f3468abf) | 2026-09-20 | fix(channels): simplify model redirects and clarify panel controls | pending audit | — |
| [58a9eff4c](https://github.com/QuantumNous/new-api/commit/58a9eff4c8421a6bbb04855e561310d3eeabd107) | 2026-09-20 | style: refresh logo | pending audit | — |
| [3fdf9083d](https://github.com/QuantumNous/new-api/commit/3fdf9083dc6bfc47fc2ad0de3fac327d749d778d) | 2026-09-20 | fix(settings): move documentation link to site settings | pending audit | — |
| [da2540dda](https://github.com/QuantumNous/new-api/commit/da2540dda1328040193f279a58c3e315083e416c) | 2026-09-20 | fix(channels): align card metrics and remove badge spacing | pending audit | — |
| [d904b9700](https://github.com/QuantumNous/new-api/commit/d904b9700015ad73285b0f0030c88eb6683fbeda) | 2026-09-20 | feat(settings): improve group configuration UX and drag sorting | pending audit | — |
| [585c4610e](https://github.com/QuantumNous/new-api/commit/585c4610e5d7103480620ab61954db5a5feac35b) | 2026-09-20 | feat(keys): show and copy configured API addresses | pending audit | — |
| [c49972441](https://github.com/QuantumNous/new-api/commit/c49972441e73f05207427567a2d9ad7c620db4bd) | 2026-09-20 | fix(web): keep mobile dialog actions within visible viewport | pending audit | — |
| [03563a4a7](https://github.com/QuantumNous/new-api/commit/03563a4a791629a811076f1cbcbecfbe2716eac2) | 2026-09-20 | feat(plugins): serve OpenAI Images API through task plugins | pending audit | — |
| [a5bf94022](https://github.com/QuantumNous/new-api/commit/a5bf940220604e5b9d150e2338bf6528dfbb8be4) | 2026-09-20 | fix(web): correct dialog viewport fallbacks and editor gutter alignment | pending audit | — |
| [2fddb863f](https://github.com/QuantumNous/new-api/commit/2fddb863f2219d9eacea5b899ee39b46f11adf33) | 2026-09-20 | feat(models): add bulk field selection to metadata sync | pending audit | — |
| [3abbb8198](https://github.com/QuantumNous/new-api/commit/3abbb8198e0468ac6e16eb0103c1d3642e2e7668) | 2026-09-20 | feat: record perf metrics when async tasks reach terminal status (#7481) | pending audit | — |
| [65d3a2171](https://github.com/QuantumNous/new-api/commit/65d3a2171fd11c65ad2e2e1f1d65723926659c81) | 2026-09-20 | fix(plugins): price only the resolutions each Seedance and Wan model offers | pending audit | — |
| [9978ee1e2](https://github.com/QuantumNous/new-api/commit/9978ee1e25a647bfe004e96c8719a2cb62c24732) | 2026-09-20 | feat(billing): configure trust threshold and input pre-consume multiplier | pending audit | — |
| [47713bcb1](https://github.com/QuantumNous/new-api/commit/47713bcb1749f81c3a48127c0150e4c6d4da35f1) | 2026-09-20 | feat: update plugins | pending audit | — |
| [9a0be8750](https://github.com/QuantumNous/new-api/commit/9a0be8750a6d736d9692535ed2cd68f8eec46529) | 2026-09-20 | fix(web): keep task pricing editable after a plugin narrows its enum values | pending audit | — |
| [9c293e8c0](https://github.com/QuantumNous/new-api/commit/9c293e8c02371bda844af79e3500ff2d516d1dda) | 2026-09-21 | test(billing): fix websocket rejection refund test after pre-consume dropped output estimation (#7491) | pending audit | — |
| [474ed66fb](https://github.com/QuantumNous/new-api/commit/474ed66fb14b0de30f82a1729b4f7cf3dab19d63) | 2026-09-21 | fix(plugins/alibaba): keep upstream metadata in openai_image render (#7507) | pending audit | — |
| [00e8a00cb](https://github.com/QuantumNous/new-api/commit/00e8a00cb4aebb4e029b5ff32b8fe1e98f0b0bc5) | 2026-09-21 | fix(web): include provider icons in Windows builds | pending audit | — |
| [e537dc380](https://github.com/QuantumNous/new-api/commit/e537dc380bb253d4f902ac033ab39dd2ca462b5e) | 2026-09-21 | fix(web): expose plugin activation after upload | pending audit | — |
| [c0cff23a3](https://github.com/QuantumNous/new-api/commit/c0cff23a3af8e68809647bd39ec204bedbea28af) | 2026-09-21 | fix(plugins): store task plugin source as longtext on MySQL and raise the upload cap to 8 MiB | pending audit | — |
| [2c175190c](https://github.com/QuantumNous/new-api/commit/2c175190c44a95c6af4877e901dc5211ef706979) | 2026-09-21 | perf(plugins): sync task plugins from hashes and load source only for changed rows | pending audit | — |
| [d61d6be75](https://github.com/QuantumNous/new-api/commit/d61d6be7593f99eacf9462e99ee13f0c432657f5) | 2026-09-21 | fix(task): accept any 2xx upstream status on task submission | pending audit | — |
| [54eee488b](https://github.com/QuantumNous/new-api/commit/54eee488bed3ec6b9659b3a792194b18c2dfad27) | 2026-09-21 | fix(web): isolate theme preferences in local storage | pending audit | — |
| [6e9de44a7](https://github.com/QuantumNous/new-api/commit/6e9de44a7dca08f44234ab9c623f6a93a174d0c4) | 2026-09-21 | fix(relayconvert): hoist Responses tool-output media into a user message (#7510) | pending audit | — |
| [4eb3b9160](https://github.com/QuantumNous/new-api/commit/4eb3b9160566dc4c1f4f0e9340de254f7febf056) | 2026-09-21 | fix(relayconvert): hoist Claude tool_result images and segment Responses reasoning items (#7512) | pending audit | — |
| [b6809a52d](https://github.com/QuantumNous/new-api/commit/b6809a52df88e8db5c8591b2d3788a05401271b7) | 2026-09-21 | fix(web): resolve safe constants in plugin metadata previews | pending audit | — |
| [0aec08fee](https://github.com/QuantumNous/new-api/commit/0aec08fee811ec6136828fda790551b49e410301) | 2026-09-21 | chore: credit #7444 author for the Claude tool_result fix landed in #7512 | pending audit | — |
| [9310231b3](https://github.com/QuantumNous/new-api/commit/9310231b3c27fea933e939b46cf26e0ce67192e3) | 2026-09-22 | fix(logs): keep model badge text readable and compact (#7504) | pending audit | — |
