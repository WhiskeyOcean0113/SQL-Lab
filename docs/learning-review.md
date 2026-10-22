# SQL Lab 学习效果评审

日期：2026-10-22
范围：`content/` 下全部 43 篇讲解、323 道练习，以及练习页、错题本（Mistake bank）的实际交互。

## 结论

内容是“对的”，但不是“好学的”。

`npm run validate` 已经把正确性做得很好：每个示例都能运行，每个答案都和数据对得上，学习者不会碰到没教过的 SQL。但没有一条规则在检查这几件事：学习者有没有被迫动脑，做完有没有得到解释，学过的东西还会不会再出现。体检数据显示，问题集中在三处：

1. **练习能靠翻课文抄过去。** 88 道写查询题里，有 35 道和课文里的某个示例高度相似，其中 12 道逐字相同。
2. **反馈闭环是断的。** 写查询、找错、拼排这 209 道题，做对之后没有任何讲解；做错之后只有一层提示，没有“看答案”这条出路。
3. **学一次就结束。** 没有复习，没有混合练习，也没有章末综合题。课里教的 184 个 SQL 词汇里，有 70 个从没在任何练习中出现过。

课文本身的问题是广而浅。核心概念通常只有一两百字，“深入”一节反而更长；一课塞进 11–21 个加粗的小知识点；全书没有一张图。读起来像一本压缩过的参考手册，而不是一本带你理解的教科书。

下面依次是：体检数据、诊断、外部标准、改进方案，以及可以写进 validate 的新规则。

## 1. 体检数据

数据由两个脚本直接从 `content/` 算出（复用 `scripts/lib/build-content.ts`），见文末附录。

| 指标 | 结果 | 说明 |
|---|---|---|
| 讲解 / 练习 | 43 / 323 | 预测 114，找错 78，写查询 88，拼排 43 |
| 难度分布 | 1 级 115，2 级 168，3 级 40 | 3 级只占 12% |
| 写查询题与课文示例高度相似（bigram Jaccard ≥ 0.6） | 35 / 88（40%） | 其中 12 道相似度为 1，即逐字相同 |
| 提示里的代码覆盖答案 ≥ 60% 的标识符 | 7 / 209 | 看提示就等于看答案 |
| 预测题问的是行数，而 Run 按钮可以在提交前直接显示结果 | 81 / 114（71%） | 题型单一，而且可以先运行再选 |
| 预测题只有 3 个选项 | 70 / 114 | 另有 17 道，正确的数字就写在题干里 |
| 题干直接规定了输出列 | 132 / 209（63%） | 几乎没有需要自己规划的“业务问题” |
| 做对后能看到讲解 | 114 / 323 | 只有预测题有 `explain`，而且答错时不显示 |
| 课里 `introduces` 的 SQL 词汇 | 184 个 | 62% 出现在至少一道练习里；只有 37.5% 要求学习者自己写出来 |
| 课文中的图 | 0 | 43 课没有一张图或示意 |
| “深入”比“核心概念”长 | 33 / 43 | 核心概念最短的只有 90 个汉字（`distinct`） |
| 每课加粗的小知识点 | 11–21 个 | 单课新教 SQL 最多 17 个（`string-functions`） |
| 正文提到其他数据库 | 92 处 | MySQL、SQLite、Oracle、SQL Server |
| 前向引用（“第 N 章会学”“下一篇”等） | 31 处 | |
| 用到 ≥ 2 个其他章节知识的练习 | 81 / 323 | 没有任何一道题是专门用来复习的 |

## 2. 诊断：为什么学不到东西

### 2.1 练习在考“找”和“抄”，不在考“想”

几个例子：

- `/Users/whiskeyocean/Documents/MyProjects/SQL Lab/content/lessons/inner-join/exercises/07-write-canada.yaml` 的答案，和 inner-join 课“变体”一节的示例逐字相同。
- `/Users/whiskeyocean/Documents/MyProjects/SQL Lab/content/lessons/select-basics/exercises/08-write-tax.yaml`：课文里原样有 `price * 1.1 AS price_with_tax`。
- `/Users/whiskeyocean/Documents/MyProjects/SQL Lab/content/lessons/joins-aggregation/exercises/06-write-spent.yaml`：就是课文第一个示例去掉 `ORDER BY`。
- `/Users/whiskeyocean/Documents/MyProjects/SQL Lab/content/lessons/group-by/exercises/08-write-orders-per-month.yaml` 标为 3 级（最难），提示里写出了完整的 `GROUP BY date_trunc('month', ordered_at)`，课文“变体”里也有同一句。
- `/Users/whiskeyocean/Documents/MyProjects/SQL Lab/content/lessons/group-by/exercises/01-predict-status-groups.yaml`：题干说“状态共有 5 种”，问返回几行，选项是 1、5、24。

