下面给你一份**面向实际开工的工程级开发指南**，目标非常单一：

> **在不影响 AI 回答效果的前提下，降低长对话页面的内存占用和渲染压力，提升滚动、输入、阅读流畅度。**

我会按这几个部分写：

0. 验收指标（必须可测）
1. 产品边界
2. 总体架构
3. 优先级路线图
4. 每个模块的技术实现方式
5. 数据结构设计
6. 关键算法
7. 性能与安全原则
8. MVP 开发顺序
9. 代码骨架建议
10. 你开干时最容易踩的坑

---

# 0. 验收指标（必须可测）

没有量化指标，优化就是自嗨。第一版至少定义这 5 个：

* **滚动流畅度**：长线程（>= 300 条消息）场景下，滚动时主线程长任务（>50ms）次数下降 >= 40%
* **交互响应**：输入框首字符输入延迟 P95 < 100ms
* **DOM 压力**：冷区消息节点数下降 >= 50%
* **内存占用**：页面 JS heap 峰值下降 >= 20%
* **正确性**：开启/关闭优化前后，消息文本内容一致（抽样比对）

建议固定一个基准线程页面和测试脚本，所有 PR 都对同一基准对比。

---

# 1. 产品边界

先把边界钉死，不然后面很容易跑偏。

## 你这个工具要做的事

* 只优化**浏览器端显示层**
* 不改消息内容
* 不改发送逻辑
* 不改服务端历史
* 不替换上下文
* 不影响模型回答质量

## 不做的事

* 不做自动摘要替代上下文
* 不做自动续聊
* 不做历史压缩后再发给模型
* 不做 API 代理
* 不做消息内容篡改

## 产品承诺

你可以把 README 第一段直接写成：

> This extension reduces memory pressure and rendering cost for long AI chat threads locally in the browser, without modifying message content, server history, or model context.

这个承诺会让整个工程决策变得非常清晰。

---

# 2. 总体架构

最合理的第一形态就是 **浏览器扩展 + adapter 架构 + 本地优化引擎**。

## 推荐架构分层

```text
Extension Shell
├─ content script
├─ background
├─ popup/options

Optimization Engine
├─ adapter manager
├─ thread model builder
├─ viewport manager
├─ render state controller
├─ virtualization engine
├─ collapse engine
├─ scheduler
└─ safety guard

Site Adapters
├─ chatgpt adapter
├─ claude adapter
├─ gemini adapter
└─ perplexity adapter
```

## 每层职责

### Extension Shell

负责注入、配置、站点识别、用户开关。

### Site Adapter

负责把具体网站 DOM 解析成统一的消息模型。

### Optimization Engine

负责判断哪些消息完整显示、哪些折叠、哪些轻量化、哪些卸载。

### Safety Guard

负责在 DOM 结构变化或识别失败时自动停用。

---

# 3. 优先级路线图

别一开始就做“通用全能优化平台”。
正确路径是 **先做最稳的，再做最值钱的**。

---

## P0：必须先做

这是第一版必须有的。

### P0-1 站点识别和安全停用

先保证不会乱动页面。

### P0-2 消息识别模型

不要直接拿 DOM 节点乱删，先抽象 message model。

### P0-3 超长消息折叠

收益高，风险小。

### P0-4 调度器基础版

这是性能底座，不该放到后面补。

### P0-5 超长代码块折叠

通常是重灾区，收益很直接。

### P0-6 视口外消息轻量化

这是核心价值。

### P0-7 一键恢复全部显示

所有优化都必须可逆。

---

## P1：很值得加

第一版稳定后马上加。

### P1-1 占位高度保持

减少滚动跳动。

### P1-2 滚动恢复

滚回旧消息时恢复完整渲染。

### P1-3 正在生成消息保护

绝不动 streaming message。

### P1-4 增量处理和调度器

避免每次都全量扫描。

---

## P2：第二阶段

让产品更成熟。

### P2-1 多站点 adapter

ChatGPT 做稳后再加 Claude、Gemini。

### P2-2 性能仪表盘

显示当前折叠数、轻量化数、估算节点减少量。

### P2-3 pinned message

用户可手动固定重要消息不被处理。

### P2-4 实验性虚拟化

