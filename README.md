# dsh-glass-mood-theme

给 DeepSeek Harness Web GUI 的 **Glassmorphism（玻璃拟态）主题**：材质跟着 Agent 的活动状态换情绪，每个状态可以配**自己的 MP4/WebM 动态壁纸**（状态切换时两段视频交叉淡入），三个面板的**不透明度 / 模糊 / 高光可分别设置**，并带一套苹果液态玻璃风格的静态边缘光。

| 状态 | 观感 | 触发条件 |
|---|---|---|
| **空闲** | **珍珠白玻璃**：白色为主调、中性冷灰描边、通透清爽；慢速溶解（900ms）、大范围柔焦（26px） | 没有任何会话在跑 |
| **工作** | **钢蓝玻璃**：冷调高对比、紧致模糊（13px）、冷色硬边内缘光、快切（260ms）+ 极慢呼吸光晕 | 有会话 `running`，或停在等待用户确认上 |

两种情绪是同一套玻璃材质换配方：色调、模糊半径、边框对比、过渡速度、光晕颜色。它**不替换**官方主题，而是叠在官方 `--dsw-*` 令牌之上 —— 设置里的「浅色 / 深色 / 跟随系统」仍然完全有效。

设置入口：**设置 → 通用**，两行：
- **玻璃主题 · 动态壁纸**（`order 13`）
- **玻璃主题 · 面板与光感**（`order 14`）

## 面板与光感（每个面板单独设置）

「左侧边栏 / 主界面 / 右侧边栏」各有一组 **不透明度 / 模糊 / 高光**：

| 控件 | 作用 |
|---|---|
| **不透明度** | 该面板底色的 **绝对 alpha**：`1.00` = 完全不透明（完全遮住壁纸），`0` = 完全透明。底色仍然来自当前情绪的官方令牌（侧栏 = `--dsw-specific-sidebar-fill`，主区/右栏 = `--dsw-alias-bg-base`），所以它始终跟着情绪走。刚装好时它显示的是调色板自己的 alpha，一旦你拖动就变成你指定的绝对值，并且**优先于壁纸可见度的削薄** —— 否则"拖到底还是能看到壁纸"就无解 |
| **模糊** | 该面板自己的 `backdrop-filter: blur()`，0 = 完全清晰 |
| **高光** | 面板的镜边与投影强度：一圈渐变描边（左上最亮）+ 冷灰细边 + 面板外的接触投影。**投影是关键** —— 白色高光画在白色面板上本来就看不见，投影才会在浅色模式里真的显形 |

全局几何与光效：

| 控件 | 默认 | 说明 |
|---|---|---|
| **面板间隙** | 8px | 面板之间的留缝。**> 0** 时三个面板成为独立圆角卡片，外框透明、壁纸从缝里透出来；**= 0** 时面板贴合成**一整张玻璃**，由外框圆角统一裁切 |
| **外框圆角** | 0px | 整张外框的圆角。0 = 交给窗口自己的圆角 |
| **面板圆角** | 20px | 官方 `--dsw-radius-xl`（独立内容卡的标准半径） |
| **分隔线** | 0.35 | 间隙为 0 时的 0.5px 竖线强度。**有间隙时它按设计不出现**（留缝本身就是分隔），所以只在间隙 = 0 时拖动它才有意义 |
| **边缘折射** | 开 | 液态玻璃的边缘：开启后镜边更利（带宽、色散细边、角光更强），面板边缘由舞台 WebGL 透镜做真实折射——边框一圈背后的画面被放大弯折，圆角上沿弧过渡；填充层保持整块，不在边缘让空档（让出来的那一圈比中心清楚，读起来就是一圈白边）。输入卡、消息气泡与页面级弹窗也叠一层 `feTurbulence + feDisplacementMap` 折射。**不改变面板模糊**；小的内容弹窗（如文件差异预览）保持实底。只有启用壁纸时才付出这份 GPU |

**同心圆角的配方**：想让面板与外框同心，把「面板圆角」设为「外框圆角 − 面板间隙」。这也是官方圆角标准认的做法：`docs/ui-radius.md` 明确写着"由真实内缩推导的几何允许用 `calc()`"，标准档位里 `--dsw-radius-panel`(28) − 间隙 8 = `--dsw-radius-xl`(20)。

面板行还有两个开关：**内容取色**（把内容色相染到面板与镜边）与**按压光感**（按下时的触点亮池与弹性回弹）。

### 面板表面探测