于是做题的过程变成：回到课文，找到相似的那段，改一两个词，提交。这种模式匹配能通过练习，但不会形成可迁移的理解。

这恰好错过了 SQL 最难的部分。Taipalus 2020 分析了 987 名学生的查询：语法和语义错误学生大多能自己改掉，真正导致失败的是逻辑错误，比如漏掉表达式、分组列多了或少了、比较运算符用错、漏掉 join、漏掉排序列。作者建议教学应强调自然语言与 SQL 的对应模式、查询规划，以及“模糊程度逐渐增加的练习”。现在 63% 的题把输出列写死了，题目替学习者完成了规划。

### 2.2 反馈闭环断了

我在练习页实际提交了一个错误答案（group-by 第 7 题：用 `WHERE` 去掉了 NULL 组，也没有四舍五入）。得到的反馈是“行数不对：预期 6 行，你的结果有 5 行”，外加一张差异表。差异表本身做得很好，但是：

- **只说哪里不同，不说为什么。** 漏掉 NULL 组正是课文“常见错误”里写过的错误，系统却认不出来，只能给出泛泛的行数提示。
- **提示只有一层。** 看完 Show hint 还不会，就只能卡着。没有逐级提示（先指方向，再讲原理，最后给出答案），也没有“看答案”。
- **做对之后什么也没有。** 只显示“做对了”和下一题按钮。没有参考答案，没有“为什么这样写”，也没有其他正确写法可以对比。学习者无法确认自己是真懂了，还是碰巧对了。
- **预测题答错时只显示“答案不对。”** `explain` 只在答对时出现，错误选项为什么错，没有任何说明。

Shute 2008 的综述结论是：形成性反馈要具体、及时，解释性反馈（elaborated feedback）优于只判断对错的反馈（verification）。现在系统在 209 道题上只做到了判断对错再加一张差异表。

### 2.3 学一次就结束：没有复习，也没有混合

- 每道题都挂在一课下面，只考这一课。没有章末测验，没有混合练习，没有间隔复习。
- 错题本的 Try again 重做的是同一道题。第二次做对，往往只是记住了答案，不代表掌握了技能。
- Dunlosky 等 2013 评估了 10 种常用学习方法，只有两种被评为“高效用”：练习测试和分散练习。这门课有练习测试，但完全没有分散练习。Rohrer 等 2020 的课堂随机对照实验（787 名学生）中，交错练习组在突击测验中的得分是 61%，对照组 38%，d = 0.83。

### 2.4 教了没练

184 个 `introduces` 中，有 70 个从没在任何练习里出现。缺口较大的几课：

- `window-offsets`：`lead()`、`last_value()`、`RANGE`、`PRECEDING`、`CURRENT ROW`、`UNBOUNDED FOLLOWING`。窗口帧整块没有练过。
- `string-functions`：17 个里有 10 个没练，包括 `length()`、`replace()`、`TRIM`、`strpos()`。
- `arithmetic`：`trunc()`、`ceil()`、`floor()`、`abs()`、`power()`、`mod()` 全部没练。
- `dates-times` 的 `age()`、`to_char()`；`group-by` 的 `string_agg()`、`ROLLUP`；`outer-joins` 的 `RIGHT`；`views` 的 `MATERIALIZED`。

没练过的东西等于只读过一遍，而“重读”在 Dunlosky 的评估里属于低效用的方法。

### 2.5 课文：广而浅，像一本词典

以 GROUP BY 为例：核心概念 155 个汉字，一个示例加一条规则；“深入”305 字，讲了 NULL 分组、结果顺序、函数依赖、`ROLLUP`、位置写法五件事。全书有 33 课的“深入”比“核心概念”长。null-logic 课里，三值逻辑的真值表放在了“深入”，而它是这一课最核心的内容。

具体表现：