真正把远处 DOM 卸载成占位壳。

---

# 4. 每个模块的技术实现方式

---

## 模块 A：站点 Adapter

这是整个工程最关键的长期可维护点。

## 为什么必须有 adapter

因为你不能把逻辑写死成：

```js
document.querySelectorAll("#thread article")
```

这样页面一改你就全挂。

## adapter 要输出什么

每个 adapter 都应该实现统一接口。

### 建议接口

```ts
interface ChatSiteAdapter {
  site: string;
  isMatch(): boolean;
  getThreadRoot(): HTMLElement | null;
  getMessageElements(): HTMLElement[];
  getMessageId(el: HTMLElement): string;
  getRole(el: HTMLElement): "user" | "assistant" | "system" | "unknown";
  isStreaming(el: HTMLElement): boolean;
  getContentRoot(el: HTMLElement): HTMLElement | null;
}
```

### `messageId` 稳定性规则（必须先定）

增量更新完全依赖主键稳定。建议按优先级生成：

1. 使用平台原生稳定 id（如 `data-message-id`）
2. 回退到 `role + createdAt + author + normalizedTextHash(前 N 字符)`
3. 再回退才用 DOM 位置索引（仅临时，且必须可重算）

规则：同一条消息在页面重渲染后，`messageId` 必须保持不变，否则会出现错误复用/闪烁/状态丢失。

## 技术实现建议

* 尽量识别**稳定父容器**
* 尽量从语义特征识别角色
* 不要依赖单一 class 名
* 不要依赖单一 nth-child 规则
* 给每个平台写 fallback 识别逻辑

## 设计原则

**adapter 负责识别，engine 负责优化。**

不要把优化逻辑写进 adapter。

---

## 模块 B：消息模型 Thread Model

这是为了防止你以后陷入“满屏 DOM 操作地狱”。

### 建议数据结构

```ts
type MessageRole = "user" | "assistant" | "system" | "unknown";

type RenderMode =
  | "full"
  | "collapsed"
  | "placeholder";

interface MessageModel {
  id: string;
  role: MessageRole;
  el: HTMLElement;
  contentEl: HTMLElement | null;
  estimatedHeight: number;
  isStreaming: boolean;
  isPinned: boolean;
  isHeavy: boolean;
  renderMode: RenderMode;
  lastMeasuredAt: number;
}
```

`suspended` 作为第二阶段硬虚拟化内部态，不进入 MVP 对外状态机。第一版只维护 `full/collapsed/placeholder` 三态，避免状态膨胀。

### 你还可以有一个线程状态

```ts
interface ThreadState {
  site: string;
  messages: MessageModel[];
  activeRange: { start: number; end: number };
  lastUpdatedAt: number;
}
```

## 为什么一定要有这层

因为后面你的所有逻辑都会变成：

* 哪些消息是 active
* 哪些消息是 heavy
* 哪些消息可以 collapse
* 哪些消息可以 placeholder

而不是：

* 这个 DOM 节点删掉
* 那个 DOM 节点 hide

---

## 模块 C：调度器 Scheduler

这个模块会直接决定你是“优化器”还是“制造新卡顿的元凶”。

## 目标

避免：

* 每次新 token 都处理
* 每次 scroll 都同步算一遍
* 每次 DOM mutation 都全量扫描

## 推荐做法

只允许这几类调度：

### 1. scroll → throttle

例如 50ms 或 100ms 一次。

### 2. mutation → debounce

例如 150ms 聚合处理一次。

### 3. DOM 写操作 → requestAnimationFrame

把所有 class 切换、style 写入批量放进 rAF。

## 建议接口

```ts
class Scheduler {
  scheduleMeasure(task: () => void): void;
  scheduleMutate(task: () => void): void;
  scheduleIdle(task: () => void): void;
}
```

## 实现建议

* measure 和 mutate 分离
* 先读后写
* 不要读写交替
* `requestIdleCallback` 可作为低优先任务兜底

---

## 模块 D：重内容识别 Heavy Content Detection

不是所有消息都值得处理。真正占资源的通常是“重消息”。

## 判定规则建议

满足任一条件就标记 heavy：