侧栏、主区、右栏的可见表面不一定是列本身。插件在挂载、改动面板设置、列被缩放、或面板内容被重建时做一次**有界的**探测：在列内找**最深的一层**「两个方向都覆盖 ≥85% 列尺寸、且自身在绘制（背景色有 alpha 或背景图不是 none）」的元素，把底色与磨砂交给它，并让列让位（`data-glass-delegate`）。探测上限 48 个节点 / 5 层；表面合格时直接复用缓存，不合格才重新下潜，所以轮询保持廉价。

主区的材质通常落在 app 的会话内容根上。切换会话时 app 会重建这一层，插件跟着结构变化在同一个 120ms 节流窗口里把底色、磨砂和镜边搬到新元素上，不需要等下一次全量扫描；深处的普通改动（流式回答追加消息）不会触发任何测量。

这不是"猜类名"：类名只用于**找到三根列**，之后一切都建立在本插件自己的属性上。`panelStatus().surfaces` 告诉你每根列是否委托给了内层表面，`panelStatus().surfaceDetail` 还会给出那个元素的标签与类名。如果某根列的透明度/模糊没反应，把这一项发出来即可定位。

## 动态壁纸（每个状态一段）

**设置 → 通用 → 玻璃主题 · 动态壁纸**。两个状态各一行，各自独立：

| 控件 | 作用 |
|---|---|
| **链接 / 选择文件** | 该状态的视频来源。链接回车（或点出输入框）应用；文件立即播放并存入浏览器 IndexedDB |
| **清除** | 只清这一个状态（清掉后另一个状态的视频会自动接管两个状态） |
| **适配** | 裁切铺满 / 完整显示 / 拉伸铺满（两段共用） |
| **壁纸可见度** | **唯一的"看得清"旋钮**，见下 |
| **模糊** | 视频模糊 0–32px |
| **情绪染色** | 情绪色洗涤在视频上的强度（0–0.9） |

每个滑杆右侧都印着当前数值（不透明度 `0.52`、模糊 `18px`、间隙 `8px`…），方便按数值精确复现，而不是"拖到看着差不多"。

### 谁透明、谁不透明

规则是按「**看**」和「**读**」分开：官方主题里**承载内容的表面全是完全不透明的静态色**，只有它们变半透明，视频才会从差异预览和设置页里透出来。

| 类别 | 令牌 | 行为 |
|---|---|---|
| **看的表面**（壁纸的舞台） | `--dsw-alias-bg-base`（画布）、`--dsw-specific-sidebar-fill`（侧栏）、hover/active 态 | 按「壁纸可见度」削薄，画布最低到 0.06 |
| **读的表面**（内容） | `bg-document-preview`（文档/差异预览容器）、`bg-overlay`（弹窗）、`bg-layer-1/2/3`（卡片层级）、`settings-card-fill`（设置卡）、`markdown-code-block` / `inline-code`（代码）、`input-major` / `bubble` / `bubble-highlight` | **一旦启用壁纸，就抬到可读下限**（0.68–0.94），永远不因可见度变薄 |
| **文字与描边** | 全部标签色、边框色 | 一个字节都不改 |

这里的要点是：**「保护」不是「削薄的反面」，而是独立的一步**。削薄只能减 alpha；保护只能加 alpha，而且只作用于上面那张表里的内容令牌 —— 测试对这一点有硬约束（未声明的令牌一旦获得 alpha 就判失败）。

### 文字可读性

覆盖 **6 个** label 令牌，每一档都有硬性对比度门槛（对抬升后的卡片层测算，取最差组合）：

| 令牌 | 空闲/浅色 | 工作/浅色 | 门槛 |
|---|---|---|---|
| `label-primary` | 17.32 | 15.73 | ≥ 4.5 |
| `label-secondary` | 7.20 | 7.02 | ≥ 4.5 |
| `label-tertiary` | 5.14 | 4.91 | ≥ 4.5 |
| `label-caption` | 6.53 | 6.24 | ≥ 4.5 |
| `label-dimmed` | 3.86 | 3.75 | ≥ 3.5（本来就是"弱化"档，但仍须可读） |
| `label-document-preview` | 10.28 | 9.37 | ≥ 4.5 |

**诚实的边界**：如果你把某个面板的不透明度拖到很薄，灰字就是压在视频上，任何调色板都无法保证对比度 —— 面板不透明度本来就是这个权衡的旋钮。上表保证的是"面板保持默认厚度时"的可读性。

### 磨砂只给"页面级"表面