- **一课的新东西太多。** 每课有 11–21 个加粗小标题。`string-functions` 一课新教 17 个词汇，`data-types` 13 个，`arithmetic` 和 `window-offsets` 各 11 个。每个知识点只有 2–4 句话，读完之后每个都“见过”，没有一个“想透”。
- **给初学者讲方言细节。** 第 2 课（`sql-syntax`）就讲到 Oracle 的 `dual`、MySQL 的 `#` 注释、`$$` 字符串、标识符转大写还是小写。全书 92 处提到别的数据库。按 Mayer 的一致性原则（coherence），与当下学习目标无关的材料会降低学习效果，哪怕它本身是对的、有趣的。
- **先抽象，后具体。** 学习者写出第一条 `WHERE` 之前，第 0 章的 4 课先讲词法单元、手册的语法记号，以及包含 `GROUP BY`、`HAVING` 的 8 步逻辑执行顺序。对零基础的人来说，这些是没有挂靠点的抽象规则。
- **“以后会讲”太多。** 正文有 31 处前向引用。`CLAUDE.md` 自己写着 “This is explained later” is not an explanation，正文却还在大量这样做。
- **规则有了，“为什么”很薄。** 大多数规则只配一句理由，就转向下一个知识点。

### 2.6 没有图：最需要“看见”的概念全靠文字

JOIN（行怎么配对）、GROUP BY（行怎么分组再合并）、窗口函数（分区、排序、帧怎样滑动）、逻辑执行顺序（中间表怎样一步步变化），这些都是空间性的概念。现在只能靠一段文字加一个最终结果表。inner-join 课里有一张“逐行看配对”的追踪表，是全书最接近可视化的地方，讲得也最清楚，但它只是个例。

相关研究：DBQA（Akhuseyinoglu 等，ITiCSE 2022）按 FROM、WHERE、GROUP BY、HAVING、SELECT、ORDER BY 的顺序分步显示中间结果。在 131 名学生的课堂研究中，浏览的执行步骤越多，独立解题成功率越高，调试尝试越少，放弃率越低；只带文字注释的示例则没有这种关联。

### 2.7 读的时候是被动的

每课有 8–16 个 Run 按钮，但没有一个问题跟着：点一下，看一张表，往下滚。Koedinger 等的 doer effect 研究发现，在交互式课件里，做练习与学习成果的关联约为阅读的 6 倍（后续在 7 门课、18,546 名学生上复现，但多由同一家商业研究团队完成，也有一项研究没有发现这个效应）。PRIMM（Predict、Run、Investigate、Modify、Make）要求先预测，再运行。现在课文里的示例只有 Run；预测题也允许先 Run 再选。

## 3. 标准：一个“能学会”的学习网站应该做到什么

| # | 标准 | 依据 | SQL Lab 现状 |
|---|---|---|---|
| 1 | 每课有可测量的学习目标，每道题对应一个目标 | 建构式对齐；Quality Matters 标准 2、3 | 缺失：只有一句 summary，练习只指向课文小节 |
| 2 | 学的时候在做，而不只是在读 | doer effect；PRIMM | 缺失：课文里没有检查点 |
| 3 | 从示例平滑过渡到独立解题：完整示例 → 补全题 → 独立写 | 渐退示例（Renkl & Atkinson）；专长逆转效应（Kalyuga） | 部分：有示例和拼排，缺补全题；写查询题离示例太近，等于没有“退” |
| 4 | 解释性反馈，加上逐级提示，最后一级给出答案 | Shute 2008；智能导师系统的提示序列 | 部分：有差异表，缺解释和逐级提示 |
| 5 | 要求学习者解释自己的答案 | Bisra 等 2018 元分析：g = 0.55，计算机学科子集 g = 0.76 | 缺失 |
| 6 | 间隔、检索、交错 | Dunlosky 等 2013；Rohrer 等 2020 | 缺失 |
| 7 | 针对已知误解设计题目和反馈 | Taipalus & Perälä 2019；Taipalus 2020；Miedema 等 2021 | 部分：课文“常见错误”写得好，系统却认不出这些错误 |
| 8 | 可视化中间结果 | DBQA；SQLVis | 缺失 |
| 9 | 去掉无关材料，突出结构，分段呈现，先教关键概念 | Mayer 多媒体学习原则 | 部分：视觉设计克制，但内容密度和枝节违反一致性原则 |
| 10 | 用学习数据检验内容：知识组件、学习曲线、题目分析 | KLI 框架；DataShop 的学习曲线诊断 | 缺失：`attempts` 日志已经有了，还没用上 |