* 高度超过阈值，例如 `> 1200px`
* 代码块数量超过阈值
* 图片数量大于 0
* 表格数量大于 0
* 数学公式节点数量较多
* 文本长度过长
* markdown 结构复杂度高

## 简单实现

```ts
function detectHeavyMessage(contentEl: HTMLElement): boolean {
  const height = contentEl.getBoundingClientRect().height;
  const codeBlocks = contentEl.querySelectorAll("pre").length;
  const images = contentEl.querySelectorAll("img").length;
  const tables = contentEl.querySelectorAll("table").length;

  // 避免把小 inline code 误判成重内容
  const textLen = contentEl.textContent?.length ?? 0;
  const inlineCodeCount = contentEl.querySelectorAll("code").length;
  const longInlineCode = textLen > 4000 && inlineCodeCount > 20;

  return height > 1200 || codeBlocks >= 2 || images > 0 || tables > 0 || !!longInlineCode;
}
```

## 注意

这个检测必须只在：

* 新消息稳定后
* 或低频测量阶段

不要高频跑。

---

## 模块 E：折叠引擎 Collapse Engine

这是最适合第一版先做的。

## 目标

对重内容消息只做**显示折叠**，不做内容删除。

## 实现方式

在消息内容区域外面包一层壳：

```html
<div class="optimizer-wrapper">
  <div class="optimizer-preview">...</div>
  <div class="optimizer-content">原内容</div>
  <button>Expand</button>
</div>
```

或者更稳一点：

* 不重构内部 DOM
* 只在外层加 class
* 用 CSS 限高 + 渐变遮罩 + 展开按钮

## 推荐样式策略

* `max-height`
* `overflow: hidden`
* 渐变蒙层
* 展开按钮

## 例子

```css
.optimizer-collapsed .optimizer-content {
  max-height: 320px;
  overflow: hidden;
}

.optimizer-collapsed .optimizer-fade {
  display: block;
}
```

## 为什么先做这个

因为它：

* 收益立刻可见
* 风险很低
* 不容易破 React
* 便于跨站点复用

---

## 模块 F：视口管理 Viewport Manager

这是你的核心引擎。

## 目标

让浏览器只重点保留当前可见区域附近的消息为“完整态”。

## 设计思路

为消息定义三个区域：

### 1. Hot Zone

当前视口内 + 上下 buffer 范围
这些消息始终完整显示。

### 2. Warm Zone

离视口不远
可以折叠，但不卸载。

### 3. Cold Zone

离视口很远
可以 placeholder 或 suspended。

## 实现方式

定时或滚动节流后获取：

* viewportTop
* viewportBottom
* messageTop
* messageBottom

判断相交关系。

## 推荐策略

例如：

* 视口内 ± 2 屏：`full`
* 再外面 ± 5 屏：`collapsed`
* 更远：`placeholder`

---

## 模块 G：轻量占位 Placeholder Mode

这比“直接 remove”稳得多。

## 目标

让远处消息不保留完整渲染成本，但视觉上还在。

## 做法

保留一个占位容器：

```html
<div class="optimizer-placeholder" style="height: 860px;">
  <div class="optimizer-placeholder-label">
    Message collapsed for performance
  </div>
</div>
```

## 两种模式

### 模式 1：软占位

原节点还在，但内容区 `display:none`
适合第一版，简单稳。

### 模式 2：硬占位

原内容 detach 到缓存，DOM 里只剩 placeholder
适合第二阶段，收益更大。

## 第一版建议

先做**软占位**。
别急着 detach DOM。

---

## 模块 H：真正虚拟化 Virtualization

这是第二阶段再做的事。

## 为什么别第一天就做

因为它复杂得多：

* 滚动高度保持
* 恢复挂载
* React 内部结构风险
* 用户交互状态恢复

## 真正做法

* 缓存原内容节点引用
* DOM 中换成等高 placeholder
* 滚回附近时恢复原节点
* 恢复后重新测量高度

## 风险

如果目标站点 React 对 DOM 结构很敏感，detach 可能出事。

所以：
**第一版做软占位，第二版再试硬虚拟化。**

---

## 模块 I：Streaming 消息保护

这条必须单独强调。

## 原则

**任何正在生成的消息都绝不处理。**