设置界面那种大面板适合毛玻璃，而小的临时弹窗不适合。区分方式不猜类名，而是**量尺寸**：`role=dialog` / `aria-modal` 里，两个方向都超过视口 42% 的算"页面级"，由 JS 打上 `data-glass-frost="on"`，只有它才吃磨砂与折射 —— 所以设置界面是毛玻璃，小的文件差异预览保持自己的实底，清晰优先。缩小时标记会自动撤掉。

### 壁纸可见度

一根滑杆同时驱动两端，永远不会互相矛盾：

| | 壁纸可见度 = 0 | 壁纸可见度 = 1 |
|---|---|---|
| 视频图层强度 | 0.35 | 1.0 |
| 面板削薄（清晰度） | 0（面板原样） | 1（画布降到 0.06、侧栏 0.20） |
| 情绪染色保留 | 100% | 30% |

底层两个字段（`opacity` / `clarity`）仍然保留在配置与调试 API 里，脚本化控制时仍可分别写入。

**可读性不会被这个滑杆删掉**：只有"大面积底板"（画布 / 平台底 / 侧栏 / 层级底 / 卡片底）授权被削薄，而**承载文字的表面有硬下限** —— 气泡 ≥ 0.58、输入框 ≥ 0.55、设置卡 ≥ 0.50、弹窗 ≥ 0.62、代码块 ≥ 0.55。颜色本身（文字色、边框色、品牌色）一个字节都不动，只改 alpha。

> 直说风险：视频内容是你选的，主题无法知道它多亮。在极端组合下（浅色模式 + 全黑视频 + 清晰度拉满），少数文字仍可能不够清楚 —— 这是"把视频放清楚"的固有代价，此时降低清晰度或给视频加个模糊即可。

### 视频上的情绪色

有视频时，情绪洗色只给画面**盖一层调子**（保留明度、交出大部分色相，`filter: saturate(.4)`），不会把视频整体染色；工作态的脉冲也改为中性冷光并弱化。情绪的辨识度主要由**玻璃本身**承担：面板底色、镜边、文字与光温。想要更浓的色调，拖「情绪染色」滑杆即可。

### 状态切换的过渡

两个状态各自一个 `<video>` 元素，两段都常驻（静音、循环）。切换情绪时先预热进入的片子，只做 CSS `opacity` 交叉淡入；淡出结束后停掉离屏解码器，下次切换再预热。整个过程不重写 `src`、不重新 `load()`。

只配了一段视频时，那一段会标记为 `both` 同时服务两个状态（只有**一个**元素在解码，不会重复播放同一文件）；两段都配了才各占一个元素。

### 其它边界

- **强制静音**：浏览器只允许「静音 + inline」的视频自动播放。
- **视频会自己回到播放**：背景视频偶尔会停下来，而停下它的不是主题——自动播放被拒、`loop` 没回到开头、解码管线卡在某一帧、源被回收或报了错、窗口从被遮挡里回来时系统没发可见性事件。主题在每次轮询（1.5s）检查「此刻该在播的那一条」是否真的在走：不动就先重按播放键，连着两轮按不动才升级成重装源，并且每重装一次把间隔拉长一倍（1.5s → 3s → 6s…封顶 60s），一条真坏掉的片子不会每 1.5 秒重载一次。画面在推进的视频一次都不会被碰。不在显示的那条仍按设计停着（切状态时才预热），省电的那笔账没有变。窗口重新获得焦点也会唤醒一次，作为可见性事件的兜底。停在什么状态，控制台里 `__dshGlassMood.playback()` 当场报给你。
- **格式**：`mp4` / `webm`（H.264 / VP9 最稳）。
- **大文件**：超过约 400MB 会提示（IndexedDB 写入可能明显变慢）；链接方式不占浏览器存储。
- **链接跨域**：普通 `<video>` 播放不需要 CORS，但服务器若校验 Referer/鉴权会失败，此时改用本地文件。
- 壁纸是**本机存储**（localStorage 配置 + IndexedDB 文件），不跨设备同步。
- **旧版自动迁移**：v1 的单视频配置（顶层 `source`/`url` + IndexedDB 的 `wallpaper` 键）在启动时自动搬进"空闲"槽，并把字节复制到新键后释放旧键，你不需要重新设置。

## 液态玻璃与光感

