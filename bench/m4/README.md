# M4 评测框架:`web_read` vs `web_fetch`

目的:在**真实长页面**上,用**冻结的测试集**回答三个问题——

1. 在固定预算(2k / 4k / 6k 字符)下,`web_read` 能拿回多少答案事实?
2. 算上"第一次没命中、要续读"的额外轮次,净省多少 token?
3. 失败的用例到底失败在哪?

> 与旧的 `bench/run-eval.ts` 并存、互不影响。旧脚本是合成数据的初步结果,本框架用于正式验收。

## 目录

```
bench/m4/
  schema.ts            用例格式与校验、focus 泄露检查
  match.ts             关键词集合匹配(顺序无关、标准化)
  evaluate.ts          单用例评测 + 确定性续读策略
  report.ts            分布统计与 Markdown 报告
  lock.ts              测试集冻结(hash 锁)
  run.ts               评测入口
  fetch-fixtures.ts    抓取真实页面为本地 fixture
  fetcher.default.ts   需要你接一次线:接到插件自己的抓取管线
  cases.template.json  用例模板(假数据,仅示范格式)
test/bench-m4.test.ts  框架自身的 19 个测试
```

## 工作流

```bash
# 1. 复制模板,写 ~30 个用例(见下文规则)
cp bench/m4/cases.template.json bench/m4/cases.json

# 2. 接好 fetcher.default.ts(或手动把页面存成 bench/m4/fixtures/<id>.md),然后抓取
node --experimental-strip-types bench/m4/fetch-fixtures.ts

# 3. 只在 dev 集上调参(默认 --split dev)
node --experimental-strip-types bench/m4/run.ts

# 4. 调完、不再改动后,冻结 test 集
node --experimental-strip-types bench/m4/run.ts --freeze

# 5. 在冻结的 test 集上出正式结果
node --experimental-strip-types bench/m4/run.ts --split test
```

`.gitignore` 增加(第三方页面正文不入库,只提交 `cases.json` 和 `cases.lock.json`):

```
bench/m4/fixtures/
bench/m4/results/
```

`package.json` 可加:

```json
"bench:m4": "node --experimental-strip-types --no-warnings bench/m4/run.ts",
"bench:m4:fetch": "node --experimental-strip-types --no-warnings bench/m4/fetch-fixtures.ts"
```

退出码:`0` 正常 · `1` 用法/IO 错误 · `2` 测试集锁校验失败。

## 写用例的规则

1. **页面**:2 万到 20 万字符(DSH `web_fetch` 默认上限是 20 万)。中英文各约一半;包含表格、代码块、有大量重复样板的页面(文档站、规范、长博客、README)。
2. **先写问题和 `focus`,再看答案。** `focus` 是模型会传给 `web_read` 的那句话。不要把答案原句抄进 `focus`;`run.ts` 会对"focus 已包含大半答案关键词"的用例发出泄露警告。
3. **事实 = 关键词集合,不是句子。** `{"all": ["20-byte", "SHA-1", "base object"]}`:全部出现才算命中。同义写法用 `any`。标识符里的下划线、连字符会保留(`min_trx_id`、`SHA-1`)。
4. **题型分布(建议 30 个)**:

   | kind | 数量 | 说明 |
   |---|---:|---|
   | single | 8 | 单个事实 |
   | multi | 6 | 答案分散在 2–3 个小节,至少 2 个事实 |
   | vague | 4 | `focus` 故意含糊 |
   | table | 3 | 答案在表格里 |
   | code | 3 | 答案在代码块里 |
   | negative | 3 | 页面里没有答案,`facts` 为空 |
   | 其他 | 3 | 按你的页面补充 |

5. **分 dev / test:** 约 10 个 dev、20 个 test,同一 kind 在两边都要有。**写完 test 用例后不要再看着它们调算法。**
6. 写完先跑 dev:凡是被标成 *Invalid* 的用例(事实在整页里都找不到),说明标准答案写错了,修正后再继续。

## 判定与指标

- **Pass**:每个事实的关键词集合都出现在返回文本中(标准化:NFKC、小写、去掉 Markdown 的 `*` 和反引号、折叠空白)。
- **Recall(passage)**:更严格的变体,要求同一事实的关键词出现在**同一个段落**里。
- **续读策略**:第一次调用没拿齐事实、且页面被截断时,框架模拟一个"模型":在还没读过的目录条目里,选**标题**与 `focus` 最匹配的一节,调用 `section` 续读,最多到 `--max-rounds`。标题没有任何信号时直接放弃(模型这时也只能乱猜)。这是对模型行为的**近似**,不是上限。
- **净节省** = 1 − (所有轮次 token ÷ `web_fetch` 整页 token),可以为负;"仅第一次调用"的节省单独列出。
- **Negative 用例**:不算召回,只报告 `focus` 在不可回答的问题上"匹配上了"的比例(越低越好)。
- **Invalid 用例**:不进入任何统计,单独列出。
- 报告给出 min / p25 / median / mean / p75 / max,以及每个失败用例缺哪个事实。

## 冻结机制

`--freeze` 会为 test 用例的定义和 fixture 内容记录 sha256(`notes` 不参与)。之后:

- 在 test 集上运行时,任何用例定义或页面内容的改动都会让运行失败(退出码 2)。
- 把已冻结的用例移出 test 集同样会被发现。
- `--freeze` 不会覆盖已变化的条目,除非加 `--force-refreeze`,而那意味着此前的结果作废。
- `--allow-unfrozen` 只用于试跑,报告会标注 **UNVERIFIED**。

## 已知局限(请在报告里如实写明)

- 关键词命中 ≠ 答案正确。它证明"证据在返回的文本里",不证明模型据此答对。想要端到端答对率,需要再接一个真实模型的盲评环节(本框架没有)。
- token 数是估算(CJK 约 1 token/字,其余约 4 字符/token),**比较比值,不要引用绝对值**。
- 续读策略是启发式近似。
- 页面是某一时刻的快照;页面更新后 fixture 的 hash 会变,锁会提醒你。