## 4. 改进方案（按投入产出排序）

### P0：只改内容和少量代码，效果最大

**1. 重写练习，切断“抄”的路。**

- 写查询题不能是课文示例的改写。换问题、换表、换组合：同一个技能，不同的表面。
- 提示改成三级，`hints: [指方向, 讲原理, 给答案]`。第一级只指出该看哪里（“想想 NULL 会进哪一组”），第二级讲原理，第三级给出答案，并把这道题记为“看过答案”：它进入错题本，不算完成。
- 预测题：提交之前禁用 Run，先预测，再运行验证。题型从“几行”扩展到“哪几行”“这一格是什么值”“会不会报错”“下面哪条与它等价”。选项至少 4 个，干扰项来自真实的误解。
- 一部分题去掉“列依次为……”，改成业务问题（“哪些顾客注册了却从没下过单？”），评分时只检查关键列。

**2. 每道题都要有讲解，做对和放弃时都显示。**

新增所有题型必填的 `explain`：参考答案、每个子句的作用，以及一种常见错误写法为什么错。做对之后，把参考答案和学习者的答案并排显示，并可以问一句“你的写法和参考答案有什么不同？”（自我解释）。预测题的每个选项都写 `why`，答错时显示所选选项的 `why`。

**3. 让系统认得出常见错误：`traps`。**

这是最值得做的一项，也最符合本项目“按结果评分”的原则。每道题列出几条已知的错误写法，以及针对它们的说明：

```yaml
traps:
  - sql: |
      SELECT category_id, count(*) AS products, round(avg(price), 2) AS avg_price
      FROM products
      WHERE category_id IS NOT NULL
      GROUP BY category_id;
    say:
      zh: 没有分类的商品被 `WHERE` 筛掉了。题目要求它也算一组，而 NULL 本来就会自成一组。
      en: The product without a category was filtered out by `WHERE`. The task counts it as a group, and NULL forms a group of its own anyway.
```

评分时，如果学习者的结果和某条 trap 的结果相同，就显示这条 trap 的说明，而不是泛泛的“行数不对”。trap 可以直接取自课文的“常见错误”，全书已经写了 238 条。validate 可以检查：trap 能运行；trap 的结果和正确答案不同；每课的每条“常见错误”至少被一道题的 trap 或一道找错题覆盖。

### P1：结构

**4. 学习目标与技能清单。**

`meta.yaml` 增加 `objectives`，用可测量的动词来写：“能写出……”“能预测……”“能解释……为什么……”。每道练习增加 `objective`。validate 检查：每个目标至少 2 道题，其中至少 1 道写查询；每个 `introduces` 要么被练习覆盖，要么显式列入 `reference: [ROLLUP]`，表示只要求了解、不要求掌握。

**5. 调整课文模板。**

- 核心概念是主体：至少一张追踪表或一组分步图；用学习者已经会的东西做类比；每条规则写出“为什么”。
- 每课新教的 SQL 不超过 8 个，超过就拆课（`string-functions`、`data-types`、`arithmetic`、`window-offsets`）。
- “深入”一分为二：初学者马上会碰到的边界情况留在正文；方言差异和冷门写法收进默认折叠的“参考”块。正文不提别的数据库，除非学习者马上就会遇到。
- 第 0 章先具体后抽象：第一课就让学习者写出 `SELECT … FROM … WHERE`；词法规则和手册记号分散到第一次用到的地方再讲；8 步逻辑执行顺序每次只展开已经学过的步骤。`CLAUDE.md` 已经要求“骨架随课程生长”，只是第 0 章本身违反了这一点。
- 去掉前向引用。validate 对“第 N 章会”一类的句子给 warning。

**6. 在课文里加检查点。**

新增 ` ```sql check ` 块：一条查询、一个问题和几个选项，必须先作答才显示运行结果。在“核心概念”和“示例”之后各放一个。这是把 doer effect 和 PRIMM 搬进课文的最低成本做法。

**7. 分步可视化。**

新增 ` ```sql steps ` 块：作者写几条递进的查询，每条配一句说明，例如“FROM：24 行订单”“WHERE：剩下 22 行”“GROUP BY：按 status 着色，分成 5 组”“SELECT：每组合并成一行”。界面逐步翻页显示中间表，分组用颜色区分，JOIN 显示两边的配对关系。validate 照常逐条运行。优先给 JOIN、GROUP BY、HAVING、窗口函数、子查询和逻辑执行顺序这几课做。