- **镜边高光（liquid glass）**：`::after` 上用 `mask-composite: exclude` 做出一圈**渐变描边** —— 左上强、右下留一圈冷灰反光（浅色模式下纯白高光在白面板上不可见，所以浅色态以冷灰细边 + 面板外投影承担轮廓），同时 `inset 0 1px 0` 给顶边一道镜面线，`inset 0 -28px 56px -34px` 给底部一层环境遮蔽。投影挂在面板本体上而不是覆盖层上 —— 覆盖层被 mask 裁到 1px 描边环，它的外投影会被一起裁掉。
- **面板边缘透镜（WebGL）**：壁纸舞台里有一张 canvas，夹在视频与渐变/压暗层之间。它在视频实际呈现新帧或面板几何变化时才重绘，而不是每个动画帧重复上传整屏图像；循环接缝暂时没有新帧时保留上一张，不闪掉折射带。折射只在每个面板可视边缘带内**换个坐标取样**：位移在边框上为零、在带子内沿也为零，中间最大，所以画面跨过边框是连续的，但边框那一圈被放大弯折——厚玻璃的边就是这么读出来的。带子宽 44px（工作态 36px），最大位移 4 CSS px。折射带是**静态**的：着色器里没有 `uTime`、没有正弦、没有色散、不补高光，所以不会出现游动的条纹。算方向用的圆角半径放大了一个带宽，把距离场的对角脊推到带子外面，圆角上是弧不是直角。填充层单独成层但**整块不动**，让折射从它背后透出来。canvas 不碰 DOM 面板，圆角、镜边与接缝保持原样；文字与按钮仍在它上面。只在启用壁纸且「边缘折射」开启时工作；降低透明度时收起。
- **CSS 兜底透镜**：没有 WebGL、视频跨源污染或上下文丢失时，退回材质宿主里的 `backdrop-filter` 软边带（36/28px，避开四角），保证不出现缺口或锯齿。
- **边缘折射**：一个内联 SVG 滤镜（`feTurbulence` → `feDisplacementMap scale=3.2`，**不做预模糊**）通过 `backdrop-filter: url(#…)` 作用在**小圆角表面**（输入卡 / 气泡 / 页面级弹窗）上。位移量在背景 alpha 变化处最强、中心最弱，所以折射自然集中在边缘。**这个整面滤镜刻意不作用在整列上**；列走上面的舞台 WebGL 边缘带，只处理边框。
- **光感是静态的**：镜边高光 + 面板外的接触投影 + 面板内的底部环境遮蔽 + 随情绪变色的光（工作时偏冷、空闲时偏暖），再加上工作态那圈极慢的呼吸光晕。**没有任何自创的扫光动效**。
- **超椭圆圆角**：直接用官方 `corner-shape` 样式表 —— 官方已经在支持 `corner-shape: superellipse()` 的引擎上给所有元素套了超椭圆圆角，所以本插件**不去改** `corner-shape`，只用 `border-radius`（这也是官方"full-round 形状要配对 `corner-shape: round`"规则的前置条件）。

## 与官方设计规范对照

| 规范要求 | 出处 | 本主题的实现 |
|---|---|---|
| 玻璃给导航/功能层，**不要用在内容层** | Apple HIG、WWDC25 | 面板（侧栏/主区/右栏）才是玻璃；卡片、弹窗、代码块、文档预览一律实底（`WALL_PROTECT`） |
| 避免玻璃叠玻璃 | Apple HIG | 只有“页面级”大面板才加磨砂，小弹窗不参与 |
| 媒体上方的玻璃需要暗化层，**最高 35%** | Apple HIG Materials | 帧采样器：平均亮度 > `DIM_KNEE`(0.55) 时自动叠 `rgba(0,0,0,--gm-media-dim)`，**上限 `DIM_MAX` = 0.35** |
| 色调来自内容（“模仿真实有色玻璃”、“彩色内容的光溢到表面上”） | Apple HIG | 采样帧的主色相按 `SPILL_MIX`(0.45) 染到**面板底色与镜边**；文字对比度另有硬门槛 |
| 对比度 ≥ 4.5:1 | Apple HIG | 六档 label 对比度门槛 + 内容保护下限 |
| 高透材质 + **依据背景自动保证可读** | 鸿蒙 `colorInvert` | 用“背景亮度感知的暗化层 + 不透明内容表面”实现同一目的；浏览器无法逐字反色 |
| 赋色层必须带透明度 | 鸿蒙 `materialColor` | 所有洗色/镜边都是 rgba，没有不透明色块 |
| 自带阴影（优先于通用阴影） | 鸿蒙 `applyShadow` | 面板自有接触投影，不依赖应用的 shadow |
| 交互时发光 / 触点流光跟随 | 鸿蒙 `lightEffect`、Apple | **已实现且保留**：按下时生成跟随触点的光池；不做常驻指针光 |
| 按压弹性形变 | 鸿蒙 `interactive` | **已实现且保留**：按下缩到 0.972，松开回弹到 1.012 再落定 |
| Reduced Motion / Transparency / Contrast | Apple HIG | **三项都已响应**：运动降级、降低透明度、增强对比度（见下） |