## 为什么

因为 streaming message：

* 高速更新
* 高度不断变化
* React 状态活跃
* 最容易误伤

## 规则

满足任一条件视为 streaming：

* adapter 明确识别为 streaming
* 节点最近 1 秒仍在变化
* 内容长度持续增长
* 页面存在“停止生成”态附近节点

## 策略

streaming 消息永远：

* `full`
* 不折叠
* 不 placeholder
* 不测重

---

# 5. 数据结构设计

给你一套够用的。

```ts
type MessageRole = "user" | "assistant" | "system" | "unknown";
type RenderMode = "full" | "collapsed" | "placeholder";

interface MessageMetrics {
  top: number;
  bottom: number;
  height: number;
  lastMeasuredAt: number;
}

interface MessageFlags {
  isStreaming: boolean;
  isPinned: boolean;
  isHeavy: boolean;
  isInteractive: boolean;
}

interface MessageModel {
  id: string;
  role: MessageRole;
  el: HTMLElement;
  contentEl: HTMLElement | null;
  metrics: MessageMetrics;
  flags: MessageFlags;
  renderMode: RenderMode;
}

interface EngineConfig {
  collapseHeight: number;
  fullBufferScreens: number;
  collapseBufferScreens: number;
  enablePlaceholder: boolean;
  enableAutoCollapse: boolean;
}
```

---

# 6. 关键算法

---

## 算法 1：消息状态决策

输入：

* 距离视口位置
* 是否 streaming
* 是否 pinned
* 是否 heavy

输出：

* full / collapsed / placeholder

### 决策规则建议

```ts
function decideRenderMode(msg: MessageModel, viewport: ViewportInfo, cfg: EngineConfig): RenderMode {
  if (msg.flags.isStreaming || msg.flags.isPinned) return "full";

  const distanceScreens = getDistanceInScreens(msg.metrics, viewport);

  if (distanceScreens <= cfg.fullBufferScreens) return "full";
  if (distanceScreens <= cfg.collapseBufferScreens) return "collapsed";
  return cfg.enablePlaceholder ? "placeholder" : "collapsed";
}
```

---

## 算法 2：增量刷新

不要每次都 rebuild 全部 messages。

### 做法

* adapter 周期性扫消息列表
* 用 message id 建 map
* 新消息 append
* 已存在消息更新状态
* 删除失效引用

### 关键点

**以消息 id 为主键，不以 DOM 顺序为唯一依据。**

伪代码建议：

```ts
const byId = new Map(prev.messages.map(m => [m.id, m]));
const next: MessageModel[] = [];

for (const el of adapter.getMessageElements()) {
  const id = adapter.getMessageId(el);
  const old = byId.get(id);
  next.push(old ? patchModel(old, el) : createModel(el, id));
}

thread.messages = next;
```

---

## 算法 3：高度缓存

placeholder 需要高度稳定。

### 做法

每条消息保存最近一次测得高度：

```ts
msg.metrics.height = el.getBoundingClientRect().height;
```

只有在：

* full 状态
* 稳定消息
* 低频更新

时重测。

不要频繁测量。

---

# 7. 性能与安全原则

---

## 原则 1：永远先读后写

错误方式：

```ts
for each message:
  read rect
  write class
  read height
  write style
```

正确方式：

* 先批量测量
* 再批量写 class 和 style

---

## 原则 2：不全量扫描 document.body

只监听线程容器。

---

## 原则 3：不操作未知节点

只处理 adapter 明确识别出的消息节点。

---

## 原则 4：不改站点关键内部结构

优先：

* `classList.add/remove`
* `style.maxHeight`
* 外层包裹最小控制层

谨慎：

* `remove()`
* `replaceWith()`
* 深层 DOM 重排

---

## 原则 5：全部可逆

每一条优化都必须能恢复到原状。

---

## 原则 6：识别失败自动停用

检测到以下情况立即停用：

* threadRoot 消失
* message 数量异常抖动
* adapter 连续失败
* 关键选择器匹配率骤降

---

# 8. MVP 开发顺序

这是最实用的部分。按这个顺序写，最不容易失控。

---

## 第 1 步：扩展骨架

* Manifest V3
* content script 注入
* popup 开关
* basic config storage