### P2：长期记忆和迁移

**8. 复习队列。**

在 `attempts` 之上加一个调度：已完成的课程按 1、3、7、21 天的间隔推送 3–5 道题，混合不同章节。错题本的 Try again 改用同一技能的变体题（`variants:`，换条件、换列或换表），避免背答案。掌握标准从“连续做对 2 次”改为“间隔至少一天，连续做对 2 次”。

**9. 章末综合题和第二个数据集。**

每章末尾放 3–5 道综合题：需要同时用到本章和前几章的知识，题干是业务问题，不给列名提示。全课最后做一个小项目，用一个学习者没见过的数据集（比如图书馆借阅或航班），检验能否迁移到新的表结构。shop 继续做主数据集：它小、能手工追踪，这是优点。

**10. 用学习数据检验内容。**

`attempts` 已经记录了每次提交。按目标统计首次提交正确率、平均提交次数、看答案的比例、在错题本里停留的时间。按题目看：首次正确率高于 95% 的题，可能太简单或泄露了答案；低于 20% 的题，可能题干有歧义。这正好可以作为 `CLAUDE.md` 里那个还没设计的 “analyse my mistakes” 工作流。

## 5. 把工程化校验扩展到教学质量

现在 validate 管的是“对不对”。建议再加一层 `npm run audit`，管“好不好学”。先以 warning 上线，规则稳定后再把一部分升为 error：

| 规则 | 阈值 | 级别 | 当前违反 |
|---|---|---|---|
| 写查询题答案与课文任一 SQL 块的 bigram Jaccard | ≥ 0.6 | error | 35 |
| 提示中的代码覆盖答案的标识符 | ≥ 60% | warning | 7 |
| 预测题的正确数字出现在题干里 | 出现即报 | warning（人工复核） | 17 |
| 每道题都有 `explain` | 必填 | error | 209 |
| 预测题每个选项都有 `why` | 必填 | warning | 114 |
| `introduces` 未被任何练习覆盖，也未列入 `reference` | 出现即报 | error | 70 个，分布在 23 课 |
| 每个目标至少 2 道题，其中至少 1 道写查询 | — | error | 尚无目标 |
| 每条“常见错误”被 trap 或找错题覆盖 | — | warning | 238 条，对应 78 道找错题 |
| 每课 `introduces` 的数量 | ≤ 8 | warning | 7 课 |
| “深入”不长于“核心概念” | — | warning | 33 课 |
| 正文前向引用 | 出现即报 | warning | 31 处 |
| 每课“问行数”的预测题比例 | ≤ 50% | warning | 全书 71% |
| 每章有综合题，每题至少用到 3 课的 `introduces` | — | error | 0 章 |

但内容审计只能证明题目设计合理，不能证明“学会了”。真正的验收是测量：每章准备一份 8–10 题的小测，题目与练习同构但不重复；读这一章之前做一次，学完一周后再做一次。前后两次的差值才是这门课的学习效果，也是以后每次修改内容时可以对比的基线。

## 6. 建议的执行顺序

1. **先做机制。** traps、`explain`、三级提示、`sql check` 块、`sql steps` 块和 audit 脚本。新字段决定了内容怎么写，所以代码先行。
2. **试点一章。** 选第 3 章（聚合）或第 4 章（连接）：Taipalus 列出的持续性错误（分组列、漏 join）集中在这里。按新模板重写课文，补齐检查点、分步可视化、traps、讲解和三级提示，再写一份前后测。
3. **自己用一周，对比数据。** 和没改过的章节比较首次正确率、提交次数和一周后的小测成绩。
4. **有效再推广。** 把模板和新规则写进 `CLAUDE.md` 和 validate，逐章修改；然后做复习队列。
5. **最后**做章末综合题、第二个数据集和学习分析。

## 7. 值得保留的部分

- validate 的正确性保障：示例能运行，答案与数据一致，词汇不越级。很多教材都做不到这一点。
- 按结果评分和差异表：缺失行、多余行、行数爆炸的提示，是 traps 的天然基础。
- “常见错误”一节扎根于研究，写得具体：错误写法、会发生什么、怎么改。
- shop 数据集小而可追踪，专门埋了陷阱：没下过单的顾客、没有分类的商品、NULL 城市。
- “示例”一节已经有子目标标签（subgoal labels）。inner-join 课逐行展示配对的追踪表，是全书讲得最清楚的地方，应该推广到其他课。