参考：[Apple — Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/liquid-glass)、[Apple HIG — Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[WWDC25 — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)、[鸿蒙 — 沉浸光感开发指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-development)。

### 帧采样器

- **亮度 → 暗化层**：峰值亮度超过 0.55 时按比例加一层黑色遮罩，上限 0.35（苹果给的数字）。背景偏亮时保住对比度，偏暗时完全不出现。
- **色相 → 面板与镜边**：主色相按 `SPILL_SATURATION`(0.34) 与 `SPILL_MIX`(0.45) 染到面板底色，浅色面板先被 `SPILL_MAX_LIGHTNESS`(0.86) 封顶；镜边同时跟着变。
- **中性路径**：混合是从“原色”到“目标色相 × 自身明度饱和度”的 **RGB 直线插值**，途中经过中性灰。不走色相环最短弧 —— 冷色到暖色的短弧会穿过品红。
- **不猜，也不闪回**：无剪辑、从未读到可用帧、帧偏暗（< 0.08）、帧近似灰色（饱和度 < 0.08）、或 **跨域视频污染了 canvas** 时，采样器不猜颜色。循环接缝或短暂缓冲只是暂时没有新帧，会保留最后一次有效读数；下一帧到达后照常更新。
- **节流**：每 4 秒采一帧（`SAMPLE_INTERVAL_MS`），抽帧是一个 24×14 的离屏 canvas，跟整屏采样不是一个量级。

### 无障碍：降低透明度与增强对比度

苹果 HIG 把 Reduced Transparency / Increased Contrast / Reduced Motion 并列为玻璃材质必须响应的三项，前两项由媒体查询读取（`prefers-reduced-transparency` / `prefers-contrast`），并且**系统切换时立即重绘**，不需要刷新。

**降低透明度**：所有“读”的表面变成**完全不透明**（气泡 / 输入框 / 弹窗 / 卡片层级 / 代码块 / 文档预览 / 设置卡），面板也一律不透明，并且**可见度滑杆不再能把它削薄** —— “不要透明”正是要求取消“你得透着它看”的表面。面板既然是实底，模糊层也就没了意义，所以 `backdrop-filter` 与边缘透镜也一并跳过（少一份 GPU 开销）。

一个刻意的例外：**画布（壁纸）不动**。壁纸是你自己选的，而且它只在“没有任何东西需要被阅读”的面板之间露出。如果你希望它彻底消失，直接把壁纸清掉即可。

**增强对比度**：六档文字全部取用**主文色**（层级改由字号与字重承担，而不是把字淡向背景），字段层级与弹窗也一并变为不透明。实测：

| 令牌 | 平时 | 增强对比度 |
|---|---|---|
| `label-secondary` | `#50556A` | `#17181C` |
| `label-tertiary` | `#666C7A` | `#17181C` |
| `label-caption` | `#565C6B` | `#17181C` |
| `label-dimmed` | `#7A808F` | `#17181C` |
| `label-document-preview` | `#3A3F4C` | `#17181C` |

### 交互反馈：按压光感与弹性形变

- **按压光池**：按下时在控件形状里生成一个跟随触点的光斑（白核 + 光晕 + 亮边），指针移动时光核跟着走，松开后熄灭；底下的 `brightness()` 同时把控件提亮一点。
- **光晕的颜色跟着壁纸走**：光池是画面上最亮的一小团，若它留着一团和片子毫无关系的蓝，读到的是"这个按钮是蓝的"而不是"玻璃在反光"。所以光晕与亮边的色相取自屏幕那条片子的平均色（跟得比镜边更远，镜边只沾一点），光核保持白热。没有壁纸、或关掉「内容取色」时，回到心情自己的底色（空闲偏暖、工作偏冷）。
- **弹性回弹**：按下缩到 0.972，松开先越过原尺寸一点（1.012）再落定。
- **只用 `scale`**：不会覆盖应用自己的 `transform` 动画。
- **只作用于真正可点的控件**（`button` / `[role=button|tab|menuitem]`），不碰面板与布局。
- **开关**：面板行的「按压光感」，勾掉立即生效。
- **`prefers-reduced-motion`**：取消形变与回弹，只保留静止的光。

### 内容取色

启用后，采样帧的色相会染到**面板底色**上：目标是「采样色相 × `SPILL_SATURATION`(0.34) × 自身明度（浅色面板以 `SPILL_MAX_LIGHTNESS`(0.86) 封顶）」，再按 `SPILL_MIX`(0.45) 混合；镜边跟着变，但只是附带效果。实测空闲/浅色面板会随内容在暖冷之间移动，整块面板都看得出来。

**可读性不能被它破坏**：在最强取色（完全饱和的色相 + 最大混合）下，四套调色板的正文对比度实测 **14.4–16.2**（门槛 7），任何一套跌破门槛时测试直接失败。

## 安装

本机（开发目录就地安装）：

```powershell
dsh plugin --profile desktop add "C:\Users\yorke\Documents\deepseek-harness\default-workspace\dsh-glass-mood-theme"
```

**换一台电脑**（解压压缩包之后）看 [`安装说明.md`](安装说明.md)，那里写了完整步骤、以及**哪些设置不会跟着走**（面板调参存 localStorage、本地视频壁纸存 IndexedDB，都按机器隔离）。要点：

```powershell
dsh plugin --profile desktop add "D:\dsh-plugins\dsh-glass-mood-theme"
```

装完必须**完全退出并重启 DSH**（客户端 bundle 在宿主启动时装配）。

该包声明了 `dsh.bundle`，`dsh plugin` 会把它同时写进 profile 的 `dsh.profile.bundles`。**客户端 bundle 在宿主启动时进入 `window.__DSH_BOOT__` 图；市场已安装页热挂载的话刷新页面即可。** 卸载：

```powershell
dsh plugin --profile desktop remove dsh-glass-mood-theme
```

## 它怎么判断"空闲/工作"

唯一信号源是**有没有会话在干活**，按可靠性依次尝试：

1. `uiSession.sessionStatus` —— 每会话状态表（`running` / `pendingInteraction`），首选；
2. `sessions.list.getSnapshot().byId` 行上的 `running`，其次；
3. `sessions.binding(id).session.getSnapshot().running`，兜底；
4. 每 1500ms 一次快照轮询作为安全网（纯内存读取，无 I/O）。

**滞回（避免闪烁）**：

| 常量 | 值 | 作用 |
|---|---|---|
| `WORK_ENTER_MS` | 120 | 进入"工作"只需极短防抖，响应要快 |
| `IDLE_ENTER_MS` | 1600 | 工具步骤之间的空隙不回到珍珠白，避免来回跳 |
| `MIN_DWELL_MS` | 600 | 两次切换之间的最小间隔 |
| `COUNT_PENDING_AS_WORK` | true | 停在"等你确认"上的回合仍算工作（回合没结束） |
| `POLL_MS` | 1500 | 兜底轮询 |

首屏不做滞回：刷新页面时正有回合在跑，直接冷色落地。

## 调试

```js
window.__dshGlassMood.current()                       // 'idle' | 'work'
window.__dshGlassMood.force('work')                   // 钉住情绪（写 localStorage），'' 取消
window.__dshGlassMood.refresh()                       // 立刻重算
window.__dshGlassMood.wallpaper()                     // 当前壁纸配置（含 clips.idle / clips.work）
window.__dshGlassMood.setWallpaper({ slot: 'work', url: 'https://…/focus.mp4' })
window.__dshGlassMood.setWallpaper({ clarity: 1, tint: 0.2 })
window.__dshGlassMood.setWallpaper({ visibility: 0.7 })   // 等效于拖动「壁纸可见度」
window.__dshGlassMood.setFile(file, file.name, 'idle')    // 直接喂 File/Blob
window.__dshGlassMood.clearWallpaper('work')          // 清某一槽；不传参清两槽
window.__dshGlassMood.panels()                        // 当前面板/几何/光效配置
window.__dshGlassMood.panelStatus()                   // 上面 + 三根列是否识别到、是否委托、委托给了哪个元素（surfaceDetail）
window.__dshGlassMood.setPanels({ main: { blur: 24 }, gap: 0, frameRadius: 28 })
window.__dshGlassMood.retag(true)                     // 重新识别三根列并深度探测
localStorage.setItem('dsh-glass-mood:no-blur', '1')   // 关掉磨砂模糊（刷新后生效）
```

**面板没生效怎么查**：`panelStatus().found` 会告诉你哪一列没被识别到，设置行里也会显示「未识别到面板：主 / 右」。本插件不是靠硬编码的 CSS 类名生效的 —— 它用外壳自己的类名**找一次**元素，然后打上自己的 `data-glass-panel` 属性，所有样式规则只认这个自有属性。所以外壳改版时最坏的情况是"某一列不再有自定义材质 + 明确告诉你"，而不是静默失效。

只想看效果、不想等回合：`force('work')` / `force('idle')`。

## 配色与令牌

覆盖 **33 个官方 alias 令牌**，每个都是 `{ light, dark }` 成对值（官方 `overrideTokens` 强制要求两种模式，缺一个会在运行时报错）：

背景 `--dsw-alias-bg-base / -bg-layer-1/2/3 / -bg-overlay / -bg-module-platform`、边框 `-border-l1..l4`、文字 `-label-primary/secondary/tertiary`、`-brand-primary`、交互 `-interactive-bg-hover/-active`、按钮 `-button-primary-fill/-hover`、设置卡 `-settings-card-fill/-stroke`、代码 `-markdown-code-block / -inline-code`，以及 `--dsw-specific-sidebar-fill / -sidebar-nav-item-hover/-active/-active-accent / -input-major / -bubble / -bubble-highlight`。

**故意不碰**（都写在测试的禁止清单里）：`--dsw-menu-surface-fill`、`--dsw-menu-backdrop-filter`、`--dsw-mask-blur` —— 菜单材质与弹窗遮罩是官方明令不许覆盖的；`--dsw-alias-state-*` 与代码 diff 色保持官方，因为那几种颜色承载语义。

四套调色板的对比度（无壁纸时的实测，测试里会跑门槛）：

| | 主文字 | 次文字 | 品牌色 |
|---|---|---|---|
| 空闲 · 浅色 | 17.32 | 7.20 | 9.60 |
| 空闲 · 深色 | 14.05 | 9.02 | 7.10 |
| 工作 · 浅色 | 15.73 | 7.02 | 6.38 |
| 工作 · 深色 | 14.12 | 9.17 | 6.39 |

门槛：主文字 ≥ 4.5、次文字 ≥ 4.5、品牌色 ≥ 3.0、主按钮上的白字 ≥ 4.2（官方深色品牌蓝本身是 4.33，所以 4.2 是诚实的下限）。

**空闲态是刻意的单色白**：品牌色用深石板（`#3D4356`，浅色）/ 淡紫（`#9BA3FF`，深色）。想要彩色点缀只改 `--dsw-alias-brand-primary`、`-button-primary-*`、`-sidebar-nav-item-active-accent` 即可。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 浏览器半边：四套调色板、情绪状态机、双槽壁纸引擎、面板材质与光效、两行设置组件、样式表 |
| `index.js` | 宿主半边：无行为，只为让客户端半边进入 bundle 图 |
| `cordis.patch.yml` | 把 `glass-mood-theme` 行插入 Web 客户端的插件表 |
| `test/glass-mood.test.mjs` | 无依赖测试：状态机 + 双槽壁纸 + 可见度预算 + 内容保护 + 表面探测 + 面板材质 + 磨砂分级 + 迁移 + 两行设置 + 令牌合规 + 对比度门槛 |

## 验证

```powershell
node test/glass-mood.test.mjs
```

**60+ 项检查**（每通过一项打印一行 `ok …`，全过则末尾输出「全部检查通过」）。无第三方依赖，不需要构建。覆盖挂载/卸载彻底性、情绪切换与滞回、壁纸双槽与迁移、可见度预算、内容保护、表面探测与委托、材质宿主被重建后的即时恢复、面板材质、边缘透镜（CSS 兜底、舞台 WebGL 的无 WebGL 回退、着色器只折射不加光的纯度约束与清理）、按压光池与回弹、磨砂分级、无障碍偏好、令牌合规与全部对比度门槛。

## 已知边界

**窄屏自动全屏**（视口 <768px 时打开就自动全屏）会走「不保留轨道」那条路：列宽为 0，于是被当成收起的窄条而完全不碰（<56px 不上材质）。那种情况下展开的面板没有玻璃。宽屏不受影响。

## 兼容性

面向 DSH `0.2.0-rc.1` – `0.2.x`（`package.json` 的 `dsh.compatibility.dsh`）。选择器依赖官方已有的 `data-*` 挂点（`[data-composer-card]`、`[data-time-hover-root]`、`[data-conversation-scroll]`、`[data-queue-dock]`、`[data-slot="conversation.session.header"]`）与 CSS Modules 的 `_local` 命名；官方改版后若某个挂点消失，最坏情况是那一处不再有磨砂，其余配色照常。

## 调参速查

- **颜色**：`PALETTES.idle` / `PALETTES.work` 的 `light` / `dark` 数组（顺序与 `TOKEN_KEYS` 一一对应）。改完跑测试。
- **削谁、削多少、下限多少**：`WALL_THIN` 表（`[token, rate, floor]`，只含看的表面）。面板底色也走这张表，所以调整它同时影响壁纸可见度与面板薄厚。
- **内容可读下限**：`WALL_PROTECT` 表（`[token, floor]`）。壁纸开启时这些表面**只升不降**；若某个新组件在壁纸下看不清，把它的令牌加进这张表。
- **页面级表面的判定阈值**：`BIG_SURFACE_RATIO`（默认 0.42）。
- **材质粘性**：见 `surfaceAttached()` 与 `discoverSurfaces()`。若确实要强制重新探测，刷新页面即可。
- **面板默认值**：`PANEL_DEFAULTS`（三个面板的 `opacity`（`-1` = 跟随调色板）/`blur`/`sheen`，以及 `gap`/`frameRadius`/`panelRadius`/`divider`/`refraction`）。
- **表面探测的边界**：`SURFACE_MAX_NODES`(48) / `SURFACE_MAX_DEPTH`(5) / `SURFACE_MIN_COVERAGE`(0.85) / `SURFACE_MIN_ALPHA`(0.04)。若某根列没被委托（`panelStatus().surfaces` 为假）而你想让它委托，先放宽 `SURFACE_MIN_COVERAGE`。
- **可见度下视频的最低强度**：`VISIBILITY_MIN_CLIP`（默认 0.35）。
- **取色强度与可见度**：`SPILL_MIX`(0.45) / `SPILL_SATURATION`(0.34) / `SPILL_MAX_LIGHTNESS`(0.86)。嫌太淡就调大 `SPILL_SATURATION`；担心字不够清楚就调小 `SPILL_MIX`。
- **外壳选择器**：`PANEL_SELECTOR`（左 `_sidebarCol`、主 `_centerCol`、右 `data-rightbar-col`）。官方若改类名，改这一处即可，样式侧不用动。
- **镜边与折射**：`panelRim()`（高光渐变的三个色标 + 环境遮蔽 + 分隔线）、`REFRACTION_SVG`（`baseFrequency` / `scale` 决定小表面的折射纹理与强度；CSS `EDGE_LENS_ID` 是兜底透镜）。
- **舞台 WebGL 透镜**：`LENS_BEND_PX`（最大位移，CSS px）与 `drawWebGL()` 里的 `uBand`（空闲 44 / 工作 36）、`uRadius`；离屏快照宽 1280px。位移剖面是 `w = 6.75·u·(1−u)²`，两端为零、`u = 1/3` 处最大——边框处的斜率是 `6.75·uBend/uBand`，必须小于 1，否则映射折回去、边上多一道镜像重影，所以 `uBend` 的上限是 `uBand/6.75`（带宽 44 时约 6.5px）。
- **CSS 兜底透镜**：`--gm-lens-band`（空闲 36 / 工作 28）与 `--gm-lens-corner`（默认 2×面板圆角），在 `publishPanelColors()` 里发布；无 WebGL 时接管。
- **按压光池**：`#dsh-glass-mood-press-light` 的渐变与 `--gm-tap-*`（由镜边颜色发布）；回弹时长见 `gm-release` 关键帧。
- **染色在满清晰度下保留多少**：`TINT_THROUGH_CLARITY`（默认 0.3）。
- **壁纸默认值**：`VIDEO_DEFAULTS`（`fit` / `opacity` / `blur` / `tint` / `clarity`）与 `VIDEO_WARN_BYTES`。
- **渐变（无壁纸时的底）**：`IDLE_STAGE_LIGHT/DARK`、`WORK_STAGE_LIGHT/DARK`。
- **模糊与速度**：`--gm-blur` / `--gm-sat` / `--gm-fade` / `--gm-sheen-mood`（`body[data-glass-mood]` 与 `=work` 两条规则）。
- **节奏**：`IDLE_ENTER_MS` / `WORK_ENTER_MS` / `MIN_DWELL_MS` / `POLL_MS` / `COUNT_PENDING_AS_WORK`。

---

设计与排查过程见 [`开发手记.md`](开发手记.md)。README 只讲「它是什么、怎么用、怎么调」。