## 第 2 步：只支持 ChatGPT

先别通用。

## 第 3 步：实现 adapter

能拿到：

* thread root
* message elements
* role
* content root
* streaming flag

## 第 4 步：实现 thread model

把页面消息转成 `MessageModel[]`

## 第 5 步：实现超长消息折叠

只做 CSS 限高 + 展开按钮

## 第 6 步：加 scheduler（必须提前）

scroll 节流、mutation 防抖、rAF 写入

## 第 7 步：实现超长代码块折叠

优先针对 `pre` / 大 table / 图片块

## 第 8 步：实现 viewport 决策

full / collapsed 两态先跑通

## 第 9 步：加 placeholder

三态跑通

## 第 10 步：加安全停用和恢复

保证不炸站点

---

# 9. 代码骨架建议

给你一个适合直接 vibe coding 的目录。

```text
src/
  content/
    index.ts
    bootstrap.ts

  core/
    engine.ts
    scheduler.ts
    viewport.ts
    model.ts
    renderState.ts
    safety.ts

  adapters/
    base.ts
    chatgpt.ts

  features/
    collapse.ts
    placeholder.ts
    heavyDetect.ts

  ui/
    panel.ts
    styles.css

  shared/
    types.ts
    config.ts
    dom.ts
    constants.ts
```

---

## 核心入口伪代码

```ts
const adapter = resolveAdapter();
if (!adapter || !adapter.isMatch()) return;

const engine = new OptimizationEngine(adapter, config);
engine.start();
```

---

## engine 主循环伪代码

```ts
class OptimizationEngine {
  start() {
    this.mountObservers();
    this.refreshThread();
    this.scheduleUpdate();
  }

  refreshThread() {
    const elements = this.adapter.getMessageElements();
    this.thread = buildOrUpdateModels(elements, this.thread);
  }

  updateRenderModes() {
    const viewport = getViewportInfo();
    const nextStates = this.thread.messages.map(msg => ({
      id: msg.id,
      mode: decideRenderMode(msg, viewport, this.config),
    }));
    applyRenderModes(this.thread, nextStates);
  }
}
```

---

# 10. 最容易踩的坑

---

## 坑 1：一开始就做硬删除

会很爽，但很容易炸。

建议：
第一版只做折叠和软占位。

---

## 坑 2：把消息轮次建模写死

不要假设：

* 一个 user 对一个 assistant
* 一个 article 就是一条消息
* 两个节点就是一轮

你要做的是 message model，不是死数 DOM。

---

## 坑 3：滚动时频繁测量所有节点

这个会直接把你的优化变成负优化。

建议：

* 只测邻近节点
* 远处用缓存高度
* 滚动后节流处理

---

## 坑 4：动到 streaming 消息

这是最危险的误伤点。

---

## 坑 5：对 React 内部节点深度重排

很容易让按钮、菜单、复制、代码折叠失效。

---

## 坑 6：没有恢复机制

用户一旦觉得“消息不见了”，立刻就不信任了。

必须有：

* toggle off
* restore all
* current page reset

---

# 一个最推荐的 MVP 定义

你第一版就做这 6 件事：

1. ChatGPT adapter
2. 重消息识别
3. 超长消息折叠
4. 超长代码块折叠
5. 视口外消息软占位
6. 一键恢复 + 自动停用

这版已经是一个很像样的开源项目了，而且定位非常清晰：

> 只减轻页面渲染负担，不改变 GPT 的上下文和回答效果。

---

# 技术栈建议

我建议你用：

* TypeScript
* Vite
* Manifest V3
* 原生 DOM 操作为主
* 很轻的状态管理
* 尽量少用 React 到 content script 里

## 为什么

content script 环境里：

* 越轻越稳
* 越少抽象越容易 debug
* UI 面板可以单独用轻量框架
* 核心引擎尽量 framework-agnostic

---

# 最后的开发建议

你现在最正确的姿势不是继续想产品名，而是直接开 repo，然后按这三步走：

**先跑通 ChatGPT adapter → 再做 collapse → 再做 viewport placeholder。**

只要这三步做稳，你这个项目就已经和单纯“删 DOM 的 history cleaner”拉开档次了。