## 参考

- Koedinger 等，doer effect 及其复现：[The Doer Effect（UCF 汇编）](https://cdl.ucf.edu/wp-content/uploads/2024/02/The-Doer-Effect.pdf)，[VitalSource 复现](https://research.vitalsource.com/publications/the-doer-effect-replicating-findings-that-doing-causes-learning)，[七门课的大规模复现](https://research.vitalsource.com/publications/the-doer-effect-at-scale-investigating-correlation-and-causation-across-seven-courses)，[Runestone 上的零结果](https://ceur-ws.org/Vol-4019/paper_08.pdf)
- Dunlosky 等 2013：[APS 新闻稿](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- Rohrer 等 2020，交错练习：[IES 项目页](https://ies.ed.gov/use-work/awards/efficacy-study-interleaved-mathematics-practice)
- Akhuseyinoglu 等 2022，DBQA 与 SQL 分步示例：[全文](https://par.nsf.gov/servlets/purl/10367868)
- SQLVis：[TU/e](https://research.tue.nl/en/publications/sqlvis-visual-query-representations-for-supporting-sql-learners-2/)
- Taipalus & Perälä 2019：[全文](https://jyx.jyu.fi/handle/123456789/63057)；Taipalus 2020：[摘要与全文](https://jyx.jyu.fi/handle/123456789/73017)
- Miedema、Aivaloglou、Fletcher 2021：[ICER 2021](https://research.ou.nl/en/publications/identifying-sql-misconceptions-of-novices-findings-from-a-think-a/)
- Shute 2008，形成性反馈：[全文](https://myweb.fsu.edu/vshute/pdf/shute%202008_b.pdf)
- 提示序列与 bottom-out 提示：[Cognitive Science Society 论文](https://journalpub.escholarship.org/cognitivesciencesociety/article/28865/galley/18736/download)
- 渐退示例与专长逆转效应：[Worked-example effect 综述](https://en.wikipedia.org/wiki/Worked-example_effect)，[Kalyuga 等](https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Exp_Rev_LI06.pdf)
- Bisra 等 2018，自我解释元分析：[全文](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf)
- Mayer 多媒体学习原则：[Mayer 2020 摘要](https://ugc.futurelearn.com/uploads/files/7d/d6/7dd6188d-c343-4311-b064-ac98d2c95abc/Multimedia_Principles._R._E._Mayer__2020.pdf)
- PRIMM：[Raspberry Pi Foundation 摘要](https://static.raspberrypi.org/files/curriculum/quickreads/11-Pedagogy_Summary_PRIMM_V4_2023.pdf)
- Parsons 题的研究：[Proof Blocks 论文中的综述](https://arxiv.org/pdf/2211.09609)
- Quality Matters，目标与评估对齐：[标准 2](https://developonline.ua.edu/?p=1168)，[标准 3](https://developonline.ua.edu/?p=1172)
- 学习曲线与知识组件模型：[DataShop 案例](https://datashop.phzh.ch/about/case-studies/koedinger-geometry-script-for-web.htm)，[CMU 短期课程](https://learnlab.org/certificate/courses/learning-curves-and-data-mining-for-course-improvement/)

## 附录：复现脚本

两个脚本放在本次会话的临时目录里，从项目根目录用 `npx tsx <路径>` 运行：

- `/private/tmp/claude-501/-Users-whiskeyocean-Documents-MyProjects-SQL-Lab/e084c87c-e928-48e9-b527-4d8cc356c089/scratchpad/analyze.ts`：每课篇幅与结构、题型和难度分布、练习与示例的相似度、提示泄露、预测题送分。
- `/private/tmp/claude-501/-Users-whiskeyocean-Documents-MyProjects-SQL-Lab/e084c87c-e928-48e9-b527-4d8cc356c089/scratchpad/coverage.ts`：`introduces` 的练习覆盖率、行数类预测题、规定输出列的题、常见错误与找错题的数量。

临时目录会被清理。如果要长期使用，应改写成 `scripts/audit.ts`，并作为 `npm run audit` 接入（见第 5 节）。
