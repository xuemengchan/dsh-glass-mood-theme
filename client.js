window.__ModuleLoader__.load({
	id: "dsh-glass-mood-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		/**
		 * dsh-glass-mood-theme — 浏览器侧（单一自包含模块）。
		 *
		 * 一个为 dsh 网页客户端准备的玻璃拟态主题，材质随 agent 的活动状态改变：
		 *
		 *   idle（无任务运行）    → 珍珠白玻璃，疏朗平静，慢速淡变
		 *   work（一轮对话进行中）→ 钢蓝玻璃，锐利果断，快速切换
		 *
		 * 每个心情可以带自己的 MP4/WebM 背景片。两条片子始终保持加载和播放，
		 * 所以切换心情是两条片子之间的交叉淡变，而不是换帧；没有配置片子的
		 * 槽位回退到另一条，片子上方的情绪染色也随心情一起变。
		 *
		 * 它是怎么搭起来的（每条规则都来自官方 ui-theme 的契约，以及成熟的
		 * 玻璃主题早已记录在案的那些"包含层"事故）：
		 *
		 * - 颜色走官方主题服务。`ctx.theme.overrideTokens()` 在用户自选的
		 *   明/暗偏好之上叠一层别名 token；每个值都是 `{ light, dark }` 对，
		 *   所以偏好翻转会自行重新解析，`theme/change` 不需要监听。
		 * - 壁纸只有在主题不再遮挡它时才看得见，所以"通透度"旋钮削薄官方
		 *   背景面板（只改 alpha，绝不动颜色）并淡出情绪染色。文字容器保有
		 *   alpha 下限：可读性不是用户一个误触就能删掉的变量。
		 * - 玻璃需要背后有东西：一个 fixed 舞台坐在 z-index 0，`#root` 抬到
		 *   z-index 1。
		 * - 模糊绝不放在 `#root` 或列容器上：非 none 的 backdrop-filter 会让
		 *   该元素成为所有 fixed 定位后代（菜单、提示、toast）的包含块。它只
		 *   骑在三个已验证安全的目标的 `::before` 伪元素上（输入卡、消息气泡、
		 *   设置弹窗）。
		 * - 菜单材质（`--dsw-menu-surface-fill`、`--dsw-menu-backdrop-filter`）、
		 *   模态遮罩和每一个语义状态色都刻意保持官方原样。
		 * - 配置存在 localStorage（第三方设置命名空间无法通过设置 RPC 写入）；
		 *   选中的视频文件存在 IndexedDB，所以不需要宿主侧，也不需要服务端路由。
		 *
		 * 每一笔写入在 dispose 时都会收回：token 层、样式表、舞台、两个对象
		 * URL、设置行、body 属性和 `window.__dshGlassMood`。
		 */

		//#region constants
		var PLUGIN_ID = "dsh-glass-mood-theme";
		/** 覆盖层身份：一源一层，每次变更重叠。 */
		var SOURCE = "dsh-glass-mood";
		var STYLE_ID = "dsh-glass-mood-style";
		var STAGE_ID = "dsh-glass-mood-bg";
		var FORCE_KEY = "dsh-glass-mood:force";
		var NOBLUR_KEY = "dsh-glass-mood:no-blur";
		var VIDEO_KEY = "dsh-glass-mood:video";
		var IDB_NAME = "dsh-glass-mood";
		var IDB_STORE = "media";
		/** 每心情槽一个 IndexedDB 键；光秃的 `wallpaper` 键是 v1 的遗留。 */
		var IDB_KEY_PREFIX = "wallpaper:";
		var IDB_LEGACY_KEY = "wallpaper";
		var SLOTS = ["idle", "work"];
		/** 珍珠心情返回前的逗留空闲时间——藏住步骤之间的间隙。 */
		var IDLE_ENTER_MS = 1600;
		/** 微小去抖：一帧的闪烁不该切到工作态。 */
		var WORK_ENTER_MS = 120;
		/** 心情替换不早于这个间隔，切换才读得清。 */
		var MIN_DWELL_MS = 600;
		/** 保险网：快照读取很便宜，这条覆盖不主动发通知的数据源。 */
		var POLL_MS = 1500;
		/** 外壳三列与大表面多久重新找一次。 */
		var RETAG_MS = 2500;
		/** 动画进行中，一次列宽变化最多允许多少毫秒花费一次重打标签。 */
		var RESIZE_THROTTLE_MS = 120;
		/** 展开的面板要覆盖多大比例的框，才被认成那个面板。 */
		var OVERLAY_MIN_SPAN = 0.6;
		/** 全屏面板覆盖多宽的框（展开的侧边栏保持让位）。 */
		var FULLSCREEN_MIN_SPAN = 0.6;
		/** 而它的高度是整个框的：它坐在标题栏下方，占满其余部分。 */
		var FULLSCREEN_MIN_HEIGHT = 0.85;
		/** 那次搜索的边界，好让一次探测保持便宜。 */
		var FULLSCREEN_MAX_NODES = 260;
		var FULLSCREEN_MAX_DEPTH = 8;
		/** 呈现层搜索的边界。 */
		var PRESENT_MAX_NODES = 400;
		var PRESENT_MAX_DEPTH = 10;
		/** 诊断构建发一份报告去哪里；正常使用中无人监听。 */
	var REPORT_URL = "http://127.0.0.1:8791/glass-report";
	var REPORT_KEY = "dsh-glass-mood:last-report";
	var REPORT_MAX_POSTS = 14;
		/** 一次性表面交叉淡变的窗口开多久（最慢的淡变 + 余量）。 */
		var FADE_WINDOW_MS = 1100;
		/**
		 * 设置行打印的构建号。它存在的意义，是让"修复没生效"永远不会和"新构建
		 * 根本没加载"混为一谈：屏幕上是谁，在 UI 里就看得见；另有一项测试把它
		 * 与 package.json 锁在一起。
		 */
		var BUILD = "1.52.1";
		/** 停在用户交互上的一轮仍然是工作（这一轮还没结束）。 */
		var COUNT_PENDING_AS_WORK = true;
		/** 通透度拉满时还剩多少情绪染色（0 = 完全没有）。 */
		var TINT_THROUGH_CLARITY = 0.3;
		/**
		 * 壁纸默认值。`tint` 是片子上方的情绪染色；`clarity` 是主题给这部片子
		 * 让多少路（越高 = 面板越薄）。
		 */
		var VIDEO_DEFAULTS = { fit: "cover", opacity: 0.6, blur: 0, tint: 0.35, clarity: 0.45, autoDim: true };
		/** 超过这个大小的 IndexedDB 写入就值得警告一句。 */
		var VIDEO_WARN_BYTES = 400 * 1024 * 1024;
		var PANEL_KEY = "dsh-glass-mood:panels";
	/** 外壳三列，按 DOM 顺序，连同每一列绘制的 token。 */
	var PANEL_KEYS = ["left", "main", "right"];
	/**
	 * 每一列的表面是从哪个官方别名推导出来的。左列画
	 * `--dsw-specific-sidebar-fill`；外框在中间列和右列身后画
		 * `--dsw-alias-bg-base`。
		 */
		var PANEL_BASE_TOKEN = {
			left: "--dsw-specific-sidebar-fill",
			main: "--dsw-alias-bg-base",
			right: "--dsw-alias-bg-base"
		};
		/** 列的查找方式：用外壳自己的类名局部名。 */
		var PANEL_SELECTOR = {
			left: '[class*="_sidebarCol"]',
			main: '[class*="_centerCol"]',
			right: '[data-rightbar-col], [class*="_rightbarCol"]'
		};
		/**
		 * 右栏自己的呈现标记，是从 app 的 bundle 里读出来的，不是猜的：
		 * `ui-sidebar-right` 这样渲染面板元素——
		 * `data-sidebar-right-panel={fullscreen ? "fullscreen" : "push"}`，
		 * `style={{ width: fullscreen ? "100vw" : width }}`，而它自己的样式表
		 * 把面板钉在右列内部：`position:absolute; top:0; bottom:0; right:0`
		 * （`.rightbarCol{min-width:0;position:relative;overflow:visible}`）。
		 *
		 * 所以全屏的右栏不是那一列：列在下面保留自己原来的轨道（同一个包的
		 * README 原话："fullscreen covers the viewport while retaining the
		 * wide-screen columns underneath"），面板向左搭在中间列上盖住它。把材质
		 * 画在列上，于是只覆盖得到面板原来占据的那一条——这正是报上来的
		 * "透明和模糊停在侧栏原来的位置"。这个选择器是 app 自己对那一层的叫法。
		 */
		var RIGHT_PANEL_FULLSCREEN_SELECTOR = '[data-sidebar-right-panel="fullscreen"]';
		/**
		 * 几何与光线默认值。外框 0 保留窗口自己的圆角作为外形；面板 20 是官方
		 * `--dsw-radius-xl`，一张独立内容卡的半径；间隙是两者之间的表面内缩。
		 *
		 * `opacity: -1` 表示"跟随心情调色板自己的 alpha"。任何 ≥0 的值都是该
		 * 面板的绝对 alpha：1 是一块藏起壁纸的实心面板，0 是完全透明。两个极端
		 * 都必须够得着，否则这个旋钮做不到它标签承诺的事。
		 */
		var PANEL_DEFAULTS = {
			left: { opacity: -1, blur: 0, sheen: 1 },
			main: { opacity: -1, blur: 0, sheen: 1 },
			right: { opacity: -1, blur: 0, sheen: 1 },
			gap: 8,
			frameRadius: 0,
			panelRadius: 20,
			divider: 0.35,
			refraction: true,
			rimSpill: true,
			press: true,
			blurFallback: false,
			/**
			 * 材质元素里住着一个 `position: fixed` 控件的面板，不能自己扛磨砂：
			 * backdrop-filter 会让该元素成为每个 fixed 后代的包含块，把 app 自己
			 * 的浮动控件重新锚定（侧边栏的折叠控件就是一个——它离开了顶栏，落
			 * 到了侧边栏 logo 上）。这样的面板改为跳过材质，并把原因报出来。只有
			 * 想确认诊断时才关掉它：控件会再次移位。
			 */
			fixedGuard: true
		};
		/**
		 * 心情自己投在玻璃上的底色。两套调色板都坐在离中性几个百分点的位置，所以
		 * 换心情在面板上曾经几乎看不出来——人读到的"暖"或"冷"过去几乎全来自片子。
		 * 这是材质自己携带的地板，所以玻璃即使完全没有壁纸也跟着心情走；内容自己
		 * 的色相（`rimSpill`）仍骑在它上面。
		 */
		var MOOD_CAST = {
			idle: { hue: 38, mix: 0.1 },
			work: { hue: 206, mix: 0.2 }
		};
		/**
		 * 表面探测的边界。一列的可见表面并不总是列本身：侧边栏把自己的背景画在
		 * 外面一两层包装里，这就是列级填充和列级模糊在那里看不见的原因。探测取
		 * 合格元素中最深的那个——仍然跨满整个面板的最内层盒子——好让填充和磨砂
		 * 都落在它的内容之下，而不是另一层已画颜色的背后。
		 */
		var SURFACE_MAX_NODES = 48;
		var SURFACE_MAX_DEPTH = 5;
		/** 一个表面要在两个轴上至少跨满列的这个比例。 */
		var SURFACE_MIN_COVERAGE = 0.85;
		/** 背景 alpha（或一张背景图）达到这个值才算"画了东西"。 */
		var SURFACE_MIN_ALPHA = 0.04;
		/**
		 * 这么大的内容表面（占视口每个轴的这个比例）算"页面级"：比如设置页。
		 * 更小的是转瞬即逝的弹出层，文件 diff 预览就是其中一个。
		 */
		var BIG_SURFACE_RATIO = 0.42;
		/**
		 * 比这更窄的列是收起的导轨或隐藏的轨道，不是内容面板。给它们上样式
		 * （裁剪、边距、材质）正是侧边栏"展开"控件消失的原因，所以它们保持
		 * app 自己的样式。
		 */
		var COLLAPSED_MAX_WIDTH = 56;
		/** 取色画布刻意这么小：主题只需要一个平均值。 */
		var SAMPLE_WIDTH = 24;
		var SAMPLE_HEIGHT = 14;
		/** 取一帧不贵但也不免费，所以节流得远比轮询稀疏。 */
		var SAMPLE_INTERVAL_MS = 4000;
		/** 平均亮度超过这个值，片子才挣得一层压暗。 */
		var DIM_KNEE = 0.55;
		/** 那层永不超过 Apple 的 35%，也从不压暗本来就暗的片子。 */
		var DIM_MAX = 0.35;
		/** 内容自己的色相把玻璃拉向它多少（0 = 从不）。 */
		var SPILL_MIX = 0.45;
		/** 染色瞄准的饱和度：够看的彩度，读得出是颜色。 */
		var SPILL_SATURATION = 0.34;
		/** 浅色面板先退到这个亮度，染色才有地方站；深色面板不动。 */
		var SPILL_MAX_LIGHTNESS = 0.86;
		/** 低于这个饱和度，片子实质是灰的：没有色相可以溢出。 */
		var SPILL_MIN_SATURATION = 0.08;
		/**
		 * 低于这个亮度，片子就投不出什么值得捡的彩色光，无论它的像素名义上多饱和：
		 * 近黑帧的"色相"是数学的副产品，不是人能看见的东西。
		 */
		var SPILL_MIN_BRIGHTNESS = 0.08;
		/**
		 * 壁纸可见度是一条感知轴，所以一个旋钮同时驱动两半：片子自己的强度，
		 * 和主题给它让多少路。两个分开的滑杆移动的是同一种感知，读起来像重复的。
		 */
		var VISIBILITY_MIN_CLIP = 0.35;
		/**
		 * 液态玻璃边缘的折射：一小点由湍流驱动的位移，作为
		 * `backdrop-filter: url(#…)` 一层施加，让它在元素自己的边缘（背景 alpha
		 * 过渡的地方）弯折背后的画面，中心不受影响。
		 */
		var REFRACTION_ID = "dsh-glass-mood-refraction";
		/**
		 * 是一枚干净的透镜，不是一团糊：单个八度、低振幅的湍流位移背景，没有
		 * 预模糊。当年在这里加 feGaussianBlur，正是这个开关读起来像"更模糊"
		 * 而不是"折射"的原因。
		 *
		 * 它能做什么、不能做什么，说平铺直叙：位移图把整张背景按一个场整体搬移，
		 * 所以铺在一片平滑模糊的壁纸上它几乎看不见——菲涅尔是逐像素、向边缘
		 * 增长的场，湍流不是。可见的边缘功夫因此由 CSS 完成（`::after` 上的四条
		 * 菲涅尔带）；这个滤波器只给它承载的表面添一点不均匀的手工感，且它只骑
		 * 在输入卡、气泡和设置表面上——绝不骑面板列，那里一个浏览器拒绝的
		 * `url()` 会连整层磨砂一起带走。
		 */
		var REFRACTION_SVG =
			'<svg id="' + REFRACTION_ID + '" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' +
			'<filter id="' + REFRACTION_ID + '-filter" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">' +
			'<feTurbulence type="fractalNoise" baseFrequency="0.016 0.02" numOctaves="1" seed="7" result="noise"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>' +
			"</filter></svg>";
		/**
		 * `clarity` 可以把每个 token 的 alpha 削薄多少，以及它永不允许跌到的
		 * alpha。画布和侧边栏揭开片子；任何能承载文字的都保有一个高地板，因为
		 * 片子的亮度未知——可读性是一条地板，不是用户误触就能删掉的设置。
		 */
		var WALL_THIN = [
			["--dsw-alias-bg-base", 0.85, 0.06],
			["--dsw-specific-sidebar-fill", 0.60, 0.20],
			["--dsw-alias-interactive-bg-hover", 0.25, 0.10],
			["--dsw-alias-interactive-bg-active", 0.25, 0.12],
			["--dsw-specific-sidebar-nav-item-hover", 0.25, 0.10],
			["--dsw-specific-sidebar-nav-item-active", 0.25, 0.14]
		];
		/**
		 * 内容表面：壁纸显示期间它们保持的最低 alpha。官方主题把这里每一个都画成
		 * 不透明的静态色，所以壁纸绝不应当侵蚀它们——正是它当年让文件 diff 弹出层
		 * 和设置页变得读不下去。
		 */
		var WALL_PROTECT = [
			["--dsw-alias-bg-document-preview", 0.94],
			["--dsw-alias-bg-overlay", 0.90],
			["--dsw-alias-bg-module-platform", 0.88],
			["--dsw-alias-bg-layer-1", 0.88],
			["--dsw-alias-bg-layer-2", 0.86],
			["--dsw-alias-bg-layer-3", 0.84],
			["--dsw-alias-settings-card-fill", 0.86],
			["--dsw-alias-markdown-code-block", 0.86],
			["--dsw-alias-markdown-inline-code", 0.82],
			["--dsw-specific-input-major", 0.80],
			["--dsw-specific-bubble", 0.72],
			["--dsw-specific-bubble-highlight", 0.68]
		];
		//#endregion

		//#region tokens
		/**
		 * 这个主题拥有的别名表面。刻意收得很窄：背景、边界、标签、品牌强调色、
		 * 交互填充，以及侧边栏 / 输入框 / 气泡的专属项。菜单材质、模态遮罩、
		 * 代码 diff 和状态色都不碰——它们承载意义，或有记载的归属。
		 * 四套调色板，每个值都是 [light, dark] 一对。
		 */
		var TOKEN_KEYS = [
			"--dsw-alias-bg-base",
			"--dsw-alias-bg-layer-1",
			"--dsw-alias-bg-layer-2",
			"--dsw-alias-bg-layer-3",
			"--dsw-alias-bg-overlay",
			"--dsw-alias-bg-module-platform",
			"--dsw-alias-border-l1",
			"--dsw-alias-border-l2",
			"--dsw-alias-border-l3",
			"--dsw-alias-border-l4",
			"--dsw-alias-label-primary",
			"--dsw-alias-label-secondary",
			"--dsw-alias-label-tertiary",
			"--dsw-alias-brand-primary",
			"--dsw-alias-interactive-bg-hover",
			"--dsw-alias-interactive-bg-active",
			"--dsw-alias-button-primary-fill",
			"--dsw-alias-button-primary-hover",
			"--dsw-alias-settings-card-fill",
			"--dsw-alias-settings-card-stroke",
			"--dsw-alias-markdown-code-block",
			"--dsw-alias-markdown-inline-code",
			"--dsw-specific-sidebar-fill",
			"--dsw-specific-sidebar-nav-item-hover",
			"--dsw-specific-sidebar-nav-item-active",
			"--dsw-specific-sidebar-nav-item-active-accent",
			"--dsw-specific-input-major",
			"--dsw-specific-bubble",
			"--dsw-specific-bubble-highlight",
			"--dsw-alias-bg-document-preview",
			"--dsw-alias-label-caption",
			"--dsw-alias-label-dimmed",
			"--dsw-alias-label-document-preview"
		];

		/** 调色板各行按 TOKEN_KEYS 的顺序排列，每心情每配色一套。 */
		var PALETTES = {
			// 空闲 · 珍珠白：白色为主，中性冷灰边界，仅在渐变里留一丝极淡的粉紫。
			idle: {
				light: [
					"rgba(255, 255, 255, 0.64)",
					"rgba(255, 255, 255, 0.60)",
					"rgba(250, 251, 253, 0.54)",
					"rgba(246, 248, 251, 0.52)",
					"rgba(255, 255, 255, 0.92)",
					"rgba(252, 253, 255, 0.56)",
					"rgba(118, 128, 150, 0.20)",
					"rgba(104, 114, 138, 0.30)",
					"rgba(90, 100, 126, 0.40)",
					"rgba(76, 86, 112, 0.50)",
					"#17181C",
					"#50556A",
					"#666C7A",
					"#3D4356",
					"rgba(240, 242, 247, 0.70)",
					"rgba(232, 235, 243, 0.85)",
					"#2F3444",
					"#23283A",
					"rgba(255, 255, 255, 0.55)",
					"rgba(118, 128, 150, 0.24)",
					"rgba(246, 248, 252, 0.60)",
					"rgba(232, 236, 245, 0.75)",
					"rgba(252, 253, 255, 0.52)",
					"rgba(240, 242, 248, 0.65)",
					"rgba(228, 232, 242, 0.85)",
					"#3D4356",
					"rgba(255, 255, 255, 0.68)",
					"rgba(248, 250, 253, 0.62)",
					"rgba(232, 236, 245, 0.85)",
					"rgba(250, 251, 254, 0.94)",
					"#565C6B",
					"#7A808F",
					"#3A3F4C"
				],
				dark: [
					"rgba(18, 19, 23, 0.68)",
					"rgba(30, 32, 38, 0.62)",
					"rgba(38, 41, 48, 0.54)",
					"rgba(45, 48, 57, 0.52)",
					"rgba(24, 26, 31, 0.92)",
					"rgba(26, 28, 34, 0.56)",
					"rgba(198, 204, 255, 0.14)",
					"rgba(200, 206, 255, 0.22)",
					"rgba(202, 208, 255, 0.30)",
					"rgba(204, 210, 255, 0.38)",
					"#ECEDF2",
					"#BCC0CB",
					"#A0A5B3",
					"#9BA3FF",
					"rgba(198, 204, 255, 0.12)",
					"rgba(200, 206, 255, 0.20)",
					"#6366C0",
					"#55589F",
					"rgba(34, 36, 42, 0.52)",
					"rgba(198, 204, 255, 0.20)",
					"rgba(10, 11, 14, 0.65)",
					"rgba(198, 204, 255, 0.16)",
					"rgba(20, 22, 27, 0.56)",
					"rgba(198, 204, 255, 0.12)",
					"rgba(200, 206, 255, 0.22)",
					"#9BA3FF",
					"rgba(32, 34, 41, 0.62)",
					"rgba(34, 37, 44, 0.64)",
					"rgba(200, 206, 255, 0.22)",
					"rgba(28, 30, 36, 0.94)",
					"#B0B5C2",
					"#868C9A",
					"#C6CCD8"
				]
			},
			// 工作 · 冷：钢蓝/冰白玻璃，边界更硬、对比更高。
			work: {
				light: [
					"rgba(246, 250, 253, 0.62)",
					"rgba(255, 255, 255, 0.60)",
					"rgba(238, 244, 250, 0.54)",
					"rgba(228, 237, 246, 0.52)",
					"rgba(250, 253, 255, 0.90)",
					"rgba(242, 247, 252, 0.55)",
					"rgba(96, 130, 168, 0.30)",
					"rgba(78, 112, 152, 0.40)",
					"rgba(60, 94, 136, 0.50)",
					"rgba(46, 78, 118, 0.58)",
					"#101C26",
					"#40556A",
					"#576D7F",
					"#1257AE",
					"rgba(224, 236, 248, 0.65)",
					"rgba(208, 226, 244, 0.80)",
					"#1257AE",
					"#0E4589",
					"rgba(255, 255, 255, 0.52)",
					"rgba(96, 130, 168, 0.32)",
					"rgba(232, 241, 249, 0.60)",
					"rgba(216, 231, 245, 0.75)",
					"rgba(240, 246, 252, 0.50)",
					"rgba(226, 237, 248, 0.60)",
					"rgba(206, 226, 246, 0.85)",
					"#1257AE",
					"rgba(252, 254, 255, 0.62)",
					"rgba(238, 245, 251, 0.60)",
					"rgba(208, 226, 244, 0.80)",
					"rgba(248, 252, 255, 0.94)",
					"#4E5C6B",
					"#747E8C",
					"#35424E"
				],
				dark: [
					"rgba(14, 20, 28, 0.70)",
					"rgba(26, 35, 46, 0.62)",
					"rgba(33, 44, 57, 0.54)",
					"rgba(39, 52, 66, 0.52)",
					"rgba(20, 28, 38, 0.92)",
					"rgba(22, 30, 40, 0.56)",
					"rgba(150, 200, 255, 0.18)",
					"rgba(146, 196, 255, 0.26)",
					"rgba(140, 192, 255, 0.36)",
					"rgba(136, 188, 255, 0.46)",
					"#E8F1F8",
					"#B2C6D4",
					"#96AEBD",
					"#58A6FF",
					"rgba(150, 200, 255, 0.12)",
					"rgba(140, 192, 255, 0.20)",
					"#2A73CE",
					"#2465B4",
					"rgba(30, 41, 53, 0.52)",
					"rgba(150, 200, 255, 0.22)",
					"rgba(10, 15, 21, 0.65)",
					"rgba(150, 200, 255, 0.16)",
					"rgba(17, 24, 33, 0.58)",
					"rgba(150, 200, 255, 0.12)",
					"rgba(140, 192, 255, 0.22)",
					"#58A6FF",
					"rgba(28, 38, 50, 0.62)",
					"rgba(31, 42, 55, 0.64)",
					"rgba(140, 192, 255, 0.22)",
					"rgba(24, 33, 43, 0.94)",
					"#AEBECC",
					"#8494A2",
					"#C4D2DE"
				]
			}
		};

		/**
		 * 组装主题服务要的 `{ token: { light, dark } }` 字典。两个配色都是强制的
		 * （`overrideTokens` 见到裸字符串会抛错），所以缺值或空值是编程错误，
		 * 按编程错误上报。
		 * @param mood - 调色板 id。
		 * @returns 供 `ctx.theme.overrideTokens` 使用的覆盖字典。
		 */
		function pairFor(mood) {
			var palette = PALETTES[mood];
			if (palette === undefined) throw new Error("glass-mood: unknown mood " + String(mood));
			var pair = {};
			for (var i = 0; i < TOKEN_KEYS.length; i++) {
				var name = TOKEN_KEYS[i];
				var light = palette.light[i];
				var dark = palette.dark[i];
				if (typeof light !== "string" || light === "" || typeof dark !== "string" || dark === "") {
					throw new Error("glass-mood: palette " + mood + " is missing a value for " + name);
				}
				pair[name] = { light: light, dark: dark };
			}
			return pair;
		}

		/**
		 * 重写一个 CSS 颜色的 alpha，其余颜色形式一概不碰。只认识 rgba()，这正是
		 * 这些面板用的形状。
		 * @param value - 这个 CSS 颜色。
		 * @param rate - 通透度最多削掉多少，0..1。
		 * @param floor - 这个 token 永不允许跌到的 alpha。
		 * @param clarity - 用户的通透度，0..1。
		 * @returns 新颜色；不是可调暗的 rgba 时原样返回。
		 */
		function dimAlpha(value, rate, floor, clarity) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var alpha = Number(match[4]);
			var next = Math.max(floor, alpha * (1 - rate * clarity));
			return "rgba(" + match[1] + ", " + match[2] + ", " + match[3] + ", " + Math.round(next * 1000) / 1000 + ")";
		}

		/**
		 * 削薄这些面板，好让壁纸真的看得见。颜色从不被重写，只改 alpha，且只改
		 * 有声明预算的那些：没有条目的 token 保持原值。
		 * @param pair - 这个心情的覆盖字典。
		 * @param clarity - 用户的通透度，0..1。
		 * @returns 一个新的覆盖字典。
		 */
		function dimPair(pair, clarity) {
			var next = {};
			for (var name in pair) {
				if (!Object.prototype.hasOwnProperty.call(pair, name)) continue;
				next[name] = { light: pair[name].light, dark: pair[name].dark };
			}
			if (clarity > 0) {
				for (var i = 0; i < WALL_THIN.length; i++) {
					var rule = WALL_THIN[i];
					var token = next[rule[0]];
					if (token === undefined) continue;
					next[rule[0]] = {
						light: dimAlpha(token.light, rule[1], rule[2], clarity),
						dark: dimAlpha(token.dark, rule[1], rule[2], clarity)
					};
				}
			}
			// 保护不是削薄：它把一个内容表面抬回可读的 alpha，只升不降，也绝不碰它的色相。
			for (var p = 0; p < WALL_PROTECT.length; p++) {
				var protect = WALL_PROTECT[p];
				var entry = next[protect[0]];
				if (entry === undefined) continue;
				next[protect[0]] = {
					light: raiseAlpha(entry.light, protect[1]),
					dark: raiseAlpha(entry.dark, protect[1])
				};
			}
			return next;
		}

		/**
		 * 把一个 CSS 颜色抬到至少 `floor`，其余颜色形式一概不碰。只认识 rgba()，
		 * 这正是这些 token 用的形状。
		 * @param value - 这个 CSS 颜色。
		 * @param floor - 壁纸显示期间这个表面保持的 alpha。
		 * @returns 新颜色；不是可抬升的 rgba 时原样返回。
		 */
		function raiseAlpha(value, floor) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var alpha = Math.max(Number(match[4]), floor);
			return "rgba(" + match[1] + ", " + match[2] + ", " + match[3] + ", " + Math.round(alpha * 1000) / 1000 + ")";
		}
		//#endregion

		//#region stylesheet
		/**
		 * 舞台。不透明，所以画布在它下面画的任何东西都不会冲淡玻璃；明/暗变体
		 * 在 `body[data-ds-dark-theme]` 上切换，心情变体通过两组叠层的 opacity
		 * 交叉淡变，它们下面至多两条片子——每心情一条——所以切换心情是两幅会动
		 * 的画面之间的交叉淡变。
		 */
		var IDLE_STAGE_LIGHT =
			"radial-gradient(120% 90% at 10% 0%, #FFEFF3 0%, rgba(255, 239, 243, 0) 60%)," +
			"radial-gradient(100% 80% at 95% 6%, #EEF0FF 0%, rgba(238, 240, 255, 0) 58%)," +
			"radial-gradient(120% 90% at 50% 110%, #F3F6FF 0%, rgba(243, 246, 255, 0) 62%)," +
			"linear-gradient(160deg, #FFFFFF 0%, #FBFBFE 46%, #F6F7FC 100%)";
		var IDLE_STAGE_DARK =
			"radial-gradient(120% 90% at 10% 0%, #2A2740 0%, rgba(42, 39, 64, 0) 62%)," +
			"radial-gradient(100% 80% at 95% 6%, #23283C 0%, rgba(35, 40, 60, 0) 58%)," +
			"radial-gradient(120% 90% at 50% 110%, #1C1F2B 0%, rgba(28, 31, 43, 0) 60%)," +
			"linear-gradient(165deg, #101116 0%, #14161D 48%, #171A23 100%)";
		var WORK_STAGE_LIGHT =
			"radial-gradient(115% 85% at 6% 0%, #CFE1F5 0%, rgba(207, 225, 245, 0) 62%)," +
			"radial-gradient(95% 70% at 98% 10%, #D2E3F2 0%, rgba(210, 227, 242, 0) 58%)," +
			"radial-gradient(120% 90% at 50% 108%, #E4EFFA 0%, rgba(228, 239, 250, 0) 60%)," +
			"linear-gradient(168deg, #F5F9FD 0%, #E6EEF7 50%, #DCE7F3 100%)";
		var WORK_STAGE_DARK =
			"radial-gradient(115% 85% at 6% 0%, #16324C 0%, rgba(22, 50, 76, 0) 62%)," +
			"radial-gradient(95% 70% at 98% 10%, #10303F 0%, rgba(16, 48, 63, 0) 58%)," +
			"radial-gradient(120% 90% at 50% 108%, #14202F 0%, rgba(20, 32, 47, 0) 60%)," +
			"linear-gradient(172deg, #0A1018 0%, #101A26 50%, #0C1620 100%)";

		var CSS = [
			/* ---- 舞台：fixed，片子 + 渐变，垫在被抬起的 app 外框下面 ---- */
			"#" + STAGE_ID + "{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:layout paint style}",
			"#" + STAGE_ID + ">[data-glass-layer]{position:absolute;inset:-4%;transition:opacity var(--gm-fade) cubic-bezier(.4,0,.2,1);will-change:opacity}",
			"#" + STAGE_ID + ">[data-glass-layer=idle]{background-image:" + IDLE_STAGE_LIGHT + "}",
			"body[data-ds-dark-theme] #" + STAGE_ID + ">[data-glass-layer=idle]{background-image:" + IDLE_STAGE_DARK + "}",
			"#" + STAGE_ID + ">[data-glass-layer=work]{background-image:" + WORK_STAGE_LIGHT + ";opacity:0}",
			"body[data-ds-dark-theme] #" + STAGE_ID + ">[data-glass-layer=work]{background-image:" + WORK_STAGE_DARK + "}",
			"body[data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:1}",
			"body[data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:0}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:0}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:1}",
			/* 一轮对话进行中的缓慢凉意呼吸：整个主题里唯一的动作。 */
			"#" + STAGE_ID + ">[data-glass-layer=dim]{inset:0;background:rgba(0,0,0,var(--gm-media-dim,0));transition:background-color var(--gm-fade) cubic-bezier(.4,0,.2,1)}",
			"#" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:0;background:radial-gradient(70% 55% at 50% -10%, rgba(152,178,202,.16) 0%, rgba(152,178,202,0) 70%)}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:.55;animation:gm-breathe 5.5s ease-in-out infinite}",
			/* 片子上方的染色最显眼，所以呼吸退后半步。 */
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:.35}",
			"@keyframes gm-breathe{0%,100%{opacity:.45}50%{opacity:.95}}",
			"@media (prefers-reduced-motion: reduce){body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{animation:none;opacity:.4}}",
		/* ---- 片子：每心情槽一个元素，由心情属性交叉淡变 ----
		   两者都保持播放，所以切换从不等解码器；没有自己片子的槽标为 `both`，
		   服务当前激活的心情。 */
			"#" + STAGE_ID + ">video[data-glass-clip]{position:absolute;inset:0;width:100%;height:100%;object-fit:var(--gm-wall-fit,cover);object-position:center;opacity:0;filter:blur(var(--gm-wall-blur,0px));transform:scale(var(--gm-wall-scale,1));transform-origin:center;pointer-events:none;transition:opacity var(--gm-fade) cubic-bezier(.4,0,.2,1)}",
			"body[data-glass-mood=idle] #" + STAGE_ID + ">video[data-glass-clip=idle],body[data-glass-mood=idle] #" + STAGE_ID + ">video[data-glass-clip=both]{opacity:var(--gm-wall-opacity,0.6)}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">video[data-glass-clip=work],body[data-glass-mood=work] #" + STAGE_ID + ">video[data-glass-clip=both]{opacity:var(--gm-wall-opacity,0.6)}",
			/* 情绪染色骑在片子之上，随通透度升高而淡出。 */
			"body[data-glass-wallpaper=on] #" + STAGE_ID + ">[data-glass-layer=idle]," +
				"body[data-glass-wallpaper=on] #" + STAGE_ID + ">[data-glass-layer=work]{filter:saturate(.4)}",
			"body[data-glass-wallpaper=on][data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:var(--gm-tint,0.3)}",
			"body[data-glass-wallpaper=on][data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:0}",
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:0}",
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:calc(var(--gm-tint,0.3) * .75)}",
			/* ---- 抬起 app 外框：一个朴素的层叠上下文，绝不用 filter ---- */
			"#root{position:relative;z-index:1}",
		/* ---- 心情设计变量（结构，不是颜色）---- */
	/* 磨砂是一层纱，而纱正是把玻璃变成牛奶的东西：Apple 自己的指引（以及
	   对它的每一次审计）把半透明定位在"霜 10-25，超过 30 读起来像奶塑料"。
	   所以白层保持薄，分离感照 Clear 变体挣它的方式去挣——压暗玻璃背后的东西，
	   而不是在上面刷一层——外加一点对比度提升托住文字。模糊同理：Liquid Glass
	   折光，不发雾，所以半径低到片子还认得出。 */
		"body[data-glass-mood]{--gm-fade:520ms;--gm-blur:19px;--gm-sat:118%;--gm-contrast:1.03;--gm-frost:rgba(255,255,255,.055);--gm-rim-strong:rgba(255,255,255,.46);--gm-rim-soft:rgba(255,255,255,.16);--gm-halo:rgba(86,96,140,.10);--gm-tint:0.3;--gm-sheen-mood:0.92;--gm-refract:none}",
		"body[data-glass-mood=work]{--gm-fade:260ms;--gm-blur:10px;--gm-sat:128%;--gm-contrast:1.06;--gm-frost:rgba(214,234,255,.055);--gm-rim-strong:rgba(255,255,255,.55);--gm-rim-soft:rgba(150,200,255,.18);--gm-halo:rgba(24,72,132,.16);--gm-sheen-mood:1.08}",
		"body[data-ds-dark-theme][data-glass-mood]{--gm-frost:rgba(255,255,255,.04);--gm-rim-strong:rgba(255,255,255,.26);--gm-rim-soft:rgba(255,255,255,.10);--gm-halo:rgba(0,0,0,.30)}",
		"body[data-ds-dark-theme][data-glass-mood=work]{--gm-frost:rgba(150,200,255,.045);--gm-rim-strong:rgba(196,226,255,.30);--gm-rim-soft:rgba(150,200,255,.14);--gm-halo:rgba(0,0,0,.34)}",
		/* 减弱动效也必须砍掉心情交叉淡变，而且它必须写在它所覆盖的规则之后：
		   特异性相等时，最后声明的赢。 */
			"@media (prefers-reduced-motion: reduce){body[data-glass-mood]{--gm-fade:1ms}}",
			/* 展开中的列在路上就挣到材质，而不是跳一步。 */
			"@media (prefers-reduced-motion: reduce){body[data-glass-panels] [data-glass-panel]{transition:none}}",
		/* ---- 三个已验证安全目标上的磨砂玻璃 ----
		   backdrop-filter 会把列容器变成它 fixed 定位后代的包含块，所以它骑在
		   一个父级被隔离的 ::before 伪元素上。输入卡和设置弹窗已经就位；只有气泡
		   需要 position:relative。 */
		/* position + z-index，不是 isolation：见上面的背景根注记。 */
			"body[data-glass-blur=on] [data-composer-card]{position:relative;z-index:0}",
			"body[data-glass-blur=on] [data-time-hover-root] [class*=_bubble]{position:relative;z-index:0}",
		/* 页面级内容拿回磨砂：设置表面读起来就像磨砂玻璃，而模糊正是让一层薄表面
		   保持可读的东西。`data-glass-frost` 钩子只由 JS 设在够大、算页面的表面上，
		   所以小的转瞬弹出层——首当其冲是文件 diff 预览——保持实心的官方底色，
		   而不是一个被模糊的。 */
			"body[data-glass-blur=on] [data-glass-frost=on]{position:relative;z-index:0}",
			"body[data-glass-blur=on] [data-composer-card]::before," +
				"body[data-glass-blur=on] [data-time-hover-root] [class*=_bubble]::before," +
				"body[data-glass-blur=on] [data-glass-frost=on]::before{" +
				"content:\"\";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;" +
				"-webkit-backdrop-filter:blur(var(--gm-blur)) saturate(var(--gm-sat)) var(--gm-refract);" +
				"backdrop-filter:blur(var(--gm-blur)) saturate(var(--gm-sat)) var(--gm-refract);" +
				"background-color:var(--gm-frost);" +
				"box-shadow:inset 0 1px 0 var(--gm-rim-strong),inset 0 0 0 1px var(--gm-rim-soft),0 0 24px var(--gm-halo)}",
			/* ---- 表面颜色的一次性交叉淡变，只在换心情前后 ---- */
			"body[data-glass-fading] [class*=_card]," +
				"body[data-glass-fading] [class*=_panel]," +
				"body[data-glass-fading] [class*=_sidebar]," +
				"body[data-glass-fading] [class*=_bubble]," +
				"body[data-glass-fading] [data-composer-card]," +
				"body[data-glass-fading] [data-glass-panel]," +
				"body[data-glass-fading] [data-glass-surface]," +
				"body[data-glass-fading] [data-composer-card]::before," +
				"body[data-glass-fading] [data-time-hover-root] [class*=_bubble]::before{" +
				"transition:background-color var(--gm-fade) cubic-bezier(.4,0,.2,1)," +
				"color var(--gm-fade) cubic-bezier(.4,0,.2,1)," +
				"border-color var(--gm-fade) cubic-bezier(.4,0,.2,1)," +
				"box-shadow var(--gm-fade) cubic-bezier(.4,0,.2,1)," +
				"backdrop-filter var(--gm-fade) cubic-bezier(.4,0,.2,1)," +
				"-webkit-backdrop-filter var(--gm-fade) cubic-bezier(.4,0,.2,1)}",
		/* ---- 外壳三列：一套材质系统，没有月牙 ----
		   官方布局给中间列一个孤零零的圆角、侧边栏留平直，两者之间于是露出一块
		   外框底色（圆角标准警告的那种"月牙"）。这里外形每种排布只归一个表面：
		   有间隙时，每列是一张被沟槽内缩的自己的卡；没间隙时，面板全部方正，
		   外框自己的圆角把它们裁成一张连续的玻璃。 */
			"body[data-glass-panels] [data-glass-panel]{position:relative;z-index:0;margin:var(--gm-gap) calc(var(--gm-gap) / 2) 0;border-radius:var(--gm-radius);overflow:hidden;box-shadow:var(--gm-panel-shadow,none);transition:border-radius 220ms cubic-bezier(.4,0,.2,1),background-color 220ms cubic-bezier(.4,0,.2,1),box-shadow 220ms cubic-bezier(.4,0,.2,1)}",
		/* 全屏的右栏是一层覆盖，不是一列，所以列必须停止画自己的卡——但它保留
		   自己的沟槽，而这是承重墙。它内部那层贴着列的盒子定位 `top:0; right:0;
		   bottom:0`，所以列自己的沟槽正是把展开的面板按在和其他每张卡同一个节奏
		   上的东西：上和右的间隙来自列的 margin，下面那个来自外框的 `padding-bottom`。
		   清掉 margin（这条规则过去的做法）会让面板贴到标题栏上，而外框的 padding
		   仍然把它托离底边——报上来的"上面的间隙没了，下面的还在"。所以 margin 在
		   这里刻意不碰，这也让列的几何在两种模式下完全一致。

		   `border-radius` 同样刻意不碰。它过去被设成 0，从这一列还是这一模式下的
		   面板那时候起——而因为每个面板都带 `transition: border-radius 220ms`，
		   收起时会把列从方形动画回 12px。材质在同一刻回到列上，于是这个切换播放成
		   "先方，再圆回去"。不动圆角，就没有东西可动画。 */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=right]{overflow:visible;box-shadow:none}",
		/* 列还必须停止画自己的镜边和分隔线。那层覆盖是一个定位的 `::after`——最后
		   一个子元素，所以它画在 app 呈现的面板之上——而列这里仍然只有 447px 宽。
		   放任不管，它会把左缘的镜边和分隔线画成一条亮直线，直穿展开面板的中线：
		   那正是旧中间面板和旧右面板之间的缝，活进了一个两个盒子都不代表任何东西
		   的模式。外形和镜边现在归那一层。 */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=right]::after{content:none}",
		/* 右栏全屏呈现期间，中间面板保持挂载，但必须停止透过它显示。呈现层是 app
		   自己的，可能只是部分透明，所以没有这条规则，中间面板会在展开面板后面读作
		   一个幽灵——而人在那里看到的是它的模糊，不是展开面板的。用 `visibility`
		   而不是 `display`：网格保住它的列，什么都不回流，收起即恢复。 */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=main]{margin-right:0;visibility:hidden}",
		/* 它的镜边也停止绘制，而不是只留给 `visibility` 发落。一个隐藏的面板理应
		   什么都不留；镜边覆盖层是一个独立定位的子元素，同时带着一道阴影和一个角落
		   渐变，而"旧中间面板的阴影还在那里"正是它继续画时的样子。 */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=main]::after{content:none}",
		/* 列就是表面：它的布局包装绝不能在它之上再画一层填充，否则不透明度旋钮
		   会看不见。 */
			"body[data-glass-panels] [data-glass-panel] > *{background-color:transparent}",
		/* 探测找到更深的内层表面时，颜料和磨砂搬到它身上，列退到一边——否则两层
		   叠起来，旋钮只移动得到那个看不见的。 */
			"body[data-glass-panels] [data-glass-panel][data-glass-delegate=on]{background-color:transparent}",
		/* 一个看不见壁纸的画手交出自己那一层，好让列的材质（和它的磨砂）成为显形
		   的那一层。 */
			"body[data-glass-panels] [data-glass-hollow]{background-color:transparent;background-image:none}",
			"body[data-glass-panels] [data-glass-surface]{position:relative;z-index:0;border-radius:var(--gm-radius);overflow:hidden}",
		/* 外形必须在表面上，不能只在列上。
		   一个被授权的面板自己不画填充（`background-color:transparent`），所以列上
		   的圆角画不出任何东西——没有颜料可圆。颜料在内层表面上，它自己的半径是 0，
		   且它按列的确切尺寸坐在列里面，所以列上的 `overflow:hidden` 没什么可裁。
		   结果是一块量着 `border-radius: 12px` 的面板长了方角：半径被问到了那个
		   什么都不画的元素头上。现在两者都圆，表面裁它自己的内容。 */
		/* 全屏的右栏由 app 定位：`position:absolute`，在右列内部锚定 top/bottom/
		   right，好向左搭过中间列、盖住整个框。上面那条通用表面规则会答
		   `position:relative`，把它掉回列的流里——那不只是放错材质，而是撤销 app
		   正在绘制的呈现。这个宿主因此保留 app 给它的位置；多出来的那个属性就是
		   赢得特异性较量的东西。 */
			"body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{position:absolute}",
		/* 外形跟着材质走。两件事让它读起来是一张卡，而不是一张卡套一张卡：

		   1. 它裁。app 给里面的窗格自己的 `--dsh-windows-content-radius`，且只在
		      左上角，所以不裁的话，那个角会显出两弧不同半径的嵌套——外面的玻璃和
		      里面的窗格。裁到外半径，只留一个外形。（app 自己的注记"only fullscreen
		      panels clip overflow for that corner"说的是同一个角。）
		   2. 四个角全圆。这条规则过去写 `R 0 0 R`，因为那一层锚在窗口右缘，在那里
		      圆角会凭空咬出两弯壁纸。那个理由在面板有了自己的沟槽后失效了（见下面
		      的 max-width）：它现在离边缘 6px 停下，所以右侧和其他边一样是自由边，
		      而留着方角会让展开的面板成为屏幕上唯一两个方角的面板。 */
			"body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{border-radius:var(--gm-radius);overflow:hidden}",
		/* 左侧需要自己的沟槽。层的宽度来自 app（`100vw`，封顶到 `100vw - sidebar`），
		   所以列的 margin 够不到它——而没有这条规则，面板的左缘正压在侧边栏上，
		   而不是和其他每张卡保持同一个间隙。封顶值在那道缝的两侧各缩一个间隙：一半
		   是侧边栏自己的右沟槽，另一半是这个。仅 Windows，因为它读的变量
		   （`--dsh-windows-sidebar-width`）只在那里发布——app 自己的封顶同样只
		   在 Windows，同一个原因。 */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{max-width:calc(100vw - var(--dsh-windows-sidebar-width) - var(--gm-gap) - var(--gm-gap) / 2)}",
		/* 全屏面板里面的窗格带来它自己的左上圆角：
		   `[data-windows-titlebar] .OUqwTW_panel[data-sidebar-right-panel=fullscreen]
		    [data-dockkit-column="0"][data-dockkit-pane]{border-radius:var(--dsh-windows-content-radius) 0 0 0}`
		   ——16px，对本主题的 12px。同一个角上两弧不同的半径就是报上来的重影，而裁剪
		   修不了它：窗格坐在面板里面，`overflow:hidden` 永远够不到。
		   所以是窗格跟玻璃，不是玻璃跟窗格——圆角旋钮继续当家，只有一个外形。 */
		/* `[data-windows-titlebar]` 在这里不是装饰——它是赢的那个。app 自己给这个
		   窗格的规则是
		     [data-windows-titlebar] .OUqwTW_panel[data-sidebar-right-panel=fullscreen]
		       [data-dockkit-column="0"][data-dockkit-pane]   → (0,5,0)
		   同一条规则去掉那个前缀只有 (0,4,1)，所以它输了，那个角继续画两弧，而测试
		   ——只检查了文本存在——保持绿色。特异性是契约的一部分。 */
		/* 干脆不要圆角，不是"同样的圆角"。
		   只有一个元素可以拥有外形。玻璃（这一层）拥有它；窗格是它里面的内容容器，
		   带着 app `--dsh-windows-content-radius` 给它的弧（16px）。配成 12px 仍然
		   会留下两弧，只要两个盒子不是像素级一致——而内容容器从来差一点。没有半径
		   它就画不出弧，而窗格正坐在层的盒子上，层自己的 `overflow:hidden` 把它的
		   方角裁掉。 */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-fullscreen] [data-dockkit-column=\"0\"][data-dockkit-pane]{border-radius:0}",
		/* 一个表面，不是两个。窗格画着自己苍白的一层（`rgba(255,255,255,0.094)`），
		   两个同样盒子、同样半径的圆角矩形叠起来本该重合——但其中只有一个透明，
		   所以人看到的边缘是窗格的，画在玻璃内侧一点点。那条细缝就是重影的残留。
		   它还意味着不透明度旋钮在撒谎：拉到 0，窗格仍然显示一层旋钮够不着的白。
		   下面的玻璃才是表面；窗格是内容。 */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-fullscreen] [data-dockkit-pane]{background-color:transparent}",
		/* 镜边也跟着走，用右栏自己的高光旋钮——否则展开的面板就是屏幕上唯一一块有
		   填充有磨砂却没有边缘光的面板，那读起来是平涂，不是玻璃。 */
			"body[data-glass-panels] [data-glass-fullscreen]{--gm-sheen:calc(var(--gm-panel-right-sheen) * var(--gm-panel-right-rim,1))}",
		/* 侧边栏的表面比它的列宽。app 从轨道给它量尺寸（实测：表面 269px 在 260px
		   的列里），因为本主题用沟槽内缩列。所以它的角坐在列外 9px，列的
		   `overflow:hidden` 把它切成一截残段——这就是侧边栏的角读起来比中间面板的
		   小的原因，尽管两者都量着 12px。这里列拥有外形，表面只画颜料。（中间列的
		   表面恰好是它列的尺寸，所以它自己的 12px 重合、不花代价——但一个叠在列上
		   的表面绝不能圆。） */
			"body[data-glass-panels] [data-glass-surface=left]{--gm-panel-blur:var(--gm-panel-left-blur);background-color:var(--gm-panel-left-fill);border-radius:0}",
			"body[data-glass-panels] [data-glass-surface=main]{--gm-panel-blur:var(--gm-panel-main-blur);background-color:var(--gm-panel-main-fill)}",
			"body[data-glass-panels] [data-glass-surface=right]{--gm-panel-blur:var(--gm-panel-right-blur);background-color:var(--gm-panel-right-fill)}",
		/* 磨砂刻意不挂在透明度偏好上。跳过它看起来像白捡（实心面板没什么可看透），
		   但这也意味着一次偏好读取就能悄悄禁用模糊旋钮——而实心面板上的模糊本来就
		   看不见。 */
		/* 模糊骑在伪元素上，绝不骑在面板元素自己身上：一个带 backdrop-filter 的
		   元素会成为它 fixed 定位后代的包含块，会移走任何住在面板里的浮动控件。
		   伪元素没有后代，所以安全——而壁纸舞台在外壳内部后，它的背景现在包含片子。 */
		/* 浏览器确实认的模糊：在承载材质的那个元素上，这样它取样的背景和填充透出来
		   的是同一张。 */
		/* 自检必须能自证：它强制一个足够毁掉 6px 棋盘格的模糊，无论面板用哪种排布。 */
			"body[data-glass-selftest=on] [data-glass-blur-host=element]," +
				"body[data-glass-selftest=on] [data-glass-surface]::before," +
				"body[data-glass-selftest=on] [data-glass-panel]:not([data-glass-delegate=on])::before{" +
				"-webkit-backdrop-filter:blur(40px) !important;backdrop-filter:blur(40px) !important}",
			"body[data-glass-panels][data-glass-blur=on] [data-glass-blur-host=element]{" +
				"-webkit-backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03));" +
				"backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03))}",
			"body[data-glass-panels][data-glass-blur=on] [data-glass-surface]:not([data-glass-blur-host=element])::before{" +
				"content:\"\";position:absolute;inset:0;z-index:-1;pointer-events:none;background:transparent;" +
				"-webkit-backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03));" +
				"backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03))}",
			"body[data-glass-panels][data-glass-blur=on] [data-glass-panel]:not([data-glass-delegate=on]):not([data-glass-blur-host=element])::before{" +
				"content:\"\";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;background:transparent;" +
				"-webkit-backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03));" +
				"backdrop-filter:blur(var(--gm-panel-blur)) saturate(var(--gm-sat)) contrast(var(--gm-contrast,1.03))}",
			"body[data-glass-panels] [data-glass-panel=left]{--gm-panel-blur:var(--gm-panel-left-blur);--gm-sheen:calc(var(--gm-panel-left-sheen) * var(--gm-panel-left-rim,1));--gm-panel-shadow:var(--gm-panel-left-shadow);margin-left:var(--gm-gap);background-color:var(--gm-panel-left-fill)}",
			"body[data-glass-panels] [data-glass-panel=main]{--gm-panel-blur:var(--gm-panel-main-blur);--gm-sheen:calc(var(--gm-panel-main-sheen) * var(--gm-panel-main-rim,1));--gm-panel-shadow:var(--gm-panel-main-shadow);background-color:var(--gm-panel-main-fill)}",
			"body[data-glass-panels] [data-glass-panel=right]{--gm-panel-blur:var(--gm-panel-right-blur);--gm-sheen:calc(var(--gm-panel-right-sheen) * var(--gm-panel-right-rim,1));--gm-panel-shadow:var(--gm-panel-right-shadow);margin-right:var(--gm-gap);background-color:var(--gm-panel-right-fill)}",
		/* 配色在 JS 里解析（每面板一个已发布的填充跟随呈现器），所以这里刻意没有
		   按配色的变体。 */
		/* 收起的右列让中间面板成为最后一个表面。 */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-collapsed] [data-glass-panel=main]{margin-right:var(--gm-gap)}",
			/* 外层那张：透明沟槽、圆角，和唯一的裁剪外形。 */
			"body[data-glass-panels] [data-glass-frame]{border-radius:var(--gm-frame-radius);padding-bottom:var(--gm-gap)}",
		/* 只有齐平排布需要外框下剪；有间隙时绝不能裁掉 app 自己的浮动控件（侧边栏
		   的重开控件就是一个）。 */
			"body[data-glass-panels][data-glass-gap=off] [data-glass-frame]{overflow:hidden}",
			"body[data-glass-panels][data-glass-gap=on] [data-glass-frame]{background:transparent}",
		/* 标题栏是一个带不透明填充的伪元素，横跨每个面板之上的整个窗口：
		     [data-windows-titlebar] .BynINW_frame:before{
		       content:""; height:var(--dsh-windows-titlebar-height);
		       background:var(--dsw-specific-sidebar-fill); inset:0 0 auto }
		   本主题里其他一切都浮在壁纸上，唯独这条带子从没入过系统——而因为它的底边
		   死直，面板的圆角正好坐在它下面，读起来像"一个直角阴影压在角上"。它是整个
		   排布里唯一一条不透明的带，所以它和其他部分一样变透明。拖动区域一概不变。 */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-frame]::before{background:transparent}",
		/* 镜边 + 分隔线覆盖层：`::after` 是一个定位子元素，所以它画在列的在流内容
		   之上。画成列自己的 inset 阴影的分隔线做不到——侧边栏表面会盖住它，这正是
		   旋钮看起来死了的原因。遮罩把 box-shadow 裁到环上，所以向外的接触阴影住在
		   面板自己身上（见上面的 box-shadow）。 */
	/* 菲涅尔，不是一根发丝。掠射光恰好在边界最亮、向内按曲线衰减，所以镜边是四条
	   边带（每边一条），不是一道横跨面板的平渐变：每条带从周长起步、向内熄灭，而
	   角——两条带重叠的地方——捕到最多的光，真正的圆边就是这样。两道角落渐变
	   承载主光和它的对光，两道 1px  fringe 给边缘它的色散。带子有几 px 宽是刻意的：
	   1px 的环读起来是边框，不是玻璃。 */
		"body[data-glass-panels] [data-glass-panel]::after," +
			"body[data-glass-panels] [data-glass-fullscreen]::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;" +
			"background:" +
			"linear-gradient(to bottom,var(--gm-rim-a) 0,var(--gm-rim-b) 18%,transparent 58%) top center/100% var(--gm-rim-band,10px) no-repeat," +
			"linear-gradient(to top,var(--gm-rim-c) 0,transparent 62%) bottom center/100% calc(var(--gm-rim-band,10px) * .7) no-repeat," +
			"linear-gradient(to right,var(--gm-rim-b) 0,transparent 62%) center left/var(--gm-rim-band,10px) 100% no-repeat," +
			"linear-gradient(to left,var(--gm-rim-c) 0,transparent 62%) center right/calc(var(--gm-rim-band,10px) * .7) 100% no-repeat," +
		/* 捕光曾经是一个固定的 90x70 椭圆。铺在 12px 的角上，它的曲率对不上任何
		   东西，于是那个角画出自己的第二弧——那就是报上来的重影，而且它总是左上
		   那个，因为这是唯一带捕光的角（右下带的是暗部）。面板设到这么透之后，镜边
	   是人看到的大部分，所以它占了主导。它现在按面板自己的半径缩放，读起来是角在
	   捕光，而不是另一道外形。 */
			"radial-gradient(calc(var(--gm-radius,20px) * 2.6) calc(var(--gm-radius,20px) * 2.1) at 0% 0%,var(--gm-rim-catch,rgba(255,255,255,.12)) 0,transparent 68%)," +
			"radial-gradient(120px 100px at 100% 100%,var(--gm-rim-shade,rgba(84,104,150,.07)) 0,transparent 66%);" +
			"opacity:calc(var(--gm-sheen) * var(--gm-sheen-mood,1) * var(--gm-sheen-edge,1));" +
			"box-shadow:inset 0 1px 0 var(--gm-rim-disp,var(--gm-rim-a)),inset 0 -1px 0 var(--gm-rim-warm,transparent)," +
			"inset 0 0 0 1px var(--gm-rim-edge),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
			/* 分隔线住在那层覆盖上，所以它画在侧边栏表面之上。 */
			"body[data-glass-panels][data-glass-gap=off] [data-glass-panel=left]::after{box-shadow:inset -1px 0 0 0 var(--gm-divider),inset 0 1px 0 var(--gm-rim-a),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
			"body[data-glass-panels][data-glass-gap=off] [data-glass-panel=right]::after{box-shadow:inset 1px 0 0 0 var(--gm-divider),inset 0 1px 0 var(--gm-rim-a),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
		/* 交互反馈：一次让控件变形的按压，来自沉浸材质规范（`interactive`）。它用
		   `scale` 属性而不是 `transform`，所以动不了 app 的 transform，且只限于
		   真正可按的控件。 */
			"@keyframes gm-press{from{scale:1}to{scale:.972}}",
			"body[data-glass-press=on] button:active,body[data-glass-press=on] [role=button]:active," +
				"body[data-glass-press=on] [role=tab]:active,body[data-glass-press=on] [role=menuitem]:active{" +
				"animation:gm-press 160ms cubic-bezier(.2,.8,.2,1) forwards}",
			"@media (prefers-reduced-motion: reduce){body[data-glass-press=on] button:active," +
				"body[data-glass-press=on] [role=button]:active,body[data-glass-press=on] [role=tab]:active," +
				"body[data-glass-press=on] [role=menuitem]:active{animation:none}}",
			/* ---- 壁纸设置行：只消费官方别名 token ---- */
			".gm-row{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:12px;background:var(--dsw-alias-settings-card-fill,rgba(127,127,127,.08));box-shadow:inset 0 0 0 1px var(--dsw-alias-settings-card-stroke,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}",
			".gm-row-title{font-size:14px;font-weight:500}",
			".gm-row-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:2px;overflow-wrap:anywhere}",
			".gm-clip{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
			".gm-clip-label{flex:0 0 62px;color:var(--dsw-alias-label-secondary);font-size:12px}",
			".gm-row-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
			".gm-fields{display:flex;flex-wrap:wrap;gap:14px;align-items:center}",
			".gm-input{flex:1 1 200px;min-width:150px;height:32px;padding:0 10px;border-radius:8px;border:0;background:var(--dsw-alias-interactive-bg-hover);color:inherit;font:inherit;outline:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}",
			".gm-input:focus-visible,.gm-btn:focus-visible,.gm-field select:focus-visible,.gm-field input:focus-visible{box-shadow:0 0 0 var(--dsw-focus-ring-width,2px) var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176E6))}",
			".gm-btn{height:32px;padding:0 12px;border-radius:8px;border:0;cursor:pointer;font:inherit;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}",
			".gm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}",
			".gm-btn:disabled{opacity:.45;cursor:default}",
			".gm-field{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}",
			".gm-val{min-width:40px;text-align:right;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
			".gm-field input[type=range]{width:88px;accent-color:var(--dsw-alias-brand-primary)}",
			".gm-field select{height:28px;border-radius:6px;border:0;padding:0 6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;outline:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}"
		].join("\n");
		//#endregion

		//#region helpers
		/**
		 * 读一个可选服务，不假设 context 暴露了 `get`。
		 * @param ctx - 客户端 context。
		 * @param name - 服务键。
		 * @returns 这个服务；缺席时返回 undefined。
		 */
		function getService(ctx, name) {
			if (ctx === undefined || ctx === null || typeof ctx.get !== "function") return undefined;
			try {
				return ctx.get(name);
			} catch (error) {
				return undefined;
			}
		}

		/**
		 * 让一个视频保持播放。自动播放只对静音的行内视频开放；被拒绝在管得严的页面上
		 * 是预期内的，且绝不能弄坏插件。
		 * @param video - 这个 video 元素。
		 */
		function startPlayback(video) {
			try {
				video.muted = true;
				video.defaultMuted = true;
				video.loop = true;
				video.playsInline = true;
				video.autoplay = true;
				video.setAttribute("muted", "");
				video.setAttribute("playsinline", "");
				var started = video.play();
				if (started !== undefined && started !== null && typeof started.catch === "function") {
					started.catch(function () { /* 自动播放被拒：舞台保留渐变 */ });
				}
			} catch (error) { /* 没有媒体播放能力的浏览器照样拿到渐变 */ }
		}

		/** 一个片子槽，规范化后的。 */
		function normalizeClip(raw) {
			var source = raw === undefined || raw === null ? {} : raw;
			var kind = source.source === "url" || source.source === "file" ? source.source : "";
			var url = typeof source.url === "string" ? source.url : "";
			return {
				source: kind === "url" && url === "" ? "" : kind,
				url: url,
				name: typeof source.name === "string" ? source.name : ""
			};
		}

		/**
		 * 规范化一份存着或打补丁进来的壁纸配置。v1 的形状（顶层一个视频）被读成
		 * idle 槽，这样一次既有安装不用用户动任何东西就继续工作。
		 * @param raw - 存着的 JSON，或一个补丁。
		 * @returns 一份完整的配置。
		 */
		function normalizeVideo(raw) {
			var source = raw === undefined || raw === null ? {} : raw;
			var autoDim = source.autoDim === undefined ? VIDEO_DEFAULTS.autoDim : source.autoDim === true;
			var clips = source.clips;
			if (clips === undefined) {
				clips = {
					idle: { source: source.source, url: source.url, name: source.name },
					work: null
				};
			}
			var fit = source.fit === "contain" || source.fit === "fill" ? source.fit : "cover";
			var opacity = Number(source.opacity);
			var blur = Number(source.blur);
			var tint = Number(source.tint);
			var clarity = Number(source.clarity);
			return {
				clips: {
					idle: normalizeClip(clips.idle),
					work: normalizeClip(clips.work)
				},
				fit: fit,
				opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : VIDEO_DEFAULTS.opacity,
				blur: Number.isFinite(blur) ? Math.min(32, Math.max(0, Math.round(blur))) : VIDEO_DEFAULTS.blur,
				tint: Number.isFinite(tint) ? Math.min(0.9, Math.max(0, tint)) : VIDEO_DEFAULTS.tint,
				clarity: Number.isFinite(clarity) ? Math.min(1, Math.max(0, clarity)) : VIDEO_DEFAULTS.clarity,
				autoDim: autoDim
			};
		}

		/** @returns 是否有任一槽带着片子。 */
		function hasWallpaperConfig(config) {
			return config.clips.idle.source !== "" || config.clips.work.source !== "";
		}

		/**
		 * 一个 CSS 颜色实际作画时用的 alpha。
		 * @param color - 计算后的 `background-color`。
		 * @returns 0..1。
		 */
		function parseAlpha(color) {
			if (typeof color !== "string" || color === "" || color === "transparent") return 0;
			var rgba = /^rgba\(([^)]*)\)$/.exec(color);
			if (rgba !== null) {
				var parts = rgba[1].split(",");
				return parts.length > 3 ? Number(parts[3]) || 0 : 1;
			}
			return color.charAt(0) === "#" || /^rgb\(/.test(color) ? 1 : 0;
		}

		/**
		 * @param node - 一个候选表面元素。
		 * @returns 它是否住在一个对话框里。模态永远不是一个面板的表面：它来了又走，
		 * 而把一个当成表面，会让面板的材质在每次设置页重渲染时来回翻。
		 */
		function insideModal(node) {
			var walk = node;
			while (walk !== null && walk !== undefined) {
				if (typeof walk.getAttribute === "function") {
					if (walk.getAttribute("role") === "dialog" || walk.getAttribute("role") === "alertdialog") return true;
					if (walk.getAttribute("aria-modal") === "true") return true;
				}
				walk = walk.parentElement !== undefined ? walk.parentElement : walk.parent;
			}
			return false;
		}

		/**
		 * 找到真正画一列表面的那个元素：仍然跨满大半个列、并且画了东西（背景色或
		 * 背景图）的最深后代。计算样式只在按需时读（挂载、面板变化、列重建），
		 * 绝不在廉价的重新打标签轮询上读。
		 * @param win - 窗口（提供 getComputedStyle）。
		 * @param column - 列元素。
		 * @returns 表面元素；列自己就是表面时返回 null。
		 */
		function findSurface(win, column) {
			var all = paintersIn(win, column);
			return all.length === 0 ? null : all[all.length - 1];
		}

		/**
		 * 一列中每个跨满它并且画了东西的元素，最浅的在前。
		 * @param win - 窗口（提供 getComputedStyle）。
		 * @param column - 列元素。
		 * @returns 画手们；没有则为空数组。
		 */
		function paintersIn(win, column) {
			if (win === undefined || win === null || typeof win.getComputedStyle !== "function") return null;
			if (column === undefined || column === null || typeof column.getBoundingClientRect !== "function") return null;
			var box = column.getBoundingClientRect();
			if (!(box.width > 0) || !(box.height > 0)) return null;
			var queue = [{ node: column, depth: 0 }];
			var visited = 0;
			var found = [];
			while (queue.length > 0 && visited < SURFACE_MAX_NODES) {
				var entry = queue.shift();
				visited += 1;
				var children = entry.node.children;
				if (children === undefined || children === null || entry.depth >= SURFACE_MAX_DEPTH) continue;
				for (var i = 0; i < children.length; i++) {
					var child = children[i];
					if (child === undefined || child === null) continue;
					if (child.nodeType !== undefined && child.nodeType !== 1) continue;
					if (insideModal(child)) continue;
					queue.push({ node: child, depth: entry.depth + 1 });
					if (typeof child.getBoundingClientRect !== "function") continue;
					var childBox = child.getBoundingClientRect();
					if (!(childBox.width >= box.width * SURFACE_MIN_COVERAGE)) continue;
					if (!(childBox.height >= box.height * SURFACE_MIN_COVERAGE)) continue;
					var style = null;
					try { style = win.getComputedStyle(child); } catch (error) { style = null; }
					if (style === null || style === undefined) continue;
					var paints = parseAlpha(style.backgroundColor) >= SURFACE_MIN_ALPHA;
					if (!paints && typeof style.backgroundImage === "string" && style.backgroundImage !== "none" && style.backgroundImage !== "") paints = true;
				// 继续往下走：最深的画手才是其子元素为面板内容的那个，材质该归它。
					if (paints) found.push(child);
				}
			}
			return found;
		}

		/**
		 * 一个已被授权的表面是否还挣得住这份材质。授权是从一次测量发出去的，而布局
		 * 在它脚下移动：右栏全屏时列变宽，而接过材质的内层表面保持旧宽度，于是窗格
		 * 的填充和模糊不再覆盖整个面板，app 自己的颜料从剩余部分透出来。
		 * @param win - 窗口（提供 getComputedStyle）。
		 * @param column - 材质本要回退到的列。
		 * @param node - 当前持有材质的表面。
		 * @returns 它仍跨满该列且仍画着东西时为 true。
		 */
		function surfaceStillCovers(win, column, node) {
			if (win === undefined || win === null || typeof win.getComputedStyle !== "function") return false;
			if (node === undefined || node === null || typeof node.getBoundingClientRect !== "function") return false;
			if (column === undefined || column === null || typeof column.getBoundingClientRect !== "function") return false;
			var columnBox = column.getBoundingClientRect();
			if (!(columnBox.width > 0) || !(columnBox.height > 0)) return false;
			var box = node.getBoundingClientRect();
			if (!(box.width >= columnBox.width * SURFACE_MIN_COVERAGE)) return false;
			if (!(box.height >= columnBox.height * SURFACE_MIN_COVERAGE)) return false;
			var style = null;
			try { style = win.getComputedStyle(node); } catch (error) { style = null; }
			if (style === null || style === undefined) return false;
			if (parseAlpha(style.backgroundColor) >= SURFACE_MIN_ALPHA) return true;
			return typeof style.backgroundImage === "string" && style.backgroundImage !== "none" && style.backgroundImage !== "";
		}

		/** 把一个数夹进范围，非有限时用兜底值。 */
		function clampNumber(value, min, max, fallback) {
			var number = Number(value);
			return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
		}

		/**
		 * 规范化面板材质配置。每个值都被夹过而不是被信任：这个形状由滑杆写，也由
		 * 手改存储写。
		 * @param raw - 存着的 JSON，或一个补丁。
		 * @returns 一份完整的面板配置。
		 */
		function normalizePanels(raw) {
			var source = raw === undefined || raw === null ? {} : raw;
			var panels = {};
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var key = PANEL_KEYS[i];
				var base = PANEL_DEFAULTS[key];
				var given = source[key] === undefined || source[key] === null ? {} : source[key];
				panels[key] = {
					// -1 是"跟随调色板"的哨兵值；0..1 是绝对 alpha。
					opacity: Math.round(clampNumber(given.opacity, -1, 1, base.opacity) * 1000) / 1000,
					blur: Math.round(clampNumber(given.blur, 0, 48, base.blur)),
					sheen: clampNumber(given.sheen, 0, 1, base.sheen)
				};
			}
			return {
				left: panels.left,
				main: panels.main,
				right: panels.right,
				gap: Math.round(clampNumber(source.gap, 0, 24, PANEL_DEFAULTS.gap)),
				frameRadius: Math.round(clampNumber(source.frameRadius, 0, 40, PANEL_DEFAULTS.frameRadius)),
				panelRadius: Math.round(clampNumber(source.panelRadius, 0, 32, PANEL_DEFAULTS.panelRadius)),
				divider: clampNumber(source.divider, 0, 1, PANEL_DEFAULTS.divider),
				refraction: source.refraction === undefined ? PANEL_DEFAULTS.refraction : source.refraction === true,
				rimSpill: source.rimSpill === undefined ? PANEL_DEFAULTS.rimSpill : source.rimSpill === true,
			press: source.press === undefined ? PANEL_DEFAULTS.press : source.press === true,
			blurFallback: source.blurFallback === undefined ? PANEL_DEFAULTS.blurFallback : source.blurFallback === true,
			fixedGuard: source.fixedGuard === undefined ? PANEL_DEFAULTS.fixedGuard : source.fixedGuard === true
		};
		}

		/**
		 * 一个面板的填充在一种配色下可以用的 alpha。
		 *
		 * 两种模式，差别要紧：
		 *  - `opacity < 0`（自动）：官方别名自己的 alpha，按壁纸可见度预算削薄，
		 *    这样面板跟随心情调色板。
		 *  - `opacity >= 0`（显式）：一个绝对 alpha。它刻意压过可见度削薄，否则
		 *    "完全不透明"仍会让壁纸以 38% 透出来，旋钮永远做不到标签承诺的事。
		 * @param key - 面板键。
		 * @param scheme - 'light' 或 'dark'。
		 * @param panels - 面板配置。
		 * @param clarity - 壁纸通透度，0..1。
		 * @param wallpaperOn - 是否配置了片子。
		 * @param mood - 提供底色的那个心情的调色板。
		 * @param sample - 上一次媒体读数，内容染色开关打开时它的色相给窗格上色。
		 * 没有它什么都不染。
		 * @returns 一个 CSS 颜色。
		 */
		function panelFill(key, scheme, panels, clarity, wallpaperOn, mood, sample, reducedTransparency) {
			var token = PANEL_BASE_TOKEN[key];
			var value = pairFor(mood === "work" ? "work" : "idle")[token][scheme];
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var explicit = panels[key].opacity;
			var alpha;
		if (reducedTransparency === true) {
			// "减弱透明"压过可见度旋钮：一个你必须透过它读的面板，正是这个偏好
			// 要求去掉的东西。
			alpha = 1;
			} else if (explicit >= 0) {
				alpha = explicit;
			} else {
				alpha = Number(match[4]);
				var rate = 0;
				var floor = 0;
				for (var i = 0; i < WALL_THIN.length; i++) {
					if (WALL_THIN[i][0] !== token) continue;
					rate = WALL_THIN[i][1];
					floor = WALL_THIN[i][2];
				}
				if (wallpaperOn && rate > 0) alpha = Math.max(floor, alpha * (1 - rate * clarity));
			}
		// 内容自己的色相抵达窗格，绝不抵达片子：片子保留它的颜色，玻璃沾一点它的意思。
		// 开关关着时什么都不染，因为那时 `sample` 是 null。
		var reading = sample === undefined || sample === null ? null : sample;
		// 心情的底色先行，好让窗格自己就读出暖或冷；内容的色相然后骑在它上面。
			var cast = mood === "work" ? MOOD_CAST.work : MOOD_CAST.idle;
			var casted = tintTowardHue(Number(match[1]), Number(match[2]), Number(match[3]), cast.hue, cast.mix);
			var tinted = tintTowardHue(
				casted[0],
				casted[1],
				casted[2],
				reading !== null && reading.ready ? reading.hue : null,
				SPILL_MIX
			);
			return "rgba(" + tinted[0] + ", " + tinted[1] + ", " + tinted[2] + ", " + Math.round(alpha * 1000) / 1000 + ")";
		}

		/**
		 * @param hue - 0..360。
		 * @param saturation - 0..1。
		 * @param lightness - 0..1。
		 * @returns [r, g, b]，0..255。
		 */
		function hslToRgb(hue, saturation, lightness) {
			var c = (1 - Math.abs(2 * lightness - 1)) * saturation;
			var x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
			var m = lightness - c / 2;
			var rgb;
			if (hue < 60) rgb = [c, x, 0];
			else if (hue < 120) rgb = [x, c, 0];
			else if (hue < 180) rgb = [0, c, x];
			else if (hue < 240) rgb = [0, x, c];
			else if (hue < 300) rgb = [x, 0, c];
			else rgb = [c, 0, x];
			return [
				Math.round((rgb[0] + m) * 255),
				Math.round((rgb[1] + m) * 255),
				Math.round((rgb[2] + m) * 255)
			];
		}

		/**
		 * 把一个颜色拉向内容的色相。混合是作者色与"该色相在这个颜色自己的明度和
		 * 饱和度下"之间的一次直线 RGB 插值，所以路径穿过中性灰。
		 *
		 * 改成在色轮上旋转色相在这里是个错误：从冷镜边（220°）到暖内容（29°）的短路
		 * 穿过品红，那正是本主题不得不去掉的紫 cast。
		 * @param r - 0..255。
		 * @param g - 0..255。
		 * @param b - 0..255。
		 * @param hue - 目标色相（度），或 null 表示不动这个颜色。
		 * @param mix - 走多远，0..1。
		 * @returns [r, g, b]。
		 */
		function biasTowardHue(r, g, b, hue, mix) {
			if (hue === null || hue === undefined || !(mix > 0)) return [r, g, b];
			var max = Math.max(r, g, b);
			var min = Math.min(r, g, b);
			var lightness = (max + min) / 510;
			var delta = max - min;
			var saturation = delta === 0
				? 0
				: delta / 255 / (lightness <= 0.5 ? Math.max(lightness, 1e-6) * 2 : (2 - lightness * 2));
			// 中性停靠点没有色相可移，染它只会弄脏它。
			if (saturation < 0.02) return [r, g, b];
			var target = hslToRgb(((hue % 360) + 360) % 360, saturation, lightness);
			var k = Math.min(1, mix);
			return [
				Math.round(r + (target[0] - r) * k),
				Math.round(g + (target[1] - g) * k),
				Math.round(b + (target[2] - b) * k)
			];
		}

		/**
		 * 标签层级，最弱的在前。"增强对比度"下每一层都取主色：层级改由字号和字重
		 * 承载，而不是靠把文字淡向背景。
		 */
		var LABEL_TIERS = [
			"--dsw-alias-label-secondary",
			"--dsw-alias-label-tertiary",
			"--dsw-alias-label-caption",
			"--dsw-alias-label-dimmed",
			"--dsw-alias-label-document-preview"
		];

		/**
		 * 应答"增强对比度"：每个标签层级都变成主色，且不允许任何内容表面保持半透明。
		 * @param pair - 明/暗 token 对。
		 * @returns 一套新的对；输入不被修改。
		 */
		function boostContrast(pair) {
			var next = {};
			for (var name in pair) {
				if (!Object.prototype.hasOwnProperty.call(pair, name)) continue;
				next[name] = { light: pair[name].light, dark: pair[name].dark };
			}
			var primary = next["--dsw-alias-label-primary"];
			if (primary === undefined) return next;
			for (var i = 0; i < LABEL_TIERS.length; i++) {
				var tier = next[LABEL_TIERS[i]];
				if (tier === undefined) continue;
				next[LABEL_TIERS[i]] = { light: primary.light, dark: primary.dark };
			}
			for (var p = 0; p < WALL_PROTECT.length; p++) {
				var token = next[WALL_PROTECT[p][0]];
				if (token === undefined) continue;
				next[WALL_PROTECT[p][0]] = { light: raiseAlpha(token.light, 1), dark: raiseAlpha(token.dark, 1) };
			}
			return next;
		}

		/**
		 * 应答"减弱透明"：任何承载文字的表面都不得依赖它背后的东西。画布刻意放过
		 * ——壁纸是人自己的选择，且它只在没有东西要读的地方可见。
		 * @param pair - 明/暗 token 对。
		 * @returns 一套新的对。
		 */
		function solidifySurfaces(pair) {
			var next = {};
			for (var name in pair) {
				if (!Object.prototype.hasOwnProperty.call(pair, name)) continue;
				next[name] = { light: pair[name].light, dark: pair[name].dark };
			}
			for (var p = 0; p < WALL_PROTECT.length; p++) {
				var token = next[WALL_PROTECT[p][0]];
				if (token === undefined) continue;
				next[WALL_PROTECT[p][0]] = { light: raiseAlpha(token.light, 1), dark: raiseAlpha(token.dark, 1) };
			}
			return next;
		}

		/**
		 * 把一个表面染向内容的色相，染得看得见。
		 *
		 * 光旋转色相不够：面板离中性只差几个百分点，旋转它们的色相什么都不会动。
		 * 目标是内容的色相在 `SPILL_SATURATION` 下、在表面自己的明度（被
		 * `SPILL_MAX_LIGHTNESS` 封顶）处的样子——浅色面板要先退一步才盛得住任何
		 * 彩度——混合是一次直线 RGB 插值，所以它穿过中性而不是穿过品红。
		 * @param r - 0..255。
		 * @param g - 0..255。
		 * @param b - 0..255。
		 * @param hue - 目标色相（度），或 null 表示不动这个颜色。
		 * @param mix - 走多远，0..1。
		 * @returns [r, g, b]。
		 */
		function tintTowardHue(r, g, b, hue, mix) {
			if (hue === null || hue === undefined || !(mix > 0)) return [r, g, b];
			var max = Math.max(r, g, b);
			var min = Math.min(r, g, b);
			var lightness = (max + min) / 510;
			var target = hslToRgb(((hue % 360) + 360) % 360, SPILL_SATURATION, Math.min(lightness, SPILL_MAX_LIGHTNESS));
			var k = Math.min(1, mix);
			return [
				Math.round(r + (target[0] - r) * k),
				Math.round(g + (target[1] - g) * k),
				Math.round(b + (target[2] - b) * k)
			];
		}

		/**
		 * 把一个 `rgba()` 字符串的色相旋向内容，alpha 不动。
		 * @param value - 一个 CSS rgba() 颜色。
		 * @param hue - 目标色相（度），或 null 表示不动。
		 * @param mix - 走多远，0..1。
		 * @returns 偏染后的颜色；不是可抬升的 rgba 时原样返回。
		 */
		function biasColorString(value, hue, mix) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var biased = biasTowardHue(Number(match[1]), Number(match[2]), Number(match[3]), hue, mix);
			return "rgba(" + biased[0] + ", " + biased[1] + ", " + biased[2] + ", " + match[4] + ")";
		}

		/**
		 * 把一个颜色拉向心情自己的底色，alpha 不动。调色板各行离中性足够近，换心情
		 * 过去对材质几乎没有任何可见效果：这就是让玻璃自己跟着壁纸的暖意走、而不是
		 * 等取样器的东西。
		 * @param value - 一个 CSS rgba() 颜色。
		 * @param mood - 'idle' 或 'work'。
		 * @returns 上过底色的颜色；不是可抬升的 rgba 时原样返回。
		 */
		function moodColorString(value, mood) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var cast = mood === "work" ? MOOD_CAST.work : MOOD_CAST.idle;
			var casted = tintTowardHue(Number(match[1]), Number(match[2]), Number(match[3]), cast.hue, cast.mix);
			return "rgba(" + casted[0] + ", " + casted[1] + ", " + casted[2] + ", " + match[4] + ")";
		}

		/**
		 * @param r - 平均红，0..255。
		 * @param g - 平均绿。
		 * @param b - 平均蓝。
		 * @returns 感知亮度，0..1（Rec. 709 权重）。
		 */
		function brightnessOf(r, g, b) {
			return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		}

		/**
		 * @param r - 平均红，0..255。
		 * @param g - 平均绿。
		 * @param b - 平均蓝。
		 * @returns 色相（度）；平均值实质是灰时为 null。
		 */
		function hueOf(r, g, b) {
			var max = Math.max(r, g, b);
			var min = Math.min(r, g, b);
			var delta = max - min;
			if (max === 0 || delta / max < SPILL_MIN_SATURATION) return null;
			var hue = 0;
			if (max === r) hue = 60 * (((g - b) / delta) % 6);
			else if (max === g) hue = 60 * ((b - r) / delta + 2);
			else hue = 60 * ((r - g) / delta + 4);
			if (hue < 0) hue += 360;
			return hue;
		}

		/**
		 * 液态玻璃边缘的镜边颜色，每心情每配色一套。光从左上落下；右下保留一道淡的
		 * 反向镜边，好让外形永不消失在明亮的壁纸前。
		 * @param mood - 调色板 id。
		 * @param scheme - 'light' 或 'dark'。
		 * @param sample - 上一次媒体读数，它的色相该溢到镜边上时。
		 * @returns 镜边颜色、环境光遮蔽色调，和一个分隔线构造器。
		 */
		function panelRim(mood, scheme, sample) {
			var work = mood === "work";
			var dark = scheme === "dark";
			// 内容自己的色相通过边缘抵达玻璃，绝不通过片子：片子保留它的颜色，镜边
			// 沾一点它的意思。
			var spillHue = sample !== undefined && sample !== null && sample.ready ? sample.hue : null;
			// 白面板上的白高光是看不见的，所以浅色配方的边缘改带一根冷灰发丝加一道
			// 接触阴影；亮的成分只在暗配方里领衔，那里它才真的读得出来。
		return {
			a: dark ? "rgba(255,255,255," + (work ? 0.42 : 0.34) + ")" : "rgba(255,255,255," + (work ? 0.6 : 0.52) + ")",
			b: biasColorString(moodColorString(dark ? "rgba(" + (work ? "198,224,255" : "255,255,255") + ",0.16)" : "rgba(" + (work ? "150,190,235" : "176,186,206") + ",0.34)", mood), spillHue, SPILL_MIX),
			c: biasColorString(moodColorString(dark ? "rgba(" + (work ? "150,200,255" : "255,246,238") + ",0.24)" : "rgba(" + (work ? "120,170,220" : "150,160,182") + ",0.42)", mood), spillHue, SPILL_MIX),
			ao: dark ? "rgba(0,0,0,0.5)" : "rgba(90,100,140,0.16)",
			edge: dark ? "rgba(0,0,0,0.34)" : "rgba(120,132,156,0.34)",
			contact: dark ? "rgba(0,0,0,0.42)" : "rgba(84,94,124,0.20)",
			/**
			 * 色散：真正的边缘把光拆出的两道 1px fringe——光进入的那道冷（顶），
			 * 离开的那道暖（底）。只保几个百分点：这是棱镜的一点暗示，不是彩虹。
			 */
			disp: dark ? (work ? "rgba(150,205,255,0.40)" : "rgba(255,240,222,0.34)") : (work ? "rgba(120,175,235,0.52)" : "rgba(255,247,235,0.46)"),
			warm: dark ? (work ? "rgba(120,170,225,0.26)" : "rgba(255,214,170,0.26)") : (work ? "rgba(150,195,240,0.30)" : "rgba(255,206,150,0.30)"),
			/** 离主光最近的角，和最远的那个。两者都保持淡：大到注意得出的角光
			 * 是罩在内容上的一层雾。 */
			catch: dark ? (work ? "rgba(190,225,255,0.08)" : "rgba(255,252,246,0.07)") : (work ? "rgba(210,235,255,0.13)" : "rgba(255,255,255,0.12)"),
			shade: dark ? "rgba(0,0,0,0.13)" : "rgba(84,104,150,0.07)",
			/**
			 * 菲涅尔带向内伸多远。Apple 的高光是一闪、振幅几像素，不是一道横跨面板的
			 * 渐变：带子必须在几像素内熄灭，否则读起来是一层洗（第一版 18px 正是如此）。
			 * 平静的心情呼吸得宽一点，果断的那个是一道干净的透镜边。
			 */
			band: work ? "7px" : "10px",
			/** 边缘开关关掉时的同一条镜边：一道软发丝，没有色散。 */
			softBand: work ? "4px" : "6px",
				/**
				 * 齐平布局的发丝线，按用户的分隔线强度缩放。基准值刻意强到看得见：
				 * 5% 的发丝不是分隔线，是传闻。
				 * @param strength - 0..1。
				 * @returns 一个 CSS 颜色。
				 */
				divider: function (strength) {
					var base = dark ? 0.42 : 0.5;
					var alpha = Math.round(base * Math.max(0, Math.min(1, strength)) * 1000) / 1000;
					return work ? "rgba(150,200,255," + alpha + ")" : (dark ? "rgba(255,255,255," + alpha + ")" : "rgba(96,108,134," + alpha + ")");
				}
			};
		}
		//#endregion

		//#region engine
		/**
		 * 拥有舞台、两个片子槽、token 层和活动状态机。
		 * @param deps - 注入的环境（保持显式，模块才可测试）。
		 */
		function createEngine(deps) {
			var doc = deps.document;
			var win = deps.window;
			var theme = deps.theme;
			var ctx = deps.ctx;
			var now = deps.now;
			var setTimer = deps.setTimeout;
			var clearTimer = deps.clearTimeout;
			var storage = deps.localStorage;
			var objectUrls = deps.URL;

			var started = false;
			var mood = null;
			var lastSwitch = -Infinity;
			var pending = null;
			var timer = 0;
			var poll = 0;
			var fadeTimer = 0;
		/** 那个一次性计时器，让交叉淡变已经用完的片子停下。 */
		var parkTimer = 0;
		var visibilityWatched = false;
		/** 盯外壳三列的尺寸，好让正在展开的侧边栏立刻被打上标签。 */
			var resizeObserver = null;
			var resizeTimer = 0;
			var lastResizeAt = -Infinity;
			var observedNodes = [];
			var layerDispose = null;
			var unsubscribes = [];
		/** 每心情槽一个 video 元素：两者都在，切换才从不等。 */
		var videos = {};
		/** 本插件创建的对象 URL，每槽一个。 */
		var clipUrls = {};
		var wallpaper = normalizeVideo(null);
		var wallpaperListeners = [];
		/**
		 * 上一次存储尝试没能做到的事，用设置行自己的话讲。一个字节丢了的选中文件，
		 * 或一个拒绝了写入的存储，过去都无声通过——人只在下次重启丢了一个他记得做过的
		 * 选择时才发现。
		 */
			var panels = normalizePanels(null);
			var panelListeners = [];
		/** 每个面板当前作画的 alpha，供设置行读数。 */
		var panelAlphaCache = { left: 0, main: 0, right: 0 };
		/**
		 * 每个槽的片子长什么样——每槽一份读数，不是给"屏幕上恰好是哪条"一份。
		 *
		 * 只取屏幕上可见的那条，意味着换心情会带着上一条片子的色相和亮度最长一个
		 * 取样间隔（4s）：面板同时换了调色板，然后继续朝刚刚离去的那段片子漂，那正是
		 * "颜色发滞后"的样子。两个槽各按自己的节奏读，切换用的是它已经有的颜色。
		 *
		 * `ready` 在真的读到一帧之前保持 false，所以什么都不猜：一条读不到的片子
		 * （跨源 URL 会污染画布）回退到中性洗。
		 */
			function blankSample() {
				return { ready: false, brightness: 0.5, hue: null, saturation: 0, dim: 0, sampledAt: 0 };
			}
			var mediaSamples = { idle: blankSample(), work: blankSample() };
		/** @returns 'work' 或 'idle'：当前心情正在显示的那个槽。 */
		function activeSlot() {
			return mood === "work" ? "work" : "idle";
		}
		/** @param slot - 一个心情槽。@returns 它上一次的读数，永不为 undefined。 */
		function sampleFor(slot) {
			return mediaSamples[slot] === undefined || mediaSamples[slot] === null ? blankSample() : mediaSamples[slot];
		}
			var sampleCanvas = null;
			var prefers = { reducedTransparency: false, moreContrast: false };
			var preferenceLists = [];

	/**
	 * @param slot - 要读的心情槽。
	 * @returns 服务它的片子元素（一条片子覆盖两个心情时是另一槽的），没有帧可读时
	 * 返回 null。
	 *
	 * 读恰好排在前面的那个槽，正是材质不再跟随壁纸的原因：两条片子都配了时，取样器
	 * 总是拿 idle 那条，于是工作态下面板和镜边留着 idle 片子的色相（和它的压暗），
	 * 而一条冷片子正在它们背后播放。
	 */
		function videoFor(slot) {
			var order = slot === "work" ? ["work", "idle"] : ["idle", "work"];
			for (var i = 0; i < order.length; i++) {
				var video = videos[order[i]];
				if (video === undefined || video === null) continue;
				if (video.getAttribute("data-glass-clip") === "none") continue;
				if (typeof video.readyState === "number" && video.readyState < 2) continue;
				return video;
			}
			return null;
		}

			/** @returns 屏幕外取样画布，只创建一次。 */
			function ensureSampleCanvas() {
				if (sampleCanvas !== null) return sampleCanvas;
				if (typeof doc.createElement !== "function") return null;
				var canvas = doc.createElement("canvas");
				if (canvas === null || canvas === undefined) return null;
				canvas.width = SAMPLE_WIDTH;
				canvas.height = SAMPLE_HEIGHT;
				if (typeof canvas.setAttribute === "function") {
					canvas.setAttribute("width", String(SAMPLE_WIDTH));
					canvas.setAttribute("height", String(SAMPLE_HEIGHT));
				}
				sampleCanvas = canvas;
				return canvas;
			}

		/** 发布片子意味着什么：给媒体栈的一层压暗，和一道可溢的色相。 */
		/** 发布屏幕上那条片子意味着什么：给媒体栈的一层压暗。 */
		function publishMedia() {
				var sample = sampleFor(activeSlot());
				var dim = 0;
				if (wallpaper.autoDim === true && sample.ready && sample.brightness > DIM_KNEE) {
					dim = Math.min(DIM_MAX, ((sample.brightness - DIM_KNEE) / (1 - DIM_KNEE)) * DIM_MAX);
				}
				sample.dim = Math.round(dim * 1000) / 1000;
				doc.body.style.setProperty("--gm-media-dim", String(sample.dim));
			}

			/**
			 * 读一帧缩小的画面，推导它的亮度和色相。有节流，画布不可用或片子读不了时
			 * 是空操作。
			 * @param force - 无视节流（一条新片子值得一次新读数）。
			 * @returns 是否读到了一帧。
			 */
		function sampleMedia(force) {
			if (disposed) return false;
			var read = false;
			for (var i = 0; i < SLOTS.length; i++) {
				if (readSlot(SLOTS[i], force)) read = true;
			}
			publishMedia();
			syncPanels();
			return read;
		}

			/**
			 * 把一个槽的一帧读进那个槽自己的读数。
			 * @param slot - 'idle' 或 'work'。
			 * @param force - 无视节流（一条新片子，或一次心情切换）。
			 * @returns 读数是否变了。
			 */
			function readSlot(slot, force) {
				var video = videoFor(slot);
				if (video === null) {
					if (mediaSamples[slot].ready) {
						mediaSamples[slot] = blankSample();
						return true;
					}
					return false;
				}
				var at = deps.now();
				if (force !== true && at - mediaSamples[slot].sampledAt < SAMPLE_INTERVAL_MS) return false;
				mediaSamples[slot].sampledAt = at;
				var canvas = ensureSampleCanvas();
				if (canvas === null || typeof canvas.getContext !== "function") return false;
				var context = null;
				try { context = canvas.getContext("2d"); } catch (error) { context = null; }
				if (context === null || context === undefined || typeof context.drawImage !== "function") return false;
				var pixels = null;
				try {
					context.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
					var image = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
					pixels = image === undefined || image === null ? null : image.data;
				} catch (error) {
					// 被污染的画布（一条跨源片子）：停止猜测，用中性洗。
					mediaSamples[slot] = blankSample();
					return true;
				}
				if (pixels === null || pixels.length < 4) return false;
				var total = 0;
				var sumR = 0;
				var sumG = 0;
				var sumB = 0;
				for (var i = 0; i + 3 < pixels.length; i += 4) {
					sumR += pixels[i];
					sumG += pixels[i + 1];
					sumB += pixels[i + 2];
					total += 1;
				}
				if (total === 0) return false;
				var r = sumR / total;
				var g = sumG / total;
				var b = sumB / total;
				var max = Math.max(r, g, b);
				var min = Math.min(r, g, b);
				var brightness = brightnessOf(r, g, b);
				mediaSamples[slot] = {
					ready: true,
					brightness: brightness,
					hue: brightness < SPILL_MIN_BRIGHTNESS ? null : hueOf(r, g, b),
					saturation: max === 0 ? 0 : (max - min) / max,
					dim: mediaSamples[slot].dim,
					sampledAt: at
				};
				return true;
			}

			/**
			 * 盯液态玻璃必须应答的两个无障碍偏好。没有 `matchMedia` 的浏览器直接报
			 * "无偏好"。
			 * @returns 当前状态。
			 */
			function readPreferences() {
				prefers.reducedTransparency = queryPreference("(prefers-reduced-transparency: reduce)");
				prefers.moreContrast = queryPreference("(prefers-contrast: more)");
				// 属性驱动 CSS 和诊断，所以它们跟着读数走，无论是否要求一次全量重绘。
				if (prefers.reducedTransparency) doc.body.dataset.glassTransparency = "reduced";
				else delete doc.body.dataset.glassTransparency;
				if (prefers.moreContrast) doc.body.dataset.glassContrast = "more";
				else delete doc.body.dataset.glassContrast;
				return prefers;
			}

			/** @param query - 一条媒体查询。@returns 它是否被支持且匹配。 */
			function queryPreference(query) {
				if (deps.matchMedia === undefined || deps.matchMedia === null) return false;
				var list = null;
				try { list = deps.matchMedia(query); } catch (error) { return false; }
				if (list === null || list === undefined) return false;
				return list.matches === true;
			}

			/**
			 * 重读偏好，并重绘它们碰到的东西。启动时只跑 `readPreferences`：紧随其后
			 * 的心情提交会发布 token 层，发布两次只会白堆一层。
			 */
			function applyPreferences() {
				readPreferences();
				applyTokens();
				syncPanels();
			}

			/** 跟随任一偏好的系统变化。 */
			function watchPreferences() {
				if (deps.matchMedia === undefined || deps.matchMedia === null) return;
				var queries = ["(prefers-reduced-transparency: reduce)", "(prefers-contrast: more)"];
				for (var i = 0; i < queries.length; i++) {
					var list = null;
					try { list = deps.matchMedia(queries[i]); } catch (error) { list = null; }
					if (list === null || list === undefined || typeof list.addEventListener !== "function") continue;
					preferenceLists.push(list);
					list.addEventListener("change", applyPreferences);
				}
			}

		/**
		 * 清掉上一个实例留在 DOM 里的任何东西：一次热重载会把本插件挂载两次，而两个
		 * 舞台（或两张样式表）正是界面被埋在一层流浪壁纸下的由来。
		 * @returns 清掉了多少个孤儿舞台。
		 */
		function sweepOrphans() {
				var removed = 0;
				var stage = doc.getElementById(STAGE_ID);
				while (stage !== null && stage !== undefined) {
					if (typeof stage.remove === "function") stage.remove();
					removed += 1;
					stage = doc.getElementById(STAGE_ID);
				}
				var sheet = doc.getElementById(STYLE_ID);
				while (sheet !== null && sheet !== undefined) {
					if (typeof sheet.remove === "function") sheet.remove();
					sheet = doc.getElementById(STYLE_ID);
				}
				var refraction = doc.getElementById(REFRACTION_ID);
				while (refraction !== null && refraction !== undefined) {
					if (typeof refraction.remove === "function") refraction.remove();
					refraction = doc.getElementById(REFRACTION_ID);
				}
				var stray = [
					"[data-glass-panel]", "[data-glass-surface]", "[data-glass-frost]",
					"[data-glass-delegate]", "[data-glass-hollow]", "[data-glass-blur-host]", "[data-glass-selftest]", "[data-glass-frame]", "[data-glass-checker]"
				];
				for (var i = 0; i < stray.length; i++) {
					var nodes = doc.querySelectorAll(stray[i]);
					for (var n = 0; n < nodes.length; n++) {
						if (typeof nodes[n].removeAttribute === "function") nodes[n].removeAttribute(stray[i].slice(1, -1));
					}
				}
			var vars = ["--gm-media-dim", "--gm-gap", "--gm-frame-radius", "--gm-radius", "--gm-refract",
				"--gm-rim-a", "--gm-rim-b", "--gm-rim-c", "--gm-rim-edge", "--gm-rim-ao",
				"--gm-rim-contact", "--gm-rim-disp", "--gm-rim-warm", "--gm-rim-catch", "--gm-rim-shade", "--gm-rim-band", "--gm-sheen-edge",
				"--gm-divider", "--gm-wall-fit", "--gm-wall-opacity", "--gm-wall-blur",
				"--gm-wall-scale", "--gm-tint"];
				for (var v = 0; v < vars.length; v++) doc.body.style.removeProperty(vars[v]);
			for (var k = 0; k < PANEL_KEYS.length; k++) {
				doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-blur");
				doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-sheen");
				doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-fill");
				doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-alpha");
				doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-shadow");
			}
				delete doc.body.dataset.glassPanels;
				delete doc.body.dataset.glassGap;
				delete doc.body.dataset.glassMood;
				delete doc.body.dataset.glassBlur;
				delete doc.body.dataset.glassFading;
				delete doc.body.dataset.glassWallpaper;
				return removed;
			}

		/** DOM 里真正找到了哪些外壳列。 */
		var panelFound = { left: false, main: false, right: false };
		/** 每个键的列元素，用于察觉外壳重建。 */
		var panelNodes = { left: null, main: null, right: null };
		/** 真正画每个面板的那个元素，当它不是列本身时。 */
		var panelSurfaces = { left: null, main: null, right: null };
		/** 被掏空的画手，好让列自己的材质显形。 */
		var panelHollow = { left: null, main: null, right: null };
		/** 一个面板为什么不得不把材质留在列上。 */
		var panelDiag = { left: [], main: [], right: [] };
		/** 每个面板的模糊住在哪："element" 或 "pseudo"。 */
		var panelBlurHost = { left: null, main: null, right: null };
		/** 一个 fixed 后代迫使改用伪元素排布时设置。 */
		var panelBlurNote = { left: [], main: [], right: [] };
		var reportPosts = 0;
		var reportTimer = 0;
		/**
		 * 一份报告取自普通布局，在任何东西展开之前。这之前的每份报告都是在右栏全屏
		 * 呈现下拍的——唯一一种列不按平常方式布局的模式——所以一个关于普通布局里的角的
		 * 问题根本没有任何证据，回答它意味着再猜一次。
		 */
		var initialReported = false;
		/**
		 * 上一轮里右栏是否全屏呈现。模式切换是阴影唯一可能比投下它的面板活得久的
		 * 时刻，而两个现有触发器都覆盖不到：`initial` 每会话只发一次，`expanded`
		 * 只在该模式开着时发。所以收起有自己的快照，在切换刚落定时拍。
		 */
		var wasExpanded = false;

		/**
		 * 把模糊放到这个面板上确实管用的地方。列保留伪元素排布（那个稳定的）；一个
		 * 被授权的内层表面把模糊接到自己身上，因为那里的伪元素会报一个有效的模糊值、
		 * 却什么都不取样。fixed 后代条件仍然测量——它被报出来，而不是被允许悄悄把模糊
		 * 挪到一个没用的地方，因为收起的列已经被 `columnUsable` 整个放过了。
		 * @param key - 面板键。
		 */
		function aimBlur(key) {
				var host = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : panelNodes[key];
				if (host === null || host === undefined || typeof host.setAttribute !== "function") return;
			/* 一个面板只有一个元素可以扛磨砂，另一个候选必须把标记还回来。这就是
			   "展开的右栏没有模糊"背后的全部 bug：

			   一个带 `backdrop-filter` 的元素成为一个背景根，而后代自己的
			   `backdrop-filter` 从此只能取样画在那个祖先内部的东西。一个面板把材质
			   授权给它列内的一层，所以列一旦保留自己的磨砂，那层的磨砂取样的就是一片
			   空背景——什么都没有。实测结果正是报上来的症状：列自己那条（447px，侧边栏
			   原来所在处）模糊了，而真正盖住框的 1183px 那层一点都没模糊。

			   `aimBlur` 从前只碰当前宿主，所以列在授权之前挣到的标记从来没被摘掉过。 */
				var other = host === panelNodes[key] ? panelSurfaces[key] : panelNodes[key];
				if (other !== null && other !== undefined && other !== host && typeof other.removeAttribute === "function") {
					other.removeAttribute("data-glass-blur-host");
				}
			// 在这个浏览器里实测：负 z 伪元素报一个有效的模糊值、却什么都不取样，被授权的
			// 表面和列都一样；元素自身才真的模糊。所以由元素扛它，而那样做的唯一代价——
			// 它成为自己 fixed 后代的包含块——在这里点名。
			if (panels.blurFallback === true) {
				host.removeAttribute("data-glass-blur-host");
				panelBlurHost[key] = "pseudo";
				panelBlurNote[key] = ["已按要求降级"];
				return;
			}
		// 这个扫描是每个后代一次 getComputedStyle，所以只在磨砂真的开着时跑：
		// 模糊关着时没有什么能被重新锚定。
			var fixed = doc.body.dataset.glassBlur === "off" ? [] : fixedDescendants(host);
		// 材质元素上的 backdrop-filter 会把每个 fixed 后代重新锚到它身上。app 自己的
		// 浮动控件就住在这些列里（侧边栏的折叠控件是一个），而重新锚定把它从顶栏挪
		// 到了侧边栏 logo 上。定位胜过磨砂：这样的面板保住填充和镜边，不要模糊。
			if (panels.fixedGuard === true && fixed.length > 0) {
				host.removeAttribute("data-glass-blur-host");
				panelBlurHost[key] = "none";
				panelBlurNote[key] = ["含 fixed 子元素：" + fixed.join("、") + "（已跳过磨砂，保住其定位）"];
				return;
			}
			host.setAttribute("data-glass-blur-host", "element");
			panelBlurHost[key] = "element";
			panelBlurNote[key] = fixed.length === 0 ? [] : ["含 fixed 子元素：" + fixed.join("、")];
			}
			var refractionMounted = false;
			var retagTimer = 0;
			var disposed = false;

		/** 一次受保护的读：存储在隐私模式下、loopback 之外会抛错。 */
		function readKey(key) {
			try {
				return storage === undefined || storage === null ? null : storage.getItem(key);
			} catch (error) {
				return null;
			}
		}

			/** 一次受保护的写；持久化失败从不弄坏活着的主题。 */
			function writeKey(key, value) {
				try {
					if (storage !== undefined && storage !== null) storage.setItem(key, value);
				} catch (error) { /* 存储不可用：改动留在内存里 */ }
			}

			//#region wallpaper storage
			/** IndexedDB 是可选项：没有它的页面就是留不住一个选中的文件。 */
			function withStore(mode, run) {
				return new Promise(function (resolve, reject) {
					var factory = deps.indexedDB;
					if (factory === undefined || factory === null || typeof factory.open !== "function") {
						reject(new Error("glass-mood: IndexedDB is unavailable"));
						return;
					}
					var request = factory.open(IDB_NAME, 1);
					request.onupgradeneeded = function () {
						var db = request.result;
						if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
					};
					request.onerror = function () { reject(request.error ?? new Error("glass-mood: IndexedDB open failed")); };
					request.onsuccess = function () {
						var db = request.result;
						var tx = db.transaction(IDB_STORE, mode);
						var store = tx.objectStore(IDB_STORE);
						var op = run(store);
						op.onsuccess = function () { resolve(op.result); };
						op.onerror = function () { reject(op.error ?? new Error("glass-mood: IndexedDB request failed")); };
						tx.oncomplete = function () { db.close(); };
					};
				});
			}

			/** @returns 这个页面到底能不能留住选中的文件。 */
			function storageAvailable() {
				var factory = deps.indexedDB;
				return factory !== undefined && factory !== null && typeof factory.open === "function";
			}

		/**
		 * @returns 一个槽已存 blob 的 promise，区分"存储不可用"和"这个键真的不
		 * 存在"——只有后者才被允许清掉用户的配置。
		 */
		function readStoredClip(slot) {
				if (!storageAvailable()) return Promise.resolve({ available: false, blob: null });
				return withStore("readonly", function (store) { return store.get(IDB_KEY_PREFIX + slot); })
					.then(function (value) { return { available: true, blob: value === undefined ? null : value }; })
					.catch(function () { return { available: false, blob: null }; });
			}

		/** @returns 同样形状的 v1 单文件槽，或不可用。 */
		function readLegacyClip() {
				if (!storageAvailable()) return Promise.resolve({ available: false, blob: null });
				return withStore("readonly", function (store) { return store.get(IDB_LEGACY_KEY); })
					.then(function (value) { return { available: true, blob: value === undefined ? null : value }; })
					.catch(function () { return { available: false, blob: null }; });
			}

		/** 字节复制到槽键之后，丢掉 v1 的键。 */
		function dropLegacyClip() {
				if (!storageAvailable()) return Promise.resolve();
				return withStore("readwrite", function (store) { return store.delete(IDB_LEGACY_KEY); }).catch(function () {});
			}

		/** @returns 一个在 blob 存好（或被拒）时落定的 promise。 */
		function writeStoredClip(slot, blob) {
				return withStore("readwrite", function (store) { return store.put(blob, IDB_KEY_PREFIX + slot); });
			}

		/** @returns 一个在一个已存 blob 消失时落定的 promise。 */
		function dropStoredClip(slot) {
				return withStore("readwrite", function (store) { return store.delete(IDB_KEY_PREFIX + slot); }).catch(function () {});
			}
			//#endregion

		//#region mood state machine
		/**
		 * 本主题需要的唯一信号：有会话在干活吗？
		 * 首选数据源是 ui-session 状态图（每会话一条，已聚合）；会话列表加逐个会话的
		 * 面孔是兜底，`dsh-glass-mood:force` 为检视压过两者。
		 * @returns agent 干活期间为 true。
		 */
		function readActivity() {
				var forced = readKey(FORCE_KEY);
				if (forced === "work") return true;
				if (forced === "idle") return false;

				var uiSession = getService(ctx, "uiSession");
				var status = uiSession === undefined || uiSession === null ? undefined : uiSession.sessionStatus;
				if (status !== undefined && status !== null && typeof status.getSnapshot === "function") {
					var map = status.getSnapshot();
					if (map !== undefined && map !== null && typeof map.forEach === "function") {
						var busy = false;
						map.forEach(function (state) {
							if (busy || state === undefined || state === null) return;
							if (state.running === true) busy = true;
							else if (COUNT_PENDING_AS_WORK && state.pendingInteraction !== undefined && state.pendingInteraction !== null) busy = true;
						});
						return busy;
					}
				}

				var sessions = getService(ctx, "sessions");
				if (sessions === undefined || sessions === null) return false;
				var list = sessions.list;
				if (list === undefined || list === null || typeof list.getSnapshot !== "function") return false;
				var snapshot = list.getSnapshot();
				var rows = snapshot === undefined || snapshot === null ? undefined : snapshot.byId;
				if (rows === undefined || rows === null) return false;
				var ids = Object.keys(rows);
				for (var i = 0; i < ids.length; i++) {
					var id = ids[i];
					var row = rows[id];
					if (row !== undefined && row !== null && row.running === true) return true;
					if (typeof sessions.binding !== "function") continue;
					var binding = sessions.binding(id);
					var face = binding === undefined || binding === null ? undefined : binding.session;
					if (face === undefined || face === null || typeof face.getSnapshot !== "function") continue;
					var session = face.getSnapshot();
					if (session !== undefined && session !== null && session.running === true) return true;
				}
				return false;
			}

			/** @returns 当前活动所暗示的心情。 */
			function desiredMood() {
				return readActivity() ? "work" : "idle";
			}

			/** 丢掉任何待定的切换。 */
			function cancelPending() {
				if (timer !== 0) {
					clearTimer(timer);
					timer = 0;
				}
				pending = null;
			}

		/**
		 * 为当前心情发布 token 层，有壁纸时削薄面板。情绪机和滑杆共用一个漏斗。
		 *
		 * 新层叠上之前，旧层先收回。宿主的文档是一源一层、每次变更重叠；如果那其实
		 * 意味着"堆叠"而不是"替换"，收回就是让旧值不在底下幸存的东西。
		 */
		function applyTokens() {
			var pair = pairFor(mood === null ? "idle" : mood);
			if (hasWallpaperConfig(wallpaper)) pair = dimPair(pair, wallpaper.clarity);
			if (prefers.reducedTransparency) pair = solidifySurfaces(pair);
			if (prefers.moreContrast) pair = boostContrast(pair);
			layerDispose = theme.overrideTokens(SOURCE, pair);
		}

		/** 采纳一个心情：属性、token 层、一次性淡变窗口。 */
		function commit(next) {
			cancelPending();
			var fading = mood !== null && mood !== next;
			// 第一次提交画的是挂载时观察到的事实，所以它不是一次切换，不该受停留门槛
			// 管（一轮进行中刷新页面会立刻落定）。此后每次提交都是一次切换决定。
			if (mood !== null) lastSwitch = now();
			mood = next;
			doc.body.dataset.glassMood = next;
			applyTokens();
			syncPanels();
			// 两条片子穿过切换继续播放，不再显示的那条在淡变结束后停下。
			schedulePace();
			if (fading) {
					doc.body.dataset.glassFading = next;
					if (fadeTimer !== 0) clearTimer(fadeTimer);
					fadeTimer = setTimer(function () {
						fadeTimer = 0;
						delete doc.body.dataset.glassFading;
					}, FADE_WINDOW_MS);
				}
			}

		/** 排定一次切换，尊重两次切换之间的最短停留。 */
		function schedule(target, delay) {
				if (pending === target) return;
				cancelPending();
				pending = target;
				timer = setTimer(function () {
					timer = 0;
					pending = null;
					if (desiredMood() === target) commit(target);
					else evaluate();
				}, Math.max(0, delay));
			}

		/** 重算心情；状态机的唯一入口。 */
		function evaluate() {
				var target = desiredMood();
				if (mood === null) {
					commit(target);
					return;
				}
				if (target === mood) {
					cancelPending();
					return;
				}
				var enter = target === "work" ? WORK_ENTER_MS : IDLE_ENTER_MS;
				var dwellLeft = MIN_DWELL_MS - (now() - lastSwitch);
				schedule(target, Math.max(enter, dwellLeft));
			}

	/**
	 * 本插件跑的两个时钟，各自可以单独起停：一个隐藏的标签页既不需要轮询，
	 * 也不需要表面扫描。
	 */
	function startPolling() {
		if (poll !== 0) return;
		poll = deps.setInterval(function () {
			evaluate();
			sampleMedia(false);
		}, POLL_MS);
	}

		function stopPolling() {
			if (poll === 0) return;
			deps.clearInterval(poll);
			poll = 0;
		}

	function startRetag() {
		if (retagTimer !== 0) return;
		retagTimer = deps.setInterval(function () {
			// 同样要深：这一跳也是一个布局在没有任何列缩放的情况下变了的安全网
			// （比如 app 换了一个内层表面），而一个仍然覆盖得住的表面会立刻退出，
			// 而不是重新探测。
			tagPanels(true);
			tagBigSurfaces();
			ensureStageHost();
		}, RETAG_MS);
	}

		function stopRetag() {
			if (retagTimer === 0) return;
			deps.clearInterval(retagTimer);
			retagTimer = 0;
		}

		/**
		 * 两个槽穿过切换继续播放，所以交叉淡变有一帧可以落上，不必等解码器。
		 */
		function primeSlots() {
			for (var i = 0; i < SLOTS.length; i++) {
				var video = videos[SLOTS[i]];
				if (video === undefined || video === null) continue;
				if (video.getAttribute("data-glass-clip") === "none") continue;
				startPlayback(video);
			}
		}

		/**
		 * 让每个不在屏幕上的片子停下。两台壁纸整天解码，笔记本上感觉得到；一台
		 * 感觉不到——而交叉淡变扛得住，因为进来的槽先预热，出去的那个只在淡出
		 * 跑完之后才停。
		 */
		function paceSlots() {
			if (disposed) return;
			var target = mood === "work" ? "work" : "idle";
			var plan = planClips();
			for (var i = 0; i < SLOTS.length; i++) {
				var slot = SLOTS[i];
				if (slot === target) continue;
				var entry = plan === undefined || plan === null ? null : plan[slot];
				if (entry === null || entry === undefined || entry.clip === null) continue;
				// 一条服务两个心情的片子永不停下。
				if (entry.slot === "both") continue;
				parkSlot(slot);
			}
		}

		/** @param slot - 其解码器可以释放的心情槽。 */
		function parkSlot(slot) {
			var video = videos[slot];
			if (video === undefined || video === null) return;
			try { video.pause(); } catch (error) { /* 从未启动 */ }
		}

		/** 先预热两个槽，再放开淡变已经用完的那个。 */
		function schedulePace() {
			primeSlots();
			if (parkTimer !== 0) clearTimer(parkTimer);
			parkTimer = setTimer(function () {
				parkTimer = 0;
				paceSlots();
			}, FADE_WINDOW_MS + 80);
		}

		/** 隐藏的标签页完全不需要解码器。 */
		function pauseSlots() {
			for (var i = 0; i < SLOTS.length; i++) parkSlot(SLOTS[i]);
		}

		/**
		 * 标签页隐藏期间停掉每个时钟和解码器，在下一个可见帧带回来。壁纸是最不该
		 * 在一个没人在看的窗口上耗电的东西。
		 */
		function applyVisibility() {
			if (doc !== undefined && doc !== null && doc.hidden === true) {
				stopPolling();
				stopRetag();
				pauseSlots();
				return;
			}
			startPolling();
			startRetag();
			schedulePace();
			evaluate();
			sampleMedia(true);
		}

		/**
		 * 盯列自己的尺寸。重打标签每 2.5s 跑一趟，对一个从不变化的外壳够用，对一个
		 * 会变的就太慢：一条正在展开的侧边栏会干坐在那里当一秒钟素列，才拿到它的
		 * 圆角和材质。缩放是唯一和变化同一帧到达的信号。
		 *
		 * 去抖，因为动画中的侧边栏每帧都发一次，而一次重打标签是有测量的探测（每趟
		 * 读几何和计算样式）：60ms 感知不到，把约 20 次探测并成一次。
		 */
		function watchColumns() {
			if (win === undefined || win === null || typeof win.ResizeObserver !== "function") return;
			if (resizeObserver !== null) return;
			resizeObserver = new win.ResizeObserver(function () {
				if (disposed) return;
				// 前沿先走，然后每个节流窗口至多一趟。纯尾沿去抖只在动画停下时才发——
				// 那恰恰是"素列在末尾瞬变"这个要防的东西。
				if (resizeTimer !== 0) return;
				var since = now() - lastResizeAt;
				if (since >= RESIZE_THROTTLE_MS) {
					runResizePass();
					return;
				}
				resizeTimer = setTimer(function () {
					resizeTimer = 0;
					runResizePass();
				}, RESIZE_THROTTLE_MS - since);
			});
		}

		/**
		 * 观察三列，无论它们当前是否够格当面板：一条收起的导轨正是必须被观察的那个，
		 * 因为它正是即将变化的那个。
		 */
		function observeColumns() {
			if (resizeObserver === null || typeof doc.querySelector !== "function") return;
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var node = null;
				try { node = doc.querySelector(PANEL_SELECTOR[PANEL_KEYS[i]]); } catch (error) { node = null; }
				if (node === null || node === undefined) continue;
				if (observedNodes.indexOf(node) !== -1) continue;
				try {
					resizeObserver.observe(node);
					observedNodes.push(node);
				} catch (error) { /* a node the observer cannot take */ }
			}
		}

		/** 一趟重打标签加重发布，不管有多少次缩放请求过它。 */
		function runResizePass() {
			lastResizeAt = now();
			// 要深，好让被授权的表面按新的列宽重新验证：缩放正是授权可能变陈的时刻，
			// 而全屏右栏就是让这件事显形的案例。
			tagPanels(true);
			syncPanels();
		}

		function unwatchColumns() {
			if (resizeObserver === null) return;
			try { resizeObserver.disconnect(); } catch (error) { /* already gone */ }
			resizeObserver = null;
			observedNodes = [];
		}

		function watchVisibility() {
			if (doc === undefined || doc === null || typeof doc.addEventListener !== "function") return;
			try {
				doc.addEventListener("visibilitychange", applyVisibility, false);
				visibilityWatched = true;
			} catch (error) { /* a document without events still gets the theme */ }
		}

		function unwatchVisibility() {
			if (visibilityWatched !== true || typeof doc.removeEventListener !== "function") return;
			try {
				doc.removeEventListener("visibilitychange", applyVisibility, false);
			} catch (error) { /* already gone */ }
			visibilityWatched = false;
		}

		/** 订阅每个能报告活动的可观察源。 */
		function subscribe() {
				var uiSession = getService(ctx, "uiSession");
				var status = uiSession === undefined || uiSession === null ? undefined : uiSession.sessionStatus;
				if (status !== undefined && status !== null && typeof status.subscribe === "function") {
					unsubscribes.push(status.subscribe(evaluate));
				}
				var sessions = getService(ctx, "sessions");
				var list = sessions === undefined || sessions === null ? undefined : sessions.list;
				if (list !== undefined && list !== null && typeof list.subscribe === "function") {
					unsubscribes.push(list.subscribe(evaluate));
				}
			startPolling();
				// 配色翻转会重新解析每个面板画哪套调色板，所以已发布的填充跟随呈现器，
				// 而不是启动那一刻。
				if (ctx !== undefined && ctx !== null && typeof ctx.on === "function") {
					try {
						ctx.on("theme/change", function () { syncPanels(); });
					} catch (error) { /* a context without the event still gets the boot scheme */ }
				}
			}
			//#endregion

			//#region wallpaper
		/** 把当前配置推给每个监听者（设置行）。 */
		function announceWallpaper() {
			var snapshot = videoConfig();
			for (var i = 0; i < wallpaperListeners.length; i++) {
				try { wallpaperListeners[i](snapshot); } catch (error) { /* 一行坏行不能拖累其余 */ }
			}
		}

		/** @returns 活壁纸配置的一份深拷贝。 */
			function videoConfig() {
				return {
					clips: {
						idle: { source: wallpaper.clips.idle.source, url: wallpaper.clips.idle.url, name: wallpaper.clips.idle.name },
						work: { source: wallpaper.clips.work.source, url: wallpaper.clips.work.url, name: wallpaper.clips.work.name }
					},
					fit: wallpaper.fit,
					opacity: wallpaper.opacity,
					blur: wallpaper.blur,
					tint: wallpaper.tint,
				clarity: wallpaper.clarity,
				autoDim: wallpaper.autoDim
			};
		}

		/**
		 * 每个元素播哪条片子。有自己的片子的槽拥有它；孤零零一条片子由恰好一个标了
		 * `both` 的元素服务，所以单个配置好的视频仍覆盖两个心情（v1 的行为），且不必
		 * 把同一个文件解码两遍。
		 * @returns 每槽的播放计划。
		 */
		function planClips() {
				var idleClip = wallpaper.clips.idle.source === "" ? null : wallpaper.clips.idle;
				var workClip = wallpaper.clips.work.source === "" ? null : wallpaper.clips.work;
				if (idleClip !== null && workClip !== null) {
					return { idle: { clip: idleClip, slot: "idle" }, work: { clip: workClip, slot: "work" } };
				}
				if (idleClip !== null) return { idle: { clip: idleClip, slot: "both" }, work: { clip: null, slot: "none" } };
				if (workClip !== null) return { idle: { clip: null, slot: "none" }, work: { clip: workClip, slot: "both" } };
				return { idle: { clip: null, slot: "none" }, work: { clip: null, slot: "none" } };
			}

			/** 放开一个槽的对象 URL，如果本插件创建过它。 */
			function releaseClipUrl(slot) {
				var url = clipUrls[slot];
				if (url !== undefined && url !== null && objectUrls !== undefined && objectUrls !== null && typeof objectUrls.revokeObjectURL === "function") {
					try { objectUrls.revokeObjectURL(url); } catch (error) { /* 已经放开过 */ }
				}
				clipUrls[slot] = null;
			}

			/** 按当前配置画舞台：源、槽、染色、属性。 */
			/**
			 * @returns 壁纸舞台该去哪。它必须和面板同属一个背景根的后代，否则面板内的
			 * backdrop-filter 看不见它；app 外壳是它们共享的最近祖先。
			 */
			function stageHost() {
				var frame = doc.querySelector('[class*="_frame"]');
				if (frame !== null && frame !== undefined && typeof frame.insertBefore === "function") return { host: frame, shell: true };
				var root = typeof doc.getElementById === "function" ? doc.getElementById("root") : null;
				if (root !== null && root !== undefined && typeof root.insertBefore === "function") return { host: root, shell: true };
				return { host: doc.body, shell: false };
			}

			/** @returns 一个节点的父节点，跨真实 DOM 与桩 DOM。 */
			function parentOf(node) {
				if (node === null || node === undefined) return null;
				if (node.parentNode !== undefined) return node.parentNode;
				return node.parent === undefined ? null : node.parent;
			}

			/**
			 * 让舞台留在 app 外壳内部。便宜到可以放进行轮询：只在宿主真的变了时才移动节点。
			 */
			function ensureStageHost() {
				var stage = doc.getElementById(STAGE_ID);
				if (stage === null || stage === undefined) return;
				var target = stageHost();
				// 标记跟踪当前宿主，无论是否需要移动：舞台在首次渲染时直接创建在外壳内。
				var marked = stage.getAttribute("data-glass-in-shell");
				if (target.shell) {
					if (marked !== "") stage.setAttribute("data-glass-in-shell", "");
				} else if (marked !== undefined && marked !== null) {
					stage.removeAttribute("data-glass-in-shell");
				}
				if (parentOf(stage) === target.host) return;
				if (typeof target.host.insertBefore !== "function") return;
				target.host.insertBefore(stage, target.host.firstChild === undefined ? null : target.host.firstChild);
			}

			/**
			 * @returns 每个面板计算出的 backdrop-filter，加上它本该有的值，好让一次静默
			 * 失败和一个从未到达的值区分开。这是"模糊旋钮没反应"的诊断。
			 */
			function blurReport() {
				var report = {};
				var read = win !== undefined && win !== null && typeof win.getComputedStyle === "function" ? win.getComputedStyle : null;
				var stage = doc.getElementById(STAGE_ID);
				var host = parentOf(stage);
				var stageHostText = host === null || host === undefined
					? "missing"
					: (typeof host.tagName === "string" ? host.tagName.toLowerCase() : "?") + "#" + String(host.getAttribute === undefined ? "" : (host.getAttribute("id") ?? ""));
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var node = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : panelNodes[key];
					if (node === null || node === undefined || read === null) {
						report[key] = null;
						continue;
					}
					var style = null;
					var pseudo = null;
					try { style = read.call(win, node); } catch (error) { style = null; }
					try { pseudo = read.call(win, node, "::before"); } catch (error) { pseudo = null; }
					var fill = doc.body.style.getPropertyValue("--gm-panel-" + key + "-fill");
					report[key] = {
						element: (typeof node.tagName === "string" ? node.tagName.toLowerCase() : "") + "." + String(node.getAttribute === undefined ? "" : (node.getAttribute("class") ?? "")),
					/** 被授权的面板磨一个内层元素；否则是列。 */
					delegated: panelSurfaces[key] !== null && panelSurfaces[key] !== undefined,
					/** 面板作画的 alpha：1 意味着没有模糊能透出来。 */
					fillAlpha: fill === "" ? null : effectiveAlpha(fill),
					/** 磨砂规则是否有资格（那个免模糊逃生舱）。 */
					blurGate: doc.body.dataset.glassBlur ?? "off",
					/** 当前承载材质者的实时性状。 */
					backdropRoots: backdropRoots(node),
					/** 探测为什么选了这个宿主（没东西干扰时为空）。 */
					probeReason: panelDiag[key],
					/** 被掏空的画手，好让列的材质成为显形的那个。 */
					hollowed: panelHollow[key] === null ? 0 : panelHollow[key].length,
					/** 模糊骑在材质元素上时为 "element"，否则为 "pseudo"。 */
					blurHost: panelBlurHost[key],
						blurVariable: style !== null && style !== undefined && typeof style.getPropertyValue === "function" ? String(style.getPropertyValue("--gm-panel-blur") ?? "") : "",
						backdrop: style === null || style === undefined ? "" : String(style.backdropFilter ?? ""),
						pseudoBackdrop: pseudo === null || pseudo === undefined ? "" : String(pseudo.backdropFilter ?? ""),
						stageHost: stageHostText
					};
				}
				return report;
			}

			/**
			 * 在壁纸舞台里画一块高对比棋盘格。如果一个面板的模糊管用，那个面板背后的
			 * 方格会化成平滑的灰；如果它们保持锐利，模糊根本没够到背景。视频显示不出
			 * 这个，所以这是诚实的测试。
			 * @param on - true 显示，false 移除。
			 * @returns 结果状态。
			 */
			function checker(on) {
				var mounted = doc.querySelector("[data-glass-checker]");
				if (on === false) {
					if (mounted !== null && mounted !== undefined && typeof mounted.remove === "function") mounted.remove();
					delete doc.body.dataset.glassSelftest;
					return { checker: false };
				}
				var stage = doc.getElementById(STAGE_ID);
				if (stage === null || stage === undefined) return { checker: false, reason: "no-stage" };
				if (mounted === null || mounted === undefined) {
					mounted = doc.createElement("div");
					mounted.setAttribute("data-glass-checker", "");
					mounted.setAttribute("style", "position:absolute;inset:0;pointer-events:none;opacity:1;background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/6px 6px");
					stage.appendChild(mounted);
				}
			// 自检开启期间强制一个大模糊：问题在于机制在这个面板上是否工作，而不是某人
			// 恰好设了什么值。
				doc.body.dataset.glassSelftest = "on";
				return { checker: true, selfTest: true, forcedBlur: "40px" };
			}

			function renderWallpaper() {
				if (disposed) return;
				var active = hasWallpaperConfig(wallpaper);
				doc.body.dataset.glassWallpaper = active ? "on" : "off";
				doc.body.style.setProperty("--gm-wall-fit", wallpaper.fit);
				doc.body.style.setProperty("--gm-wall-opacity", String(wallpaper.opacity));
				doc.body.style.setProperty("--gm-wall-blur", wallpaper.blur + "px");
			// 模糊会洇出边缘；一点过扫描把缝藏掉。
			doc.body.style.setProperty("--gm-wall-scale", String(1 + (wallpaper.blur / 32) * 0.08));
			// 通透度同时淡出情绪染色，所以一个刻度就能让片子清亮。
				doc.body.style.setProperty("--gm-tint", String(Math.round(wallpaper.tint * (1 - wallpaper.clarity * (1 - TINT_THROUGH_CLARITY)) * 1000) / 1000));

				var plan = planClips();
				for (var s = 0; s < SLOTS.length; s++) {
					var slot = SLOTS[s];
					var video = videos[slot];
					if (video === undefined || video === null) continue;
					var entry = plan[slot];
					var clip = entry.clip;
					if (clip === null) {
						video.setAttribute("data-glass-clip", "none");
						try { video.pause(); } catch (error) { /* 从未启动 */ }
						video.removeAttribute("src");
						if (typeof video.load === "function") {
							try { video.load(); } catch (error) { /* 没有源可重置 */ }
						}
						continue;
					}
					video.setAttribute("data-glass-clip", active ? entry.slot : "none");
					// 存下来的文件从这个槽的对象 URL 播放；链接直接播。
					var next = clip.source === "url" ? clip.url : clipUrls[slot];
					if (next === null || next === undefined || next === "") continue;
					if (video.getAttribute("src") !== next) {
						video.setAttribute("src", next);
						video.src = next;
					}
				// 两条活着的片子保持播放：这才让切换成为交叉淡变，而不是解码器卡顿。
					startPlayback(video);
				}
			announceWallpaper();
			schedulePace();
			sampleMedia(true);
		}

			/**
			 * 载入一个槽的片子。文件被存储、从对象 URL 播放；链接直接播。
			 * @param slot - 'idle' 或 'work'。
			 * @param clip - 规范化后的片子。
			 * @param blob - 文件字节，片子是本地文件时。
			 * @returns 一个解析为结果配置的 promise。
			 */
			function installClip(slot, clip, blob) {
				releaseClipUrl(slot);
				var next = normalizeVideo({
					clips: {
						idle: slot === "idle" ? clip : wallpaper.clips.idle,
						work: slot === "work" ? clip : wallpaper.clips.work
					},
					fit: wallpaper.fit,
					opacity: wallpaper.opacity,
					blur: wallpaper.blur,
					tint: wallpaper.tint,
					clarity: wallpaper.clarity
				});
				wallpaper = next;
				if (clip.source === "file" && blob !== undefined && blob !== null
					&& objectUrls !== undefined && objectUrls !== null && typeof objectUrls.createObjectURL === "function") {
					try { clipUrls[slot] = objectUrls.createObjectURL(blob); } catch (error) { clipUrls[slot] = null; }
				}
				writeKey(VIDEO_KEY, JSON.stringify(videoConfig()));
				renderWallpaper();
				applyTokens();
				syncPanels();
			if (clip.source !== "file" || blob === undefined || blob === null) return Promise.resolve(videoConfig());
			return writeStoredClip(slot, blob).then(function () { return videoConfig(); }, function () { return videoConfig(); });
		}

			/**
			 * 合并一个配置补丁，持久化，重绘。片子字段指向一个槽（`slot`，默认
			 * `idle`）；其余是共享旋钮。
			 * @param patch - 部分配置。
			 * @returns 结果配置。
			 */
			function setWallpaper(patch) {
				var slot = patch.slot === "work" ? "work" : "idle";
				var clips = {
					idle: { source: wallpaper.clips.idle.source, url: wallpaper.clips.idle.url, name: wallpaper.clips.idle.name },
					work: { source: wallpaper.clips.work.source, url: wallpaper.clips.work.url, name: wallpaper.clips.work.name }
				};
				if (patch.url !== undefined) {
					var url = String(patch.url).trim();
					clips[slot] = { source: url === "" ? "" : "url", url: url, name: "" };
				}
				if (patch.source !== undefined) clips[slot] = { source: patch.source, url: clips[slot].url, name: clips[slot].name };
			// 可见度是"你能看到多少壁纸"的唯一旋钮：它同时设定片子自己的强度和主题给它
			// 让多少路，所以一种感知的两半永远不可能各说各话。`opacity` 和 `clarity`
			// 保持可写，给脚本用。
				var nextOpacity = patch.opacity !== undefined ? patch.opacity : wallpaper.opacity;
				var nextClarity = patch.clarity !== undefined ? patch.clarity : wallpaper.clarity;
				if (patch.visibility !== undefined) {
					var visibility = clampNumber(patch.visibility, 0, 1, wallpaper.clarity);
					nextClarity = visibility;
					nextOpacity = VISIBILITY_MIN_CLIP + visibility * (1 - VISIBILITY_MIN_CLIP);
				}
				wallpaper = normalizeVideo({
					clips: clips,
					fit: patch.fit !== undefined ? patch.fit : wallpaper.fit,
					opacity: nextOpacity,
					blur: patch.blur !== undefined ? patch.blur : wallpaper.blur,
					tint: patch.tint !== undefined ? patch.tint : wallpaper.tint,
					clarity: nextClarity,
					autoDim: patch.autoDim !== undefined ? patch.autoDim : wallpaper.autoDim
				});
				if (patch.url !== undefined && clips[slot].source === "") releaseClipUrl(slot);
				writeKey(VIDEO_KEY, JSON.stringify(videoConfig()));
				renderWallpaper();
				applyTokens();
				syncPanels();
				return videoConfig();
			}

			/**
			 * 把一个选中的文件装进一个槽：存 blob，从对象 URL 播放。
			 * @param file - 选中的 File/Blob。
			 * @param name - 它的显示名。
			 * @param slot - 'idle'（默认）或 'work'。
			 * @returns 一个解析为结果配置的 promise。
			 */
		function setWallpaperFile(file, name, slot) {
			var target = slot === "work" ? "work" : "idle";
			return installClip(target, {
					source: "file",
					url: "",
					name: name === undefined || name === null ? "" : String(name)
				}, file);
			}

			/**
			 * 忘掉一个槽（默认：两个）连同它存着的字节。
			 * @param slot - 'idle'、'work'，或 undefined 表示两个。
			 * @returns 一个在存着的 blob 消失时落定的 promise。
			 */
			function clearWallpaper(slot) {
				var targets = slot === "idle" || slot === "work" ? [slot] : SLOTS.slice();
				var clips = {
					idle: { source: wallpaper.clips.idle.source, url: wallpaper.clips.idle.url, name: wallpaper.clips.idle.name },
					work: { source: wallpaper.clips.work.source, url: wallpaper.clips.work.url, name: wallpaper.clips.work.name }
				};
				var pendingDrops = [];
				for (var i = 0; i < targets.length; i++) {
					releaseClipUrl(targets[i]);
					clips[targets[i]] = { source: "", url: "", name: "" };
					pendingDrops.push(dropStoredClip(targets[i]));
				}
				wallpaper = normalizeVideo({
					clips: clips,
					fit: wallpaper.fit,
					opacity: wallpaper.opacity,
					blur: wallpaper.blur,
					tint: wallpaper.tint,
					clarity: wallpaper.clarity
				});
				writeKey(VIDEO_KEY, JSON.stringify(videoConfig()));
				renderWallpaper();
				applyTokens();
				syncPanels();
				return Promise.all(pendingDrops);
			}

			/**
			 * 挂载时恢复持久化的配置，然后恢复它点名的那些已存文件。一份比自己的字节活得
			 * 久的配置被诚实地清掉，而不是留着指向虚空。v1 的单文件形状（顶层 `source`
			 * 和光秃的 `wallpaper` IndexedDB 键）被迁移进 idle 槽。
			 * @returns 一个在恢复尝试完成时落定的 promise。
			 */
		function restoreWallpaper() {
			var raw = readKey(VIDEO_KEY);
				var parsed = null;
				if (raw !== null && raw !== "") {
					try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
				}
				if (parsed === null) return Promise.resolve(videoConfig());
				var legacy = parsed.clips === undefined;
				wallpaper = normalizeVideo(parsed);
				renderWallpaper();
				applyTokens();
				syncPanels();

				var jobs = [];
				for (var i = 0; i < SLOTS.length; i++) {
					var slot = SLOTS[i];
					if (wallpaper.clips[slot].source !== "file") continue;
					jobs.push((function (target, useLegacy) {
						var read = useLegacy && target === "idle" ? readLegacyClip() : readStoredClip(target);
					return read.then(function (result) {
						if (disposed) return undefined;
					// 存储本身不可用：保住配置，让舞台显示渐变，而不是删掉一个正当的选择。
						if (result.available !== true) return undefined;							if (result.blob === null) return dropSlot(target);
							return installClip(target, wallpaper.clips[target], result.blob).then(function (config) {
								if (useLegacy && target === "idle") return dropLegacyClip().then(function () { return config; });
								return config;
							});
						});
					})(slot, legacy));
				}
				return Promise.all(jobs).then(function () { return videoConfig(); });
			}

		/** 清掉一个字节丢了的槽。 */
		function dropSlot(slot) {
			var clips = {
					idle: { source: wallpaper.clips.idle.source, url: wallpaper.clips.idle.url, name: wallpaper.clips.idle.name },
					work: { source: wallpaper.clips.work.source, url: wallpaper.clips.work.url, name: wallpaper.clips.work.name }
				};
				clips[slot] = { source: "", url: "", name: "" };
				wallpaper = normalizeVideo({
					clips: clips,
					fit: wallpaper.fit,
					opacity: wallpaper.opacity,
					blur: wallpaper.blur,
					tint: wallpaper.tint,
					clarity: wallpaper.clarity
				});
				writeKey(VIDEO_KEY, JSON.stringify(videoConfig()));
				renderWallpaper();
				applyTokens();
				syncPanels();
				return videoConfig();
			}
			//#endregion

		//#region panels
		/** 把当前面板配置推给每个监听者（设置行）。 */
		function announcePanels() {
			var snapshot = panelConfig();
			var found = { left: panelFound.left, main: panelFound.main, right: panelFound.right };
			for (var i = 0; i < panelListeners.length; i++) {
				try { panelListeners[i](snapshot, found); } catch (error) { /* 一行坏行不能拖累其余 */ }
			}
		}

		/** @returns 活面板配置的一份深拷贝。 */
		function panelConfig() {
				var copy = {};
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					copy[key] = { opacity: panels[key].opacity, blur: panels[key].blur, sheen: panels[key].sheen };
				}
				copy.gap = panels.gap;
				copy.frameRadius = panels.frameRadius;
				copy.panelRadius = panels.panelRadius;
				copy.divider = panels.divider;
				copy.refraction = panels.refraction;
				copy.rimSpill = panels.rimSpill;
			copy.press = panels.press;
			copy.blurFallback = panels.blurFallback;
			copy.fixedGuard = panels.fixedGuard;
			return copy;
			}

		/** @returns 找到了哪些外壳列，供设置行和调试用。 */
		function panelStatus() {
				var detail = {};
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var surface = panelSurfaces[key];
					detail[key] = surface === null || surface === undefined
						? null
						: {
							tag: typeof surface.tagName === "string" ? surface.tagName.toLowerCase() : "",
							className: surface.getAttribute === undefined ? "" : String(surface.getAttribute("class") ?? "")
						};
				}
				return {
					found: { left: panelFound.left, main: panelFound.main, right: panelFound.right },
					surfaces: {
						left: panelSurfaces.left !== null && panelSurfaces.left !== undefined,
						main: panelSurfaces.main !== null && panelSurfaces.main !== undefined,
						right: panelSurfaces.right !== null && panelSurfaces.right !== undefined
					},
				/** 每个面板的材质被交给了哪个元素，供诊断。 */
				surfaceDetail: detail,
					config: panelConfig()
				};
			}

		/**
		 * 给页面级内容表面打上磨砂标记。设置页是一个大表面，磨砂玻璃适合它；小的文件
		 * diff 弹出层不是，而模糊它的背景正是让 diff 难读的东西。尺寸是唯一能把它们
		 * 分开、又不必猜类名的信号。
		 */
		function tagBigSurfaces() {
				if (disposed) return;
				var nodes = doc.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
				var viewportWidth = win.innerWidth > 0 ? win.innerWidth : 0;
				var viewportHeight = win.innerHeight > 0 ? win.innerHeight : 0;
				for (var i = 0; i < nodes.length; i++) {
					var node = nodes[i];
					if (typeof node.getBoundingClientRect !== "function") continue;
					var box = node.getBoundingClientRect();
					if (viewportWidth > 0 && viewportHeight > 0 && box.width >= viewportWidth * BIG_SURFACE_RATIO && box.height >= viewportHeight * BIG_SURFACE_RATIO) {
						if (node.getAttribute("data-glass-frost") !== "on") node.setAttribute("data-glass-frost", "on");
					} else if (node.getAttribute("data-glass-frost") !== undefined && node.getAttribute("data-glass-frost") !== null) {
						node.removeAttribute("data-glass-frost");
					}
				}
			}

		/**
		 * 每个可能担当呈现层的元素，供诊断。查找器回答"是哪一个"；这个回答"到底有过
		 * 什么"，而正是这把一次未命中变成一次读数、而不是又一次猜测。
		 * @returns 至多六条描述。
		 */
		function presentationCandidates() {
			var out = [];
			var frame = null;
			try { frame = doc.querySelector('[class*="_frame"]'); } catch (error) { frame = null; }
			if (frame === null || frame === undefined || typeof frame.getBoundingClientRect !== "function") return out;
			var frameBox = frame.getBoundingClientRect();
			var all = null;
			try { all = doc.querySelectorAll("*"); } catch (error) { all = null; }
			if (all === null || all === undefined) return out;
			for (var i = 0; i < all.length && out.length < 6; i++) {
				var node = all[i];
				if (node === undefined || node === null || typeof node.getBoundingClientRect !== "function") continue;
				if (node === frame) continue;
				if (insidePanel(node)) continue;
				var box = node.getBoundingClientRect();
				if (!(box.width >= frameBox.width * FULLSCREEN_MIN_SPAN)) continue;
				if (!(box.height >= frameBox.height * FULLSCREEN_MIN_HEIGHT)) continue;
				var described = describeNode(node);
				if (described !== null) out.push(described);
			}
			return out;
		}

		/**
		 * 仅诊断用——从不用于选宿主。它报告右栏全屏呈现期间盖住框的最深元素，从 app 自己
		 * 对那次呈现的描述出发（一个让中间列宽度不变、坐在标题栏下方、展开侧边栏右侧的
		 * 浮动面板）。
		 *
		 * 它曾被试着当宿主，结果选中了中间面板自己的内容根——它的盒子就是中间列的——于是
		 * 右栏的材质落到了中间面板上，透过展开面板看到的模糊是中间面板自己的。它留着，
		 * 因为正是它让那一切在报告里显形。
		 * @returns 盖住框且画着东西的最深元素，或 null。
		 */
		function presentationLayerNode() {
			var frame = null;
			try { frame = doc.querySelector('[class*="_frame"]'); } catch (error) { frame = null; }
			if (frame === null || frame === undefined || typeof frame.getBoundingClientRect !== "function") return null;
			var frameBox = frame.getBoundingClientRect();
			if (!(frameBox.width > 0) || !(frameBox.height > 0)) return null;
			var queue = [];
			var roots = [];
			if (doc.body !== undefined && doc.body !== null && doc.body.children !== undefined) {
				for (var b = 0; b < doc.body.children.length && b < 24; b++) roots.push(doc.body.children[b]);
			}
			for (var r = 0; r < roots.length; r++) queue.push({ node: roots[r], depth: 0 });
			var best = null;
			var bestDepth = -1;
			var visited = 0;
			while (queue.length > 0 && visited < PRESENT_MAX_NODES) {
				var entry = queue.shift();
				visited += 1;
				var node = entry.node;
				if (node === null || node === undefined) continue;
				if (typeof node.getBoundingClientRect !== "function") continue;
				if (node.getAttribute !== undefined && node.getAttribute("id") === STAGE_ID) continue;
			// 不在另一个面板内部：这才让中间面板自己的表面、以及侧边栏的，无论多大都
			// 出局。
			if (insidePanel(node)) continue;
			var box = node.getBoundingClientRect();
			// 呈现面板被保持在标题栏下方、侧边栏右侧，所以它从中间列起步、延伸到框的
			// 右缘。就这一条把整 app 的包装（左缘为 0）挡在外面。
				var centre = panelNodes.main;
				var centreBox = centre !== null && centre !== undefined && typeof centre.getBoundingClientRect === "function" ? centre.getBoundingClientRect() : null;
				var leftEdge = centreBox === null ? frameBox.left : centreBox.left;
				var inBand = box.left >= leftEdge - 12 && (box.left + box.width) >= (frameBox.left + frameBox.width) - 12;
				if (inBand && box.width >= frameBox.width * FULLSCREEN_MIN_SPAN && box.height >= frameBox.height * FULLSCREEN_MIN_HEIGHT) {
				// 不测颜料：呈现面板的那层是透明容器，画的是它的子元素。要求它自己画东西，
				// 曾把唯一要紧的那个元素拒之门外——活报告回来时一个候选都没有。
					if (entry.depth > bestDepth) { best = node; bestDepth = entry.depth; }
				}
				if (entry.depth >= PRESENT_MAX_DEPTH) continue;
				var children = node.children;
				if (children === undefined || children === null) continue;
				for (var c = 0; c < children.length && c < 12; c++) {
					if (children[c] === undefined || children[c] === null) continue;
					queue.push({ node: children[c], depth: entry.depth + 1 });
				}
			}
			return best;
		}

		/**
		 * 一个节点是否属于三个面板之一。呈现层从来不属于：它是被呈现来*代替*它们的东西。
		 * @param node - 候选者。
		 * @returns 某个面板是它的祖先时为 true。
		 */
		function insidePanel(node) {
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var panel = panelNodes[PANEL_KEYS[i]];
				if (panel === null || panel === undefined) continue;
				var walk = node;
				var guard = 0;
				while (walk !== null && walk !== undefined && guard < 64) {
					guard += 1;
					if (walk === panel) return true;
					walk = walk.parentElement !== undefined ? walk.parentElement : walk.parent;
				}
			}
			return false;
		}

		function fullscreenPanelNode() {
				var frame = null;
				try { frame = doc.querySelector('[class*="_frame"]'); } catch (error) { frame = null; }
				if (frame === null || frame === undefined || typeof frame.getBoundingClientRect !== "function") return null;
				var frameBox = frame.getBoundingClientRect();
				if (!(frameBox.width > 0) || !(frameBox.height > 0)) return null;
				var queue = [];
				if (frame.children !== undefined) {
					for (var i = 0; i < frame.children.length; i++) queue.push({ node: frame.children[i], depth: 0 });
				}
				if (doc.body !== undefined && doc.body !== null && doc.body.children !== undefined) {
					for (var b = 0; b < doc.body.children.length && b < 20; b++) queue.push({ node: doc.body.children[b], depth: 0 });
				}
				var best = null;
				var bestDepth = -1;
				var visited = 0;
				while (queue.length > 0 && visited < FULLSCREEN_MAX_NODES) {
					var entry = queue.shift();
					visited += 1;
					var node = entry.node;
					if (node === null || node === undefined || node === frame) continue;
					if (typeof node.getBoundingClientRect !== "function") continue;
					if (node.getAttribute !== undefined && node.getAttribute("id") === STAGE_ID) continue;
					var box = node.getBoundingClientRect();
					if (box.width >= frameBox.width * FULLSCREEN_MIN_SPAN && box.height >= frameBox.height * FULLSCREEN_MIN_HEIGHT) {
						var style = null;
						try { style = win.getComputedStyle(node); } catch (error) { style = null; }
						var paints = style !== null && style !== undefined && (
							parseAlpha(style.backgroundColor) >= SURFACE_MIN_ALPHA ||
							(typeof style.backgroundImage === "string" && style.backgroundImage !== "none" && style.backgroundImage !== "")
						);
						if (paints && entry.depth > bestDepth) { best = node; bestDepth = entry.depth; }
					}
					if (entry.depth >= FULLSCREEN_MAX_DEPTH) continue;
					var children = node.children;
					if (children === undefined || children === null) continue;
					for (var c = 0; c < children.length && c < 10; c++) {
						if (children[c] === undefined || children[c] === null) continue;
						queue.push({ node: children[c], depth: entry.depth + 1 });
					}
				}
				return best;
			}

		/**
		 * 渲染展开的右栏的那个元素。app 不为那个模式加宽列——框的网格没动，
		 * `rightbarFullscreen` 只压制过渡、藏起拖拽手柄——所以展开的面板改在外壳的
		 * 覆盖层里呈现在框之上。列留在原地，这就是材质过去坐在旧几何上、而展开的面板
		 * 光着、中间面板透过它显形的原因。
		 * @returns 覆盖层里跨距最大的子元素，或 null。
		 */
		function overlayPanelNode() {
				if (typeof doc.querySelector !== "function") return null;
				var layer = null;
				try { layer = doc.querySelector("[data-shell-overlay]"); } catch (error) { layer = null; }
				if (layer === null || layer === undefined || layer.children === undefined) return null;
				var frame = null;
				try { frame = doc.querySelector('[class*="_frame"]'); } catch (error) { frame = null; }
				var frameBox = frame !== null && frame !== undefined && typeof frame.getBoundingClientRect === "function"
					? frame.getBoundingClientRect()
					: null;
				var best = null;
				var bestArea = 0;
				for (var i = 0; i < layer.children.length; i++) {
					var child = layer.children[i];
					if (child === null || child === undefined || typeof child.getBoundingClientRect !== "function") continue;
					var box = child.getBoundingClientRect();
					if (!(box.width > 0) || !(box.height > 0)) continue;
					// toast 或通知也住在这里；展开的面板才盖住整个框。
					if (frameBox !== null && (box.width < frameBox.width * OVERLAY_MIN_SPAN || box.height < frameBox.height * OVERLAY_MIN_SPAN)) continue;
					var area = box.width * box.height;
					if (area > bestArea) { bestArea = area; best = child; }
				}
				return best;
			}

		/**
		 * 一个面板的每个带着自己圆角的后代。
		 *
		 * 一个读起来像两弧的角，永远意味着两个半径，而第二个从来不是面板的——它属于里面
		 * 的某个东西，深度未知，再怎么眯眼瞧截图也指不出来。这个指出来。
		 * @returns 至多 24 条，带盒子，好把错的排除掉。
		 */
		function cornerAudit() {
				var out = [];
				if (typeof doc.querySelectorAll !== "function") return out;
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var column = panelNodes[key];
					if (column === null || column === undefined) continue;
					var columnBox = null;
					try { columnBox = column.getBoundingClientRect(); } catch (error) { continue; }
					/* 只有大到够伸到一个角的东西，才画得出第二个。而这个审计的第一轮把全部
					   24 个槽花在了侧边栏的按钮和会话行（28x28、256x32）上，另外两个面板根本
					   没轮到——一堂有用的课：一个说不出"这里什么都没有"的审计，比没有更糟，
					   因为它看起来像个答案。 */
					var floorArea = columnBox === null || columnBox === undefined ? 0 : columnBox.width * columnBox.height * 0.08;
					var perPanel = 0;
					var nodes = null;
					try { nodes = column.querySelectorAll("*"); } catch (error) { continue; }
					if (nodes === null || nodes === undefined) continue;
					for (var n = 0; n < nodes.length && n < 500 && perPanel < 8; n++) {
						var node = nodes[n];
						var described = describeNode(node);
						if (described === null) continue;
						var radius = String(described.css === undefined ? "" : (described.css.radius ?? "0px"));
						if (radius === "" || radius === "0px" || radius === "0") continue;
						var box = described.box;
						if (box === null || box === undefined) continue;
						if (box[2] * box[3] < floorArea) continue;
						out.push({
							panel: key,
							sel: described.sel,
							box: box,
							radius: radius,
							bg: described.css.bg,
							overflow: described.css.overflow
						});
						perPanel += 1;
					}
				}
				return out;
			}

		/**
		 * 一个元素的短而有界的描述：它是什么、它如何自我介绍、它在哪里，以及决定它画
		 * 什么、如何堆叠的那些 CSS。
		 * @param node - 这个元素。
		 * @returns 一个普通对象；读不了时为 null。
		 */
		function describeNode(node) {
				if (node === null || node === undefined || typeof node.getBoundingClientRect !== "function") return null;
				var box = node.getBoundingClientRect();
				var out = {
					sel: (typeof node.tagName === "string" ? node.tagName.toLowerCase() : "?") + "." + String(node.getAttribute === undefined ? "" : (node.getAttribute("class") ?? "")),
					attrs: {},
					box: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)]
				};
				if (node.attributes !== undefined && node.attributes !== null) {
					for (var i = 0; i < node.attributes.length && i < 14; i++) {
						var attr = node.attributes[i];
						if (attr === undefined || attr === null) continue;
						var name = String(attr.name ?? "");
						if (name.indexOf("data-") !== 0 && name !== "class" && name !== "style") continue;
						if (name === "class") continue;
						out.attrs[name] = String(attr.value ?? "").slice(0, 80);
					}
				}
				var read = win !== undefined && win !== null && typeof win.getComputedStyle === "function" ? win.getComputedStyle : null;
				if (read !== null) {
					var style = null;
					try { style = read.call(win, node); } catch (error) { style = null; }
					if (style !== null && style !== undefined) {
						out.css = {
							position: String(style.position ?? ""),
							zIndex: String(style.zIndex ?? ""),
							overflow: String(style.overflow ?? ""),
							display: String(style.display ?? ""),
							bg: String(style.backgroundColor ?? ""),
							bgImage: String(style.backgroundImage ?? "none").slice(0, 60),
							backdrop: String(style.backdropFilter ?? style.webkitBackdropFilter ?? "none").slice(0, 120),
							isolation: String(style.isolation ?? ""),
							contain: String(style.contain ?? ""),
							opacity: String(style.opacity ?? ""),
							radius: String(style.borderRadius ?? ""),
							/* 阴影和可见性过去都在这份报告里看不见，而那正是一次扛过模式切换的
							   阴影只能被猜的原因。两者从现在起都读。 */
								shadow: String(style.boxShadow ?? ""),
								visibility: String(style.visibility ?? "")
						};
					}
				}
				return out;
			}

		/**
		 * 广度优先地把一棵子树走成一张有界清单，好让一份报告不必开控制台就能回答
		 * "屏幕上实际有什么、谁在画它"。
		 * @param node - 子树根。
		 * @param max - 描述多少个元素。
		 * @returns 清单，根在前。
		 */
		function describeTree(node, max) {
				var out = [];
				if (node === null || node === undefined) return out;
				var queue = [{ node: node, depth: 0 }];
				while (queue.length > 0 && out.length < max) {
					var entry = queue.shift();
					var described = describeNode(entry.node);
					if (described === null) continue;
					described.depth = entry.depth;
					out.push(described);
					if (entry.depth >= 3) continue;
					var children = entry.node.children;
					if (children === undefined || children === null) continue;
					for (var i = 0; i < children.length && i < 8; i++) {
						if (children[i] === undefined || children[i] === null) continue;
						queue.push({ node: children[i], depth: entry.depth + 1 });
					}
				}
				return out;
			}

		/**
		 * "展开的右栏"这个问题需要的一切：框的形状、覆盖层（如果有）、右列子树，以及
		 * 本插件为每个面板决定了什么。
		 * @returns 一个可以安全当 JSON 发出去的普通对象。
		 */
		function domReport() {
				var frame = null;
				try { frame = doc.querySelector('[class*="_frame"]'); } catch (error) { frame = null; }
				var overlay = null;
				try { overlay = doc.querySelector("[data-shell-overlay]"); } catch (error) { overlay = null; }
				var report = {
					build: BUILD,
					at: new Date().toISOString(),
					viewport: [win.innerWidth, win.innerHeight],
				// 每张卡本该一致的那个沟槽，好让"间隙对不上"从报告上读出来，而不是靠瞄。
					gap: panels.gap,
					expanded: rightbarExpanded(),
					frame: describeNode(frame),
				/* 标题栏住在一个伪元素上，`describeNode` 永远看不见它。它带着不透明填充
				   活了这主题的一生，而每份报告都说框是透明的——一个花掉整整一轮往返的盲点。
				   显式读它。 */
					frameBefore: (function () {
						if (frame === null || frame === undefined) return null;
						if (win === undefined || win === null || typeof win.getComputedStyle !== "function") return null;
						var style = null;
						try { style = win.getComputedStyle(frame, "::before"); } catch (error) { return null; }
						if (style === null || style === undefined) return null;
						return {
							content: String(style.content ?? ""),
							height: String(style.height ?? ""),
							bg: String(style.backgroundColor ?? "")
						};
					})(),
				/* 镜边也是伪元素，而且是唯一另一样画进玻璃同一个角的东西。窗格近透明时，
				   镜边是屏幕上剩下的大部分，所以"有两个弧"只能靠读它来断。 */
					fullscreenAfter: (function () {
						var panel = fullscreenRightPanel();
						if (panel === null || panel === undefined) return null;
						if (win === undefined || win === null || typeof win.getComputedStyle !== "function") return null;
						var style = null;
						try { style = win.getComputedStyle(panel, "::after"); } catch (error) { return null; }
						if (style === null || style === undefined) return null;
						return {
							content: String(style.content ?? ""),
							radius: String(style.borderRadius ?? ""),
							shadow: String(style.boxShadow ?? ""),
							opacity: String(style.opacity ?? "")
						};
					})(),
					frameChildren: [],
					overlay: null,
					overlayCandidate: null,
					fullscreenCandidate: describeNode(fullscreenPanelNode()),
				// app 自己怎么称呼全屏面板，放在上面两个几何猜测旁边：它们不一致时，
				// app 赢。
				fullscreenPanel: describeNode(fullscreenRightPanel()),
				presentationLayer: describeNode(presentationLayerNode()),
				presentationCandidates: presentationCandidates(),
				// 面板内部哪个元素在画第二个角。
				cornerAudit: cornerAudit(),
				/* 任何还戴着全屏标记的东西，无论这一轮有没有把材质交给它。标记驱动一道
				   镜边，所以模式结束后留下一个，就是一道比它的面板活得久的阴影——那正是
				   "旧面板的阴影还在那里"看起来的样子。 */
					fullscreenMarked: (function () {
						var list = null;
						try { list = doc.querySelectorAll("[data-glass-fullscreen]"); } catch (error) { return []; }
						var out = [];
						if (list === null || list === undefined) return out;
						for (var i = 0; i < list.length; i++) out.push(describeNode(list[i]));
						return out;
					})(),
					biggest: [],
					rightColumn: null,
					panels: {}
				};
				if (frame !== null && frame !== undefined && frame.children !== undefined) {
					for (var i = 0; i < frame.children.length && i < 8; i++) {
						var child = frame.children[i];
						var described = describeNode(child);
						if (described !== null) report.frameChildren.push(described);
					}
					if (frame.style !== undefined && frame.style !== null && typeof frame.style.getPropertyValue === "function") {
						report.frameGrid = String(frame.style.gridTemplateColumns ?? "");
					}
				}
				if (overlay !== null && overlay !== undefined) {
					report.overlay = describeTree(overlay, 10);
					var candidate = overlayPanelNode();
					report.overlayCandidate = describeNode(candidate);
				}
			// 屏幕上最大的那些元素，好让"哪一层是面板"由数据回答，而不是又一次猜测。
				var all = null;
				try { all = doc.querySelectorAll("*"); } catch (error) { all = null; }
				if (all !== null && all !== undefined) {
					var hostBox = frame !== null && frame !== undefined && typeof frame.getBoundingClientRect === "function" ? frame.getBoundingClientRect() : null;
					var frameArea = hostBox === null ? 0 : hostBox.width * hostBox.height;
					var ranked = [];
					for (var q = 0; q < all.length && q < 1500; q++) {
						var el = all[q];
						if (el === undefined || el === null || typeof el.getBoundingClientRect !== "function") continue;
						var eb = el.getBoundingClientRect();
						var area = eb.width * eb.height;
						if (area < frameArea * 0.2) continue;
						ranked.push({ area: area, node: el });
					}
					ranked.sort(function (x, y) { return y.area - x.area; });
					for (var z = 0; z < ranked.length && z < 10; z++) {
						var described = describeNode(ranked[z].node);
						if (described !== null) { described.area = Math.round(ranked[z].area); report.biggest.push(described); }
					}
				}
				var column = panelNodes.right;
				if (column !== null && column !== undefined) report.rightColumn = describeTree(column, 12);
			// 中间列也要：一个关于它的角的问题，没法从一份只走过右列的报告里回答。
				var mainColumn = panelNodes.main;
				if (mainColumn !== null && mainColumn !== undefined) report.mainColumn = describeTree(mainColumn, 12);
				for (var k = 0; k < PANEL_KEYS.length; k++) {
					var key = PANEL_KEYS[k];
					var node = panelNodes[key];
					report.panels[key] = {
						node: describeNode(node),
						delegated: panelSurfaces[key] !== null && panelSurfaces[key] !== undefined,
						surface: describeNode(panelSurfaces[key]),
					// 旋钮被要求的值，摆在 CSS 解析出的值旁边：填充里的 0 在人这个说法
					// 纠正之前都是他自己的设置，两者绝不能混为一谈。
					asked: {
						opacity: panels[key] === undefined || panels[key] === null ? null : panels[key].opacity,
						blur: panels[key] === undefined || panels[key] === null ? null : panels[key].blur
					},
					// 任何会让磨砂什么都取不到的东西。
						backdropRoots: panelDiag[key],
						blurNote: panelBlurNote[key],
						fill: String(doc.body.style.getPropertyValue("--gm-panel-" + key + "-fill")),
						blur: String(doc.body.style.getPropertyValue("--gm-panel-" + key + "-blur")),
						blurHost: panelBlurHost[key],
						found: panelFound[key] === true,
						hollowed: panelHollow[key] === null ? 0 : panelHollow[key].length
					};
				}
				return report;
			}

		/**
		 * 发一份报告，并在本地留一份拷贝，好让一次被挡的请求仍把证据留在设置行指得出
		 * 的地方。
		 * @param reason - 是什么要的它，记进载荷。
		 */
		function postDomReport(reason, force) {
			/* 普通布局那份快照刻意豁免于上限。那个上限是为防止展开的面板淹了接收方，
			   但它也意味着最值得那份报告永远到不了：app 会把右栏恢复成展开的，于是六份
			   `expanded` 报告在加载后一秒内用光，而一份普通布局的快照——唯一能回答普通
			   布局里某个角的问题的证据——被悄悄丢掉了。 */
				if (reportPosts >= REPORT_MAX_POSTS && force !== true) return;
				reportPosts += 1;
				var payload = domReport();
				payload.reason = reason;
				var text = "";
				try { text = JSON.stringify(payload); } catch (error) { text = ""; }
				if (text === "") return;
				try {
					if (storage !== null && storage !== undefined && typeof storage.setItem === "function") {
						storage.setItem(REPORT_KEY, text.slice(0, 200000));
					}
			} catch (error) { /* 配额满了赔上的是拷贝，不是报告 */ }
			if (typeof win.fetch !== "function") return;
			try {
				var sent = win.fetch(REPORT_URL, { method: "POST", body: text, mode: "cors", headers: { "content-type": "text/plain" } });
				if (sent !== undefined && sent !== null && typeof sent.catch === "function") sent.catch(function () { /* 没人在听 */ });
			} catch (error) { /* 没人在听 */ }
			}

	/**
	 * 找到三个外壳列，在它们身上盖上本插件自己的钩子。外壳的类名局部名是查找方式，
	 * 我们的属性是契约：此后每条样式规则都读一个本插件拥有的名字。
	 * @param deep - 同时探测内层表面，并挂上光扫。
	 * @returns 找到的映射。
	 */
	function tagPanels(deep) {
			if (disposed) return panelFound;
			var frame = doc.querySelector('[class*="_frame"]');
			if (frame !== null && frame !== undefined) frame.setAttribute("data-glass-frame", "");
			/* 这里记下三次靠几何找展开右栏的失败，因为三次都把材质挪到了错的元素上：
			   "盖住框的最深元素"搜索选中了中间面板自己的内容根（1701x1500——中间列的
			   盒子），于是透过展开面板看到的模糊是中间面板自己的；"覆盖层里跨满框的子元素"
			   搜索什么都没找到，因为 app 的覆盖层载的是 toast，不是这个面板；"呈现带"规则
			   同样什么都没找到。
			   列在任何模式下都是列——app 在全屏面板下面保留它的网格轨道——所以这里什么都不
			   重新指派。那个模式里变的只是材质画在哪里，而那由 `discoverSurfaces()` 从 app
			   自己的标记决定。 */
			// 那个被反复报坏的模式，进人时测一次、稍后再测一次，好把迟到的布局算进来。
			if (rightbarExpanded() === true && deep === true && reportTimer === 0) {
				reportTimer = setTimer(function () { reportTimer = 0; postDomReport("expanded"); }, 900);
			}
			// 普通布局，每会话一次，且只在它还是普通布局时。
			if (deep === true && initialReported === false && rightbarExpanded() !== true) {
				initialReported = true;
				setTimer(function () { postDomReport("initial", true); }, 1500);
			}
			/* 刚收起之后。这是"旧面板的阴影还在那里"那个问题需要的快照：幸存于切换的
			   一切，此刻还在屏幕上，而没有别的东西在看它。 */
			if (deep === true && wasExpanded === true && rightbarExpanded() !== true) {
				setTimer(function () { postDomReport("collapse", true); }, 400);
			}
			wasExpanded = rightbarExpanded();
				var rebuilt = false;
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var key = PANEL_KEYS[i];
				var node = doc.querySelector(PANEL_SELECTOR[key]);
				// 之前谁占着这个面板，谁就把钩子还回来：一个陈宿主绝不能在面板已经不在的
				// 地方继续画一块窗格。
				var previous = panelNodes[key];
				if (previous !== null && previous !== undefined && previous !== node) {
					previous.removeAttribute("data-glass-panel");
					previous.removeAttribute("data-glass-delegate");
					if (panelSurfaces[key] !== null && panelSurfaces[key] !== undefined) {
						panelSurfaces[key].removeAttribute("data-glass-surface");
						// 标记也还，否则那一层会留住一个本插件只在模式开着时替它把着的定位。
						panelSurfaces[key].removeAttribute("data-glass-fullscreen");
						panelSurfaces[key] = null;
					}
				}
				if (node === null || node === undefined) {
					panelFound[key] = false;
					panelNodes[key] = null;
					continue;
				}
				// 收起的（或还没布局的）列完全放过：不裁剪、不边距、不材质。等它下一次
				// 有了真实宽度，它在下一趟回来。
					if (!columnUsable(node)) {
						panelFound[key] = false;
						panelNodes[key] = null;
						if (node.getAttribute("data-glass-panel") !== undefined && node.getAttribute("data-glass-panel") !== null) node.removeAttribute("data-glass-panel");
						if (node.getAttribute("data-glass-delegate") !== undefined && node.getAttribute("data-glass-delegate") !== null) node.removeAttribute("data-glass-delegate");
						var stale = panelSurfaces[key];
						if (stale !== null && stale !== undefined) {
							stale.removeAttribute("data-glass-surface");
							stale.removeAttribute("data-glass-fullscreen");
						}
						panelSurfaces[key] = null;
						continue;
					}
					panelFound[key] = true;
					if (panelNodes[key] !== node) rebuilt = true;
					panelNodes[key] = node;
					node.setAttribute("data-glass-panel", key);
				}
		if (deep === true || rebuilt) discoverSurfaces();
		// 重建过的外壳，也需要把壁纸舞台挪回它内部。
		ensureStageHost();
		// 无论这一轮找到了什么，下一次缩放都必须和它同一帧到达。
		observeColumns();
		return panelFound;
		}

		/**
		 * @param node - 一列外壳列。
		 * @returns 它是否宽到够当面板。盒子量不到时假定这列可用，好让一个素 DOM 也
		 * 拿到全套待遇。
		 */
		function columnUsable(node) {
				if (typeof node.getBoundingClientRect !== "function") return true;
				var box = null;
				try { box = node.getBoundingClientRect(); } catch (error) { return true; }
				if (box === null || box === undefined) return true;
				if (typeof box.width !== "number") return true;
				return box.width >= COLLAPSED_MAX_WIDTH;
			}

		/**
		 * @param node - 一个候选表面。
		 * @returns 它是否还在文档里（这样它的材质仍落在看得见的地方）。桩 DOM 回退到
		 * 父节点遍历。
		 */
		function surfaceAttached(node) {
				if (node === null || node === undefined) return false;
				if (node.isConnected === true) return true;
				if (node.isConnected === false) return false;
				var walk = node;
				while (walk !== null && walk !== undefined) {
					if (walk === doc.body || walk === doc.documentElement) return true;
					walk = walk.parentElement !== undefined ? walk.parentElement : walk.parent;
				}
				return false;
			}

		/**
		 * app 是否把右栏展开在框之上。那个模式下 app 把列封顶到视口的 70%、把中间压到
		 * 400px，而面板自己的内容保持比它如今所在的列更窄的宽度——所以材质必须留在列上，
		 * 列是唯一跨满这个模式的元素。
		 * @returns 框报告展开的右栏期间为 true。
		 */
		function rightbarExpanded() {
			if (typeof doc.querySelector !== "function") return false;
			try {
				// app 把这个属性写在框上、不写在别处，所以单独查它，而不是通过类名。
				return doc.querySelector("[data-rightbar-fullscreen]") !== null;
			} catch (error) {
				return false;
			}
		}

	/**
	 * 右栏全屏呈现期间渲染它的那个元素。
	 *
	 * 这里什么都不对着框量、也不按面积排名：两样都试过，两样都选中了中间面板（它的
	 * 内容根共享中间列的盒子），把右栏的材质交到了错的面板手里。app 自己给那层起了
	 * 名字，所以查找就是那个名字。
	 *
	 * 多个会话子树可能同时挂载（"只有前台子树报框轨道；其他子树保持隐藏"），所以可见的
	 * 那个是真正布局出来的最大盒子——隐藏的子树塌成虚无，赢不了。
	 * @returns 全屏面板元素；模式关闭时为 null。
	 */
	function fullscreenRightPanel() {
				if (typeof doc.querySelectorAll !== "function") return null;
				var list = null;
				try { list = doc.querySelectorAll(RIGHT_PANEL_FULLSCREEN_SELECTOR); } catch (error) { return null; }
				if (list === null || list === undefined) return null;
				var best = null;
				var bestArea = 0;
				for (var i = 0; i < list.length; i++) {
					var node = list[i];
					if (node === undefined || node === null || typeof node.getBoundingClientRect !== "function") continue;
					var box = null;
					try { box = node.getBoundingClientRect(); } catch (error) { continue; }
					if (box === null || box === undefined || !(box.width > 0) || !(box.height > 0)) continue;
					var area = box.width * box.height;
					if (area > bestArea) { bestArea = area; best = node; }
				}
				return best;
			}

		/**
		 * 把每个面板的材质交给真正画它的那个元素。没有这一步，侧边栏自己的表面就压在列
		 * 上面，那个面板的不透明度和模糊旋钮挪动的就是没人看得见的值。
		 */
		function discoverSurfaces() {
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var column = panelNodes[key];
					var sticky = panelSurfaces[key];
					if (column === null || column === undefined) {
						if (sticky !== null && sticky !== undefined) sticky.removeAttribute("data-glass-surface");
						panelSurfaces[key] = null;
						continue;
					}
				/* 全屏呈现的右栏是 app 定位在框之上的一层，不是列：列在下面保留自己的轨道，
				   那一层向左搭过中间列盖住它（见 RIGHT_PANEL_FULLSCREEN_SELECTOR 上的注记）。
				   留在列上的材质只覆盖面板原来占据的那条，别的什么也没有——报上来的"透明和
				   模糊停在侧栏原来的位置"——所以这里把它挪到那一层上。

				   那一层自己不画任何东西，这就是普通探测从来找不到它的原因：探测找的是一个
				   已经在画东西的元素，而这个是一个透明容器、画的是它的子元素。填充是把它变成
				   画手的东西，而从那一刻起它像任何其他被授权表面一样重新验证。 */
					var full = key === "right" ? fullscreenRightPanel() : null;
					if (key === "right" && (full === null || full === undefined)) {
					/* 模式关了，所以那一层把一切交还——材质、标记，以及本插件替它把着的定位。
					   这是刻意在这里做、而不是留给下面的重新验证的：那一层一旦被给了填充仍
					   覆盖着列，所以它看起来会像一个完全合格的表面，在普通 `push` 模式下也
					   留住材质——而在那里它还会失去 app 锚定它的绝对定位，因为标记保护的正是
					   那个。列自己的规则从这里接管。 */
						if (sticky !== null && sticky !== undefined && sticky.getAttribute("data-glass-fullscreen") !== undefined) {
							sticky.removeAttribute("data-glass-fullscreen");
							sticky.removeAttribute("data-glass-surface");
							column.removeAttribute("data-glass-delegate");
							panelSurfaces[key] = null;
							sticky = null;
						}
					}
					if (full !== null && full !== undefined) {
						if (sticky !== null && sticky !== undefined && sticky !== full) sticky.removeAttribute("data-glass-surface");
						if (panelHollow[key] !== null) {
							for (var hf = 0; hf < panelHollow[key].length; hf++) panelHollow[key][hf].removeAttribute("data-glass-hollow");
						}
						panelHollow[key] = null;
					// 仍然测量，仍然上报：一个形成背景根的祖先会让这层磨砂什么都取不到。
					// 它不把材质搬回列，因为面板画的不是列那个位置——那只是它过去的位置。
						panelDiag[key] = backdropRoots(full);
						panelSurfaces[key] = full;
						if (full.getAttribute("data-glass-surface") !== key) full.setAttribute("data-glass-surface", key);
						if (full.getAttribute("data-glass-fullscreen") === undefined || full.getAttribute("data-glass-fullscreen") === null) {
							full.setAttribute("data-glass-fullscreen", "");
						}
						aimBlur(key);
						column.setAttribute("data-glass-delegate", "on");
						continue;
					}
				// 留住已经把材质交给它的表面，但只在它仍覆盖列期间：授权是从一次测量发出去的，
				// 而列在它脚下移动（右栏全屏会把列加宽而不加宽内层表面，这就是窗格的不透明度和
				// 模糊不再覆盖面板的原因）。每趟都重新探测会让面板的不透明度在两个值之间闪，因为
				// 一个什么都找不到的探测会把内层自己的（如今受保护的、近乎不透明的）填充放上台
				// ——重新验证保住那个保护，又不把一个陈旧的测量冻结在原地。
					if (surfaceAttached(sticky) && surfaceStillCovers(win, column, sticky)) {
						if (sticky.getAttribute("data-glass-surface") !== key) sticky.setAttribute("data-glass-surface", key);
						aimBlur(key);
						column.setAttribute("data-glass-delegate", "on");
						continue;
					}
					if (sticky !== null && sticky !== undefined) {
				// 它不再覆盖列了，所以它回到 app 自己的颜料，材质交给如今覆盖着的那个元素。
						sticky.removeAttribute("data-glass-surface");
						panelSurfaces[key] = null;
						column.removeAttribute("data-glass-delegate");
					}
					var painters = paintersIn(win, column) ?? [];
					var next = painters.length === 0 ? null : painters[painters.length - 1];
				// 画手看不穿自己时，把材质交给列、改为掏空那些画手。
					var rooted = next === null ? [] : backdropRoots(next);
					if (rooted.length > 0) {
						if (panelHollow[key] !== null) {
							for (var h = 0; h < panelHollow[key].length; h++) panelHollow[key][h].removeAttribute("data-glass-hollow");
						}
						panelHollow[key] = painters;
						for (var hp = 0; hp < painters.length; hp++) painters[hp].setAttribute("data-glass-hollow", "");
						panelDiag[key] = rooted;
						next = null;
					} else {
						if (panelHollow[key] !== null) {
							for (var hc = 0; hc < panelHollow[key].length; hc++) panelHollow[key][hc].removeAttribute("data-glass-hollow");
						}
						panelHollow[key] = null;
						panelDiag[key] = [];
						aimBlur(key);
					}
					if (panelSurfaces[key] !== null && panelSurfaces[key] !== next) {
						panelSurfaces[key].removeAttribute("data-glass-surface");
					}
					panelSurfaces[key] = next;
					if (next === null || next === undefined) {
						if (column !== null && column !== undefined) column.removeAttribute("data-glass-delegate");
						continue;
					}
					if (next.getAttribute("data-glass-surface") !== key) next.setAttribute("data-glass-surface", key);
					aimBlur(key);
					column.setAttribute("data-glass-delegate", "on");
				}
			}

			/** @returns 呈现器此刻在 body 上的配色。 */
			function currentScheme() {
				try {
					return doc.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
				} catch (error) {
					return "light";
				}
			}

		/**
		 * 重发布面板材质：先决定每个面板的磨砂住在哪（唯一有测量的一步），再发布 CSS
		 * 读的每个变量。启动、每次面板变化、每次心情提交、每次配色翻转时调用，所以
		 * 变量永远是当前的事实，而不是启动那一刻的快照。
		 */
		function syncPanels() {
			if (disposed) return;

			var style = doc.body.style;
			var scheme = currentScheme();
			var moodNow = mood === null ? "idle" : mood;
			var wallpaperOn = hasWallpaperConfig(wallpaper);
			doc.body.dataset.glassPanels = "on";
			doc.body.dataset.glassGap = panels.gap > 0 ? "on" : "off";
			doc.body.dataset.glassPress = panels.press ? "on" : "off";
			for (var bk = 0; bk < PANEL_KEYS.length; bk++) aimBlur(PANEL_KEYS[bk]);
			style.setProperty("--gm-gap", panels.gap + "px");
				style.setProperty("--gm-frame-radius", panels.frameRadius + "px");
				style.setProperty("--gm-radius", panels.panelRadius + "px");
				style.setProperty("--gm-refract", panels.refraction ? "url(#" + REFRACTION_ID + "-filter)" : "none");
			// 磨砂别的什么都不跟这个开关走。它过去在开关开着时把模糊缩小——一次真实的取舍
			// （位移需要结构，而模糊吃结构）——但在 19px 时它拿走的 14% 当成折射看不见、
			// 当成"面板变更糊了"倒是清清楚楚，而这个旋钮最不该看起来像的就是后者。
			// 一个开关管内容衍生的颜色：它同时驱动窗格和镜边。
			// 心情自己的槽提前读：一次切换不该花四秒钟穿着上一条片子的颜色。
				var spillSample = panels.rimSpill === true ? sampleFor(moodNow === "work" ? "work" : "idle") : null;
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var panel = panels[key];
					style.setProperty("--gm-panel-" + key + "-blur", panel.blur + "px");
					style.setProperty("--gm-panel-" + key + "-sheen", String(panel.sheen));
					var fill = panelFill(key, scheme, panels, wallpaper.clarity, wallpaperOn, moodNow, spillSample, prefers.reducedTransparency);
					style.setProperty("--gm-panel-" + key + "-fill", fill);
				// 有效 alpha 就是设置行打印的东西，所以滑杆即使在跟随调色板时也永远显示事实。
					panelAlphaCache[key] = effectiveAlpha(fill);
					style.setProperty("--gm-panel-" + key + "-alpha", String(panelAlphaCache[key]));
				/* 一块近透明的窗格没有玻璃可供光捕捉，然而镜边——一条沿每边、宽
				   `--gm-rim-band`、带 `border-radius: inherit` 的渐变——仍以全强度画着。
				   alpha 为 0 时它是屏幕上剩下的唯一东西，而因为带子有自己的圆角末端，它读起来
				   是第一块里面嵌着第二块：报上来的"左边两个角"。边缘光属于玻璃；它随填充
				   一起淡。超过 12% 玻璃就在那儿承它，所以什么都不变。 */
				/* 线性，而且真的到零。早先的版本把它兜在 0.15，而那不是"什么都没有"：
				   镜边的边缘线是 `inset 0 0 0 1px`——一道 1px inset 阴影，内半径 12-1=11
				   对着玻璃的 12，于是两道同心弧相距 1px。这样一根发丝在浅色窗格上 5% 的不
				   透明度下仍然读得出来，这就是幸存下来的"角里面还有一道弧"。没有玻璃，就没有
				   边缘光。 */
					var rimWeight = panelAlphaCache[key] >= 0.12 ? 1 : Math.max(0, panelAlphaCache[key] / 0.12);
					style.setProperty("--gm-panel-" + key + "-rim", String(Math.round(rimWeight * 1000) / 1000));
				// 镜边的接触阴影把高光旋钮的分量带到面板外面，那里白表面上的一道白头发读不出来。
					var contact = Math.round((scheme === "dark" ? 0.44 : 0.22) * panel.sheen * (moodNow === "work" ? 1.15 : 0.9) * 1000) / 1000;
				/* 扩散过去是一个死的 -14px，而负扩散会缩小阴影的形状——圆角跟着缩。面板
				   12px 时有效半径是 max(0, 12-14)=0，所以这条注释想要在面板外面的阴影，事实上
				   是一个坐在面板里面的方块。透过这么一块透明的窗格，那不是一层柔光，是角上一个
				   硬的直角阴影。扩散现在跟着半径走，阴影保住卡的形状。 */
					style.setProperty(
						"--gm-panel-" + key + "-shadow",
						"0 10px 28px calc(var(--gm-radius, 20px) * -0.35) rgba(" + (scheme === "dark" ? "0,0,0" : "84,94,124") + "," + contact + ")"
					);
				}
				var rim = panelRim(moodNow, scheme, spillSample);
				style.setProperty("--gm-rim-a", rim.a);
				style.setProperty("--gm-rim-b", rim.b);
				style.setProperty("--gm-rim-c", rim.c);
				style.setProperty("--gm-rim-edge", rim.edge);
			style.setProperty("--gm-rim-ao", rim.ao);
			style.setProperty("--gm-rim-contact", rim.contact);
		// 边缘开关必须改变边缘。它过去只缩放磨砂模糊，这就是它读起来像模糊控件的原因：
		// 镜边现在收紧成一道透镜边（更亮更宽的高光、色散显露），或放松回一道软发丝。
			var refracting = panels.refraction === true;
			style.setProperty("--gm-rim-band", refracting ? rim.band : rim.softBand);
			style.setProperty("--gm-rim-disp", refracting ? rim.disp : "transparent");
			style.setProperty("--gm-rim-warm", refracting ? rim.warm : "transparent");
			style.setProperty("--gm-sheen-edge", refracting ? "1.15" : "0.82");
			style.setProperty("--gm-rim-catch", rim.catch);
			style.setProperty("--gm-rim-shade", rim.shade);
			style.setProperty("--gm-divider", rim.divider(panels.divider));
			
}

		

	/**
	 * 一个子树里是否住着 `position: fixed` 的元素。带着 backdrop-filter 的元素会成为
	 * 恰好这些后代的包含块，所以这是唯一一种磨砂必须留在伪元素上（它没有后代）而不是
	 * 元素上的条件。
	 * @param node - 子树根。
	 * @returns 有 fixed 后代时为 true，问不了浏览器时（保守答案）同为 true。
	 */
		function hasFixedDescendant(node) {
			return fixedDescendants(node).length > 0;
		}

	/**
	 * 指名 fixed 后代，而不只是数数：把模糊放到一个元素上，重新锚定的正是这些，所以
	 * 其中哪一个一旦被移位，报告必须说出是哪一个。
	 * @param node - 子树根。
	 * @returns 至多两个 `tag.class` 标签；答不了时为 ["(unknown)"]。
	 */
		function fixedDescendants(node) {
				var read = win !== undefined && win !== null && typeof win.getComputedStyle === "function" ? win.getComputedStyle : null;
				if (read === null || node === null || node === undefined || typeof node.querySelectorAll !== "function") return ["(unknown)"];
				var all = null;
				try { all = node.querySelectorAll("*"); } catch (error) { all = null; }
				if (all === null || all === undefined) return ["(unknown)"];
				var found = [];
				var limit = all.length < 400 ? all.length : 400;
				for (var i = 0; i < limit && found.length < 2; i++) {
					var style = null;
					try { style = read.call(win, all[i]); } catch (error) { style = null; }
					if (style === null || style === undefined || String(style.position ?? "") !== "fixed") continue;
					found.push((typeof all[i].tagName === "string" ? all[i].tagName.toLowerCase() : "?") + "." + String(all[i].getAttribute === undefined ? "" : (all[i].getAttribute("class") ?? "")));
				}
				return found;
			}

		/**
		 * 列出一个节点的每个形成背景根的祖先。backdrop-filter 只能看见画在它自己根内部
		 * 的东西，所以一个带着 `contain: paint`、filter、不透明度、隔离、遮罩或混合模式的
		 * 祖先，会给磨砂留下什么都没得可糊——这是计算出的 `backdrop-filter` 值自己揭示不了
		 * 的唯一一种失败。
		 * @param node - 磨砂寄宿的那个元素。
		 * @returns 一串 `tag.class: property=value` 条目，最近的在前。
		 */
		function backdropRoots(node) {
				var found = [];
				var read = win !== undefined && win !== null && typeof win.getComputedStyle === "function" ? win.getComputedStyle : null;
				if (read === null) return found;
				var walk = node;
				var guard = 0;
				while (walk !== null && walk !== undefined && guard < 24) {
					guard += 1;
					var style = null;
					try { style = read.call(win, walk); } catch (error) { style = null; }
					if (style !== null && style !== undefined) {
						var contain = String(style.contain ?? "");
						var opacity = Number(style.opacity);
						var traits = [];
						if (/paint|strict|content/.test(contain)) traits.push("contain=" + contain);
						if (String(style.filter ?? "none") !== "none") traits.push("filter=" + style.filter);
						if (Number.isFinite(opacity) && opacity < 1) traits.push("opacity=" + opacity);
						if (String(style.isolation ?? "") === "isolate") traits.push("isolation=isolate");
						if (String(style.maskImage ?? "none") !== "none") traits.push("mask=" + style.maskImage);
						if (String(style.clipPath ?? "none") !== "none") traits.push("clip-path=" + style.clipPath);
						if (String(style.mixBlendMode ?? "normal") !== "normal") traits.push("mix-blend-mode=" + style.mixBlendMode);
						if (traits.length > 0) {
							var label = (typeof walk.tagName === "string" ? walk.tagName.toLowerCase() : "?") + "." + String(walk.getAttribute === undefined ? "" : (walk.getAttribute("class") ?? ""));
							found.push(label + ": " + traits.join(", "));
						}
					}
					walk = walk.parentElement !== undefined ? walk.parentElement : walk.parent;
				}
				return found;
			}

		/** @returns 一个计算出的 rgba() 颜色的 alpha，供设置行读数。 */
		function effectiveAlpha(color) {
				var match = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/.exec(color);
				return match === null ? 1 : Math.round(Number(match[1]) * 1000) / 1000;
			}

			/**
			 * 合并一个面板补丁，持久化，重绘。
			 * @param patch - 部分面板配置。
			 * @returns 结果配置。
			 */
			function setPanels(patch) {
				var merged = panelConfig();
				var given = patch === undefined || patch === null ? {} : patch;
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					if (given[key] === undefined || given[key] === null) continue;
					merged[key] = {
						opacity: given[key].opacity !== undefined ? given[key].opacity : merged[key].opacity,
						blur: given[key].blur !== undefined ? given[key].blur : merged[key].blur,
						sheen: given[key].sheen !== undefined ? given[key].sheen : merged[key].sheen
					};
				}
				if (given.gap !== undefined) merged.gap = given.gap;
				if (given.frameRadius !== undefined) merged.frameRadius = given.frameRadius;
				if (given.panelRadius !== undefined) merged.panelRadius = given.panelRadius;
				if (given.divider !== undefined) merged.divider = given.divider;
				if (given.refraction !== undefined) merged.refraction = given.refraction;
				if (given.rimSpill !== undefined) merged.rimSpill = given.rimSpill;
				if (given.press !== undefined) merged.press = given.press;
			if (given.blurFallback !== undefined) merged.blurFallback = given.blurFallback;
			if (given.fixedGuard !== undefined) merged.fixedGuard = given.fixedGuard;
			panels = normalizePanels(merged);
				writeKey(PANEL_KEY, JSON.stringify(panels));
				tagPanels(true);
				syncPanels();
				announcePanels();
				return panelConfig();
			}

			/** 恢复持久化的面板配置，然后发布它。 */
			function restorePanels() {
				var raw = readKey(PANEL_KEY);
				if (raw !== null && raw !== "") {
					var parsed = null;
					try { parsed = JSON.parse(raw); } catch (error) { parsed = null; }
					if (parsed !== null) panels = normalizePanels(parsed);
				}
				tagPanels();
				syncPanels();
				announcePanels();
				return panelConfig();
			}

			/** 本插件活着期间，挂上共享的边缘折射滤波器。 */
			function mountRefraction() {
				if (refractionMounted) return;
				var host = doc.createElement("div");
				host.setAttribute("data-glass-refraction", "");
				host.innerHTML = REFRACTION_SVG;
				doc.body.appendChild(host);
				refractionMounted = true;
			}
			//#endregion

		/** 挂载本插件拥有的一切。@returns 清理器。 */
		function start() {
			if (started) return function () {};
			started = true;

			readPreferences();
			watchPreferences();
			// 绝不在上一个实例之上搭建。
			sweepOrphans();
				var style = doc.createElement("style");
				style.id = STYLE_ID;
				style.setAttribute("data-plugin", PLUGIN_ID);
				style.textContent = CSS;
				doc.head.appendChild(style);

				var stage = doc.createElement("div");
				stage.id = STAGE_ID;
				stage.setAttribute("aria-hidden", "true");
				stage.setAttribute("data-plugin", PLUGIN_ID);
				// 两条片子 upfront 挂载：一次心情切换是交叉淡变，从来不是加载。
				for (var v = 0; v < SLOTS.length; v++) {
					var video = doc.createElement("video");
					video.setAttribute("data-glass-clip", "none");
					video.setAttribute("data-glass-slot", SLOTS[v]);
					video.setAttribute("aria-hidden", "true");
					stage.appendChild(video);
					videos[SLOTS[v]] = video;
				}
			// `dim` 刻意最后追加：它是罩在整个媒体栈上的一层可读性遮挡，正如 Apple 为
			// 明亮媒体上的玻璃所规定。
				var layers = ["idle", "work", "pulse", "dim"];
				for (var i = 0; i < layers.length; i++) {
					var layer = doc.createElement("div");
					layer.setAttribute("data-glass-layer", layers[i]);
					stage.appendChild(layer);
				}
				stageHost().host.appendChild(stage);
			ensureStageHost();
				doc.body.dataset.glassBlur = readKey(NOBLUR_KEY) === "1" ? "off" : "on";

			commit(desiredMood());
			subscribe();
		// 后台标签页既不养时钟，也不养解码器。
		watchVisibility();
		watchColumns();
			// 面板材质是主题的一部分，不是一个模式：随引擎挂载，并在外壳重建列时
			// 重新找列。
			mountRefraction();
			restorePanels();
			tagBigSurfaces();
		ensureStageHost();
		startRetag();
			// 即使什么都没配置，也发布一次壁纸变量，好让舞台、CSS 默认值和设置行
			// 永远一致。
				renderWallpaper();
				restoreWallpaper();


			win.__dshGlassMood = {
				/** @returns 当前画着的心情。 */
				current: function () { return mood; },
				/** 钉住一个心情（'idle' | 'work'），或用 '' 清掉钉——立刻生效。 */
				force: function (value) {
					try {
						if (value === "idle" || value === "work") storage.setItem(FORCE_KEY, value);
						else storage.removeItem(FORCE_KEY);
					} catch (error) { /* 存储不可用：钉就是不持久化而已 */ }
					commit(desiredMood());
				},
				/** 立刻重读活动（一次手动轮询）。 */
				refresh: evaluate,
				/** 活的壁纸配置。 */
				wallpaper: videoConfig,
				/** 合并一个壁纸配置补丁，例如 { slot: 'work', url } 或 { clarity: 1 }。 */
				setWallpaper: setWallpaper,
				/** 装一个选中的文件：__dshGlassMood.setFile(file, file.name, 'work')。 */
				setFile: setWallpaperFile,
				/** 移除一个槽（`'idle'` / `'work'`）或两个。 */
				clearWallpaper: clearWallpaper,
				/** 活的面板材质配置。 */
				panels: panelConfig,
				/** 找到了哪些外壳列，连同配置。 */
				panelStatus: panelStatus,
				/** 合并一个面板补丁，例如 { main: { blur: 24 }, gap: 0 }。 */
				setPanels: setPanels,
				/** 重新找外壳列（布局变化后）。 */
				retag: tagPanels
			};

				return shutdown;
			}

		/**
		 * 撤掉本引擎做过的一切：计时器、订阅、钩子、变量、样式表和舞台。这也是那个
		 * 急停开关，因为一个能藏起部分 app 的主题，必须能在不知道为什么的情况下被移除：
		 * `__dshGlassMood.off()`。
		 */
		function shutdown() {
					disposed = true;
					for (var pl = 0; pl < preferenceLists.length; pl++) {
						if (typeof preferenceLists[pl].removeEventListener === "function") preferenceLists[pl].removeEventListener("change", applyPreferences);
					}
					preferenceLists = [];
					cancelPending();
					if (fadeTimer !== 0) {
						clearTimer(fadeTimer);
						fadeTimer = 0;
					}
					unwatchVisibility();
					unwatchColumns();
					if (resizeTimer !== 0) {
						clearTimer(resizeTimer);
						resizeTimer = 0;
					}
					stopRetag();
					if (parkTimer !== 0) {
						clearTimer(parkTimer);
						parkTimer = 0;
					}
					stopPolling();
				for (var u = 0; u < unsubscribes.length; u++) {
					try { unsubscribes[u](); } catch (error) { /* 一个死掉的数据源已经释放了 */ }
				}
					unsubscribes.length = 0;
					if (layerDispose !== null) {
						try { layerDispose(); } catch (error) { /* the registry may already be gone */ }
						layerDispose = null;
					}
			for (var s = 0; s < SLOTS.length; s++) {
				var video = videos[SLOTS[s]];
				if (video !== undefined && video !== null) {
					try { video.pause(); } catch (error) { /* 从未启动 */ }
					video.removeAttribute("src");
				// 只去掉属性，解码器和缓冲还活着；`load()` 才是真正释放它们的调用。对象
				// URL 跟在它后面，否则重置没有东西可读。
					if (typeof video.load === "function") {
						try { video.load(); } catch (error) { /* 没有源可重置 */ }
					}
				}
				releaseClipUrl(SLOTS[s]);
			}
					videos = {};
					wallpaperListeners.length = 0;
					panelListeners.length = 0;
					var tagged = doc.querySelectorAll("[data-glass-panel]");
					for (var t = 0; t < tagged.length; t++) tagged[t].removeAttribute("data-glass-panel");
					var surfaces = doc.querySelectorAll("[data-glass-surface]");
					for (var sf = 0; sf < surfaces.length; sf++) surfaces[sf].removeAttribute("data-glass-surface");
					panelNodes = { left: null, main: null, right: null };
					panelSurfaces = { left: null, main: null, right: null };
					panelHollow = { left: null, main: null, right: null };
					panelDiag = { left: [], main: [], right: [] };
					panelBlurHost = { left: null, main: null, right: null };
					panelBlurNote = { left: [], main: [], right: [] };
					for (var df = 0; df < tagged.length; df++) tagged[df].removeAttribute("data-glass-delegate");
					var hollowed = doc.querySelectorAll("[data-glass-hollow]");
					for (var hl = 0; hl < hollowed.length; hl++) hollowed[hl].removeAttribute("data-glass-hollow");
					var blurHosts = doc.querySelectorAll("[data-glass-blur-host]");
					for (var bh = 0; bh < blurHosts.length; bh++) blurHosts[bh].removeAttribute("data-glass-blur-host");
					var frosted = doc.querySelectorAll("[data-glass-frost]");
					for (var fr = 0; fr < frosted.length; fr++) frosted[fr].removeAttribute("data-glass-frost");
					var frameNode = doc.querySelector("[data-glass-frame]");
					if (frameNode !== null && frameNode !== undefined) frameNode.removeAttribute("data-glass-frame");
					var refraction = doc.querySelector("[data-glass-refraction]");
					if (refraction !== null && refraction !== undefined) refraction.remove();
					refractionMounted = false;
					for (var p = 0; p < PANEL_KEYS.length; p++) {
						doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-blur");
						doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-sheen");
						doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-fill");
						doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-alpha");
						doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-shadow");
					}
					["--gm-gap", "--gm-frame-radius", "--gm-radius", "--gm-refract", "--gm-rim-a", "--gm-rim-b", "--gm-rim-c", "--gm-rim-edge", "--gm-rim-ao", "--gm-rim-contact", "--gm-rim-disp", "--gm-rim-warm", "--gm-rim-catch", "--gm-rim-shade", "--gm-rim-band", "--gm-sheen-edge", "--gm-divider"].forEach(function (name) {
						doc.body.style.removeProperty(name);
					});
					doc.body.style.removeProperty("--gm-media-dim");
					delete doc.body.dataset.glassPanels;
					delete doc.body.dataset.glassGap;
					var mounted = doc.getElementById(STAGE_ID);
					if (mounted !== null) mounted.remove();
					var sheet = doc.getElementById(STYLE_ID);
					if (sheet !== null) sheet.remove();
					delete doc.body.dataset.glassMood;
					delete doc.body.dataset.glassBlur;
					delete doc.body.dataset.glassFading;
					delete doc.body.dataset.glassWallpaper;
					delete doc.body.dataset.glassPress;
					delete doc.body.dataset.glassTransparency;
					delete doc.body.dataset.glassContrast;
					delete doc.body.dataset.glassSelftest;
					doc.body.style.removeProperty("--gm-wall-fit");
					doc.body.style.removeProperty("--gm-wall-opacity");
					doc.body.style.removeProperty("--gm-wall-blur");
					doc.body.style.removeProperty("--gm-wall-scale");
					doc.body.style.removeProperty("--gm-tint");
					if (win.__dshGlassMood !== undefined) delete win.__dshGlassMood;
				// 一条统一的清理路径，兼顾"卸载"和"留下的流浪物"：sweep 也会抓住未来的层
				// 加进来的任何东西。
					sweepOrphans();
					started = false;
					mood = null;
				}

			return {
				start: start,
				evaluate: evaluate,
				readActivity: readActivity,
				getWallpaper: videoConfig,
				setWallpaper: setWallpaper,
				setWallpaperFile: setWallpaperFile,
				clearWallpaper: clearWallpaper,
				getPanels: panelConfig,
			/**
			 * 一个面板此刻作画的 alpha。自动模式下这是调色板自己的 alpha（按可见度
			 * 预算削薄后的），这正是设置行必须显示、而不是那个 -1 哨兵的东西。
			 * @param key - 面板键。
			 * @returns 0..1。
			 */
				panelOpacity: function (key) {
					return panelAlphaCache[key] === undefined ? 0 : panelAlphaCache[key];
				},
				setPanels: setPanels,
				panelStatus: panelStatus,
				retag: tagPanels,
			/** 布局变化后，重新探测内层表面。 */
			probe: discoverSurfaces,
			/** 重新扫描值得上磨砂的页面级表面。 */
			tagBigSurfaces: tagBigSurfaces,
			/** 每个面板计算出的 backdrop-filter：模糊诊断。 */
			blurReport: blurReport,
			/** 显示或隐藏让模糊可见的棋盘格。 */
			checker: checker,
			/**
			 * 片子最后一次读成了什么，以及它挣得的那层压暗。`ready` 为 false 意味着
			 * 什么都没读到（没有片子，或一条跨源片子）。
			 * @returns 取样器状态。
			 */
				media: function () {
					var sample = sampleFor(activeSlot());
					return {
						ready: sample.ready,
						brightness: Math.round(sample.brightness * 1000) / 1000,
						hue: sample.hue === null ? null : Math.round(sample.hue),
						saturation: Math.round(sample.saturation * 1000) / 1000,
						dim: sample.dim
					};
				},
			/** 两个槽上一次的读数，供调试溢出的人用。 */
			mediaSlots: function () {
				return { idle: sampleFor("idle"), work: sampleFor("work") };
			},
			/** 急停开关：本会话内丢掉每个钩子和样式表。 */
			off: shutdown,
			/** 清掉一次流浪挂载留在 DOM 里的任何东西，不卸载。 */
			sweep: sweepOrphans,
			/**
			 * 每面板一行，解释磨砂如何寄宿，给一个打不开控制台的人。
			 * @returns 一段简短的人类可读摘要。
			 */
			blurSummary: function () {
					var lines = [];
					for (var i = 0; i < PANEL_KEYS.length; i++) {
						var key = PANEL_KEYS[i];
					var label = key === "left" ? "左侧栏" : (key === "main" ? "主面板" : "右侧栏");
					var host = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : panelNodes[key];
					if (host === null || host === undefined) {
						lines.push(label + "：未识别");
						continue;
					}
						var asked = doc.body.style.getPropertyValue("--gm-panel-" + key + "-blur");
						var fill = doc.body.style.getPropertyValue("--gm-panel-" + key + "-fill");
						var alpha = fill === "" ? "?" : String(effectiveAlpha(fill));
						var read = win !== undefined && win !== null && typeof win.getComputedStyle === "function" ? win.getComputedStyle : null;
						var computed = "?";
						var pseudo = "?";
						if (read !== null) {
							try { computed = String(read.call(win, host).backdropFilter ?? "none"); } catch (error) { computed = "?"; }
							try { pseudo = String(read.call(win, host, "::before").backdropFilter ?? "none"); } catch (error) { pseudo = "?"; }
						}
					var where = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? "内层元素" : "列自身";
					var why = panelDiag[key].length === 0 ? "" : "，原因：" + panelDiag[key][0];
					var arrangement = panelBlurHost[key] === "element" ? "元素自身" : "伪元素";
					if (panelBlurNote[key].length > 0) arrangement = arrangement + "（" + panelBlurNote[key][0] + "）";
					lines.push(label + "：材质在" + where + "，模糊挂在" + arrangement + "，值 " + (asked === "" ? "?" : asked) +
						"（元素计算值 " + computed + "，::before " + pseudo + "），面板 alpha " + alpha + why);
					}
					return lines;
				},
		/** 诊断构建发的那份 DOM 报告；也可按需读取。 */
		domReport: domReport,
		/** 立刻发一份（右栏展开时由设置行使用）。 */
		postReport: function () { postDomReport("manual"); return reportPosts; },
		/** 设置行打印的构建号。 */
			build: function () { return BUILD; },
			/**
			 * 布局此刻量出来什么，为展开的右栏。材质必须落在一个跨满这个模式的元素上，
			 * 所以这里把列和真正持有材质的元素并排报出来。
			 * @returns 展开标志，加每面板一行可读文字。
			 */
				layoutReport: function () {
					var expanded = rightbarExpanded();
					var lines = [];
					if (expanded !== true) return { expanded: false, lines: lines };
					lines.push("已展开右栏：列只保留原轨道，材质应挂在全屏层上");
					for (var i = 0; i < PANEL_KEYS.length; i++) {
						var key = PANEL_KEYS[i];
						var label = key === "left" ? "左侧栏" : (key === "main" ? "主面板" : "右侧栏");
						var column = panelNodes[key];
						if (column === null || column === undefined) { lines.push(label + "：未识别"); continue; }
						var host = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : column;
						var columnBox = typeof column.getBoundingClientRect === "function" ? column.getBoundingClientRect() : null;
						var hostBox = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : null;
						var width = function (box) { return box === null || box === undefined ? "?" : Math.round(box.width); };
						var left = function (box) { return box === null || box === undefined ? "?" : Math.round(box.left); };
						var where = host.getAttribute !== undefined && host.getAttribute("data-glass-fullscreen") !== undefined
							? "全屏层"
							: (panelSurfaces[key] !== null && panelSurfaces[key] !== undefined
								? (typeof host.tagName === "string" ? host.tagName.toLowerCase() : "?") + "." + String(host.getAttribute === undefined ? "" : (host.getAttribute("class") ?? ""))
								: "列自身");
						var fill = doc.body.style.getPropertyValue("--gm-panel-" + key + "-fill");
						var asked = doc.body.style.getPropertyValue("--gm-panel-" + key + "-blur");
						lines.push(label + "：列 x=" + left(columnBox) + " 宽 " + width(columnBox) +
							"；材质在 " + where + " x=" + left(hostBox) + " 宽 " + width(hostBox) +
							"；alpha " + (fill === "" ? "?" : String(effectiveAlpha(fill))) +
							"；模糊 " + (asked === "" ? "?" : asked) +
							"；宿主=" + (panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? "内层" : "列") +
							(panelBlurHost[key] === "element" ? "（模糊在元素上）" : "（模糊在伪元素上）"));
					}
					return { expanded: true, lines: lines };
				},
			/** 本主题应答的两个无障碍偏好。 */
			preferences: function () {
				return { reducedTransparency: prefers.reducedTransparency, moreContrast: prefers.moreContrast };
			},
			/** 立刻重读它们（一次系统变化可以按需捡起）。 */
			refreshPreferences: applyPreferences,
			/** 注册一个壁纸变化监听者；返回取消订阅函数。 */
			subscribeWallpaper: function (listener) {
				wallpaperListeners.push(listener);
				return function () {
					wallpaperListeners = wallpaperListeners.filter(function (entry) { return entry !== listener; });
				};
			},
			/** 注册一个面板变化监听者；返回取消订阅函数。 */
			subscribePanels: function (listener) {
					panelListeners.push(listener);
					return function () {
						panelListeners = panelListeners.filter(function (entry) { return entry !== listener; });
					};
				}
			};
		}
		//#endregion

			//#region settings row
	/**
	 * 一个带数字读数的滑杆。每个旋钮都打印它的值，因为"拖到看着对"不是一个设置——
	 * 尤其像不透明度和半径这种眼睛报不出数字的值。
	 * @param value - 当前值。
	 * @param step - 滑杆步长；决定打印精度。
	 * @returns 显示字符串。
	 */
	function formatValue(value, step, unit) {
			var number = Number(value);
			if (!Number.isFinite(number)) return "";
			var text = step >= 1 ? String(Math.round(number)) : number.toFixed(2);
			return unit === undefined || unit === null || unit === "" ? text : text + unit;
		}
	/**
	 * 壁纸偏好行，给通用设置区。
	 *
	 * `settings.general.item` 不传 owner props、不投射标签，所以这一行拥有自己的拷贝、
	 * 状态和写入路径：它渲染控件，并直接和引擎（同一模块闭包）对话。React 从外壳取，
	 * 取不到时这一行被跳过。
	 * @param React - 外壳的 React 命名空间。
	 * @param engine - 活的引擎。
	 * @returns 一个行组件。
	 */
		function createWallpaperRow(React, engine) {
			var h = React.createElement;
			var useState = React.useState;
			var useEffect = React.useEffect;
			var useRef = React.useRef;
			var FRAME_OPTIONS = [
				{ value: "cover", label: "裁切铺满" },
				{ value: "contain", label: "完整显示" },
				{ value: "fill", label: "拉伸铺满" }
			];
			var SLOT_LABELS = { idle: "空闲", work: "工作" };

			return function GlassMoodWallpaperRow() {
				var state = useState(engine.getWallpaper());
				var config = state[0];
				var setConfig = state[1];
				var draft = useState({ idle: config.clips.idle.url, work: config.clips.work.url });
				var drafts = draft[0];
				var setDrafts = draft[1];
				var files = { idle: useRef(null), work: useRef(null) };

				useEffect(function () {
					return engine.subscribeWallpaper(function (next) {
						setConfig(next);
						setDrafts({ idle: next.clips.idle.url, work: next.clips.work.url });
					});
				}, []);

			// 从事件值提交，绝不从渲染出的状态：触发提交的那次敲键，可能比这个闭包更新。
			var commitUrl = function (slot, value) {
					var next = String(value === undefined || value === null ? "" : value).trim();
					setDrafts(function (current) {
						var merged = { idle: current.idle, work: current.work };
						merged[slot] = next;
						return merged;
					});
					setConfig(engine.setWallpaper({ slot: slot, url: next }));
				};
			// 一次读不到字段值的提交，什么都不做，而不是清掉一个正在工作的壁纸。
			var fieldValue = function (event) {
					if (event === undefined || event === null) return null;
					var target = event.target;
					return target !== undefined && target !== null && typeof target.value === "string" ? target.value : null;
				};
				var onKey = function (slot, event) {
					if (event === undefined || event === null || event.key !== "Enter") return;
					var value = fieldValue(event);
					if (value !== null) commitUrl(slot, value);
				};
				var onBlur = function (slot, event) {
					var value = fieldValue(event);
					if (value !== null) commitUrl(slot, value);
				};

				var clipRow = function (slot) {
					var clip = config.clips[slot];
					var other = slot === "idle" ? config.clips.work : config.clips.idle;
					var note = clip.source === "file"
						? (clip.name === "" ? "本地文件" : clip.name)
						: clip.source === "url" ? "链接" : (other.source === "" ? "未设置" : "未设置（沿用另一状态）");
					return h("div", { className: "gm-clip", key: slot },
						h("span", { className: "gm-clip-label" }, SLOT_LABELS[slot]),
						h("input", {
							className: "gm-input",
							type: "text",
							value: drafts[slot],
							placeholder: "mp4 / webm 链接，回车应用",
							onChange: function (event) {
								var value = event.target.value;
								setDrafts(function (current) {
									var merged = { idle: current.idle, work: current.work };
									merged[slot] = value;
									return merged;
								});
							},
							onKeyDown: function (event) { onKey(slot, event); },
							onBlur: function (event) { onBlur(slot, event); }
						}),
						h("button", { className: "gm-btn", type: "button", onClick: function () { if (files[slot].current !== null) files[slot].current.click(); } }, "选择文件"),
						h("button", {
							className: "gm-btn",
							type: "button",
							disabled: clip.source === "",
							onClick: function () { engine.clearWallpaper(slot).then(setConfig); }
						}, "清除"),
						h("span", { className: "gm-row-hint" }, note),
						h("input", {
							ref: files[slot],
							type: "file",
							accept: "video/mp4,video/webm,video/*",
							style: { display: "none" },
							onChange: function (event) {
								var file = event.target.files !== undefined && event.target.files !== null ? event.target.files[0] : undefined;
								event.target.value = "";
								if (file === undefined || file === null) return;
							if (file.size > VIDEO_WARN_BYTES) {
								try { win.console.warn("[glass-mood] 壁纸文件较大（" + Math.round(file.size / 1048576) + "MB），写入浏览器存储可能较慢"); } catch (error) { /* 没有控制台 */ }
							}
								engine.setWallpaperFile(file, file.name, slot).then(setConfig);
							}
						})
					);
				};

				var knob = function (label, value, min, max, step, unit, onInput) {
					return h("label", { className: "gm-field", key: label }, label,
						h("input", {
							type: "range", min: min, max: max, step: step, value: value,
							onChange: function (event) { onInput(Number(event.target.value)); }
						}),
						h("span", { className: "gm-val" }, formatValue(value, step, unit))
					);
				};

				return h("div", { className: "gm-row" },
					h("div", null,
						h("div", { className: "gm-row-title" }, "玻璃主题 · 动态壁纸"),
						h("div", { className: "gm-row-hint" }, "两个状态可各用一段视频，切换时交叉淡入；可见度是唯一的“看得清”旋钮（它同时调整视频强度与面板通透度）")
					),
					clipRow("idle"),
					clipRow("work"),
					h("div", { className: "gm-fields" },
						h("label", { className: "gm-field" }, "适配",
							h("select", {
								value: config.fit,
								onChange: function (event) { setConfig(engine.setWallpaper({ fit: event.target.value })); }
							}, FRAME_OPTIONS.map(function (option) {
								return h("option", { key: option.value, value: option.value }, option.label);
							}))
						),
						knob("壁纸可见度", config.clarity, 0, 1, 0.05, "", function (value) { setConfig(engine.setWallpaper({ visibility: value })) }),
						knob("模糊", config.blur, 0, 32, 1, "px", function (value) { setConfig(engine.setWallpaper({ blur: value })) }),
						knob("情绪染色", config.tint, 0, 0.9, 0.05, "", function (value) { setConfig(engine.setWallpaper({ tint: value })) }),
					// 这么亮的片子挣得一层可读性遮挡（封顶 35%）；开关放在这儿，好让它
					// 被当场判断、当场关掉。
						h("label", { className: "gm-field" }, "背景亮度暗化",
							h("input", {
								type: "checkbox", checked: config.autoDim !== false,
								onChange: function (event) { setConfig(engine.setWallpaper({ autoDim: event.target.checked })) }
							})
						)
					)
				);
			};
		}

	/**
	 * 在设置槽和 React 都可用时，贡献壁纸那一行。这一行是附加的，从不替换一个自带
	 * 单元格（`id` 是我们自己的）。
	 * @param ctx - 客户端 context。
	 * @param engine - 活的引擎。
	 */
	function registerWallpaperRow(ctx, engine) {
			var slots = getService(ctx, "slots");
			if (slots === undefined || slots === null || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
			var React = null;
			try { React = require("react"); } catch (error) { React = null; }
			if (React === null || React === undefined || typeof React.createElement !== "function") return;
			var Row = createWallpaperRow(React, engine);
		// `transcript-view` 占 12、`developer-tools` 占 15：13 坐在两者之间，
		// 紧跟自带的 Appearance 和字号两行。
			slots.inject("settings.general.item", function () {
				return slots.register({ name: "settings.general.item", id: "glass-mood-wallpaper", order: 13 }, Row);
			});
		}
		//#endregion

	/**
	 * 面板材质与光线那一行，给通用设置区。
	 *
	 * 和壁纸那一行同一份契约：没有 owner props、没有投射标签，所以这一行拥有自己的
	 * 拷贝、状态和写入路径。每个控件写引擎面板配置的一个字段。
	 * @param React - 外壳的 React 命名空间。
	 * @param engine - 活的引擎。
	 * @returns 一个行组件。
	 */
	function createPanelsRow(React, engine) {
			var h = React.createElement;
			var useState = React.useState;
			var useEffect = React.useEffect;
			var PANEL_LABELS = { left: "左侧边栏", main: "主界面", right: "右侧边栏" };
			var FOUND_LABELS = { left: "左", main: "主", right: "右" };

			return function GlassMoodPanelsRow() {
				var state = useState(engine.getPanels());
				var config = state[0];
				var setConfig = state[1];
				var status = useState(engine.panelStatus().found);
				var found = status[0];
				var setFound = status[1];

			useEffect(function () {
				// 一次深度重打标签：打开这一行的时刻，就是重新探测真正画每个面板的
				// 那个元素的时刻。
				engine.retag(true);
					setFound(engine.panelStatus().found);
					return engine.subscribePanels(function (next, nextFound) {
						setConfig(next);
						setFound(nextFound);
					});
				}, []);

				var knob = function (label, value, min, max, step, unit, onInput) {
					return h("label", { className: "gm-field", key: label }, label,
						h("input", {
							type: "range", min: min, max: max, step: step, value: value,
							onChange: function (event) { onInput(Number(event.target.value)); }
						}),
						h("span", { className: "gm-val" }, formatValue(value, step, unit))
					);
				};
				var panelLine = function (key) {
					var panel = config[key];
					return h("div", { className: "gm-clip", key: key },
						h("span", { className: "gm-clip-label" }, PANEL_LABELS[key]),
					// 滑杆显示的是有效 alpha，所以它的数字即使在面板跟随调色板时也和屏幕上的一致。
						knob("不透明度", engine.panelOpacity(key), 0, 1, 0.02, "", function (value) { setConfig(engine.setPanels(patch(key, { opacity: value }))) }),
						knob("模糊", panel.blur, 0, 48, 1, "px", function (value) { setConfig(engine.setPanels(patch(key, { blur: value }))) }),
						knob("高光", panel.sheen, 0, 1, 0.05, "", function (value) { setConfig(engine.setPanels(patch(key, { sheen: value }))) })
					);
				};
				var patch = function (key, fields) {
					var one = {};
					one[key] = fields;
					return one;
				};
				var toggle = function (label, value, onInput) {
					return h("label", { className: "gm-field", key: label },
						h("input", {
							type: "checkbox",
							checked: value,
							onChange: function (event) { onInput(event.target.checked); }
						}), label);
				};
				var missing = Object.keys(FOUND_LABELS).filter(function (key) { return found[key] !== true; });
				var hint = missing.length === 0
					? "透明度越低面板越薄、磨砂薄雾越明显；高光控制镜边与投影；分隔线只在「面板间隙 = 0」时可见"
					: "未识别到面板：" + missing.map(function (key) { return FOUND_LABELS[key]; }).join(" / ") + "（若界面结构变化，可在插件页反馈）";
			// 按需诊断：平时沉默，只在一个面板没被识别、或一次磨砂被迫绕着一个浮动控件
			// 摆放时才开口。
			var diagnosis = engine.blurSummary().filter(function (line) {
				return /未识别|fixed|降级/.test(line);
			});
			// 右栏展开期间，布局正是被质疑的东西，所以这一行说明它量到了什么：列、持有
			// 材质的元素，以及两者的宽度。
				var layout = engine.layoutReport();
				if (layout.expanded === true) diagnosis = diagnosis.concat(layout.lines);

				return h("div", { className: "gm-row" },
					h("div", null,
						h("div", { className: "gm-row-title" }, "玻璃主题 · 面板与光感"),
						h("div", { className: "gm-row-hint" }, hint),
					// 屏幕上是哪个构建，好让一个"没生效"的修复永远不会和一个从未加载的
					// 构建混为一谈。
					h("div", { className: "gm-row-hint" }, "版本 v" + engine.build()),
					// 模糊可能以一种任何计算值都揭示不了的方式失败，所以这一行过去会把每个
					// 面板的材质和模糊最终落在哪里打印出来。那是诊断，不是设置：它如今只在
					// 有话说的时候出现——一个它没能识别的面板，或一个磨砂被迫绕开浮动控件的
					// 面板。
						diagnosis.length > 0 ? h("div", { className: "gm-row-hint" }, "模糊挂载：" + diagnosis.join("；")) : null
					),
					panelLine("left"),
					panelLine("main"),
					panelLine("right"),
					h("div", { className: "gm-fields" },
						knob("面板间隙", config.gap, 0, 24, 1, "px", function (value) { setConfig(engine.setPanels({ gap: value })) }),
						knob("外框圆角", config.frameRadius, 0, 40, 1, "px", function (value) { setConfig(engine.setPanels({ frameRadius: value })) }),
						knob("面板圆角", config.panelRadius, 0, 32, 1, "px", function (value) { setConfig(engine.setPanels({ panelRadius: value })) }),
						knob("分隔线", config.divider, 0, 1, 0.05, "", function (value) { setConfig(engine.setPanels({ divider: value })) })
					),
					h("div", { className: "gm-fields" },
						toggle("边缘折射", config.refraction, function (value) { setConfig(engine.setPanels({ refraction: value })) }),
						toggle("内容取色", config.rimSpill !== false, function (value) { setConfig(engine.setPanels({ rimSpill: value })) }),
						toggle("按压形变", config.press !== false, function (value) { setConfig(engine.setPanels({ press: value })) })
					)
				);
			};
		}

	/**
	 * 在设置槽和 React 都可用时，贡献面板那一行。
	 * @param ctx - 客户端 context。
	 * @param engine - 活的引擎。
	 */
	function registerPanelsRow(ctx, engine) {
			var slots = getService(ctx, "slots");
			if (slots === undefined || slots === null || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
			var React = null;
			try { React = require("react"); } catch (error) { React = null; }
			if (React === null || React === undefined || typeof React.createElement !== "function") return;
			var Row = createPanelsRow(React, engine);
			slots.inject("settings.general.item", function () {
				return slots.register({ name: "settings.general.item", id: "glass-mood-panels", order: 14 }, Row);
			});
		}
	/**
	 * 客户端插件本体：在插件的整个存续期挂载情绪引擎。theme 服务是硬依赖（没有它
	 * 没什么可样式化）；活动数据源、slots 服务和 React 都是可选的，所以缺一个只会
	 * 降级，不会失败。
	 * @param ctx - 浏览器 cordis context。
	 */
	function apply(ctx) {
		if (typeof document === "undefined" || document === null || typeof window === "undefined" || window === null) return;
		var theme = getService(ctx, "theme");
		if (theme === undefined || theme === null || typeof theme.overrideTokens !== "function") return;

		// 一次热重载可能不 dispose 上一个 effect 就再次调用 apply()。先把那个实例关掉，
		// 否则它的舞台和样式表会留下，界面最终顶在两层壁纸下面。
			if (typeof window.__dshGlassMoodTeardown === "function") {
				try { window.__dshGlassMoodTeardown(); } catch (error) { /* an already-dead instance */ }
				delete window.__dshGlassMoodTeardown;
			}

			var engine = createEngine({
				document: document,
				window: window,
				theme: theme,
				ctx: ctx,
				now: function () { return Date.now(); },
				setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
				clearTimeout: function (handle) { window.clearTimeout(handle); },
				setInterval: function (fn, ms) { return window.setInterval(fn, ms); },
				clearInterval: function (handle) { window.clearInterval(handle); },
				localStorage: typeof localStorage === "undefined" ? null : localStorage,
				indexedDB: typeof indexedDB === "undefined" ? null : indexedDB,
				URL: typeof URL === "undefined" ? null : URL
			});
		ctx.effect(function () {
			var dispose = engine.start();
			window.__dshGlassMoodTeardown = dispose;
			return function () {
				dispose();
				if (window.__dshGlassMoodTeardown === dispose) delete window.__dshGlassMoodTeardown;
			};
		}, "glass-mood: mood engine");
		registerWallpaperRow(ctx, engine);
		registerPanelsRow(ctx, engine);
	}

		exports.apply = apply;
		exports.inject = ["theme"];
		exports.createEngine = createEngine;
		exports.createWallpaperRow = createWallpaperRow;
		exports.createPanelsRow = createPanelsRow;
		exports.pairFor = pairFor;
		exports.dimPair = dimPair;
		exports.dimAlpha = dimAlpha;
		exports.normalizeVideo = normalizeVideo;
		exports.normalizePanels = normalizePanels;
		exports.panelFill = panelFill;
		exports.panelRim = panelRim;
		exports.hasWallpaperConfig = hasWallpaperConfig;
		exports.TOKEN_KEYS = TOKEN_KEYS;
		exports.PALETTES = PALETTES;
		exports.VIDEO_DEFAULTS = VIDEO_DEFAULTS;
		exports.WALL_THIN = WALL_THIN;
		exports.WALL_PROTECT = WALL_PROTECT;
		exports.raiseAlpha = raiseAlpha;
		exports.boostContrast = boostContrast;
		exports.paintersIn = paintersIn;
		exports.solidifySurfaces = solidifySurfaces;
		exports.LABEL_TIERS = LABEL_TIERS;
		exports.biasTowardHue = biasTowardHue;
		exports.tintTowardHue = tintTowardHue;
		exports.hslToRgb = hslToRgb;
		exports.biasColorString = biasColorString;
		exports.brightnessOf = brightnessOf;
		exports.hueOf = hueOf;
		exports.SAMPLE_INTERVAL_MS = SAMPLE_INTERVAL_MS;
		exports.DIM_KNEE = DIM_KNEE;
		exports.DIM_MAX = DIM_MAX;
		exports.SPILL_MIX = SPILL_MIX;
		exports.SPILL_SATURATION = SPILL_SATURATION;
		exports.SPILL_MAX_LIGHTNESS = SPILL_MAX_LIGHTNESS;
		exports.SPILL_MIN_BRIGHTNESS = SPILL_MIN_BRIGHTNESS;
		exports.PANEL_DEFAULTS = PANEL_DEFAULTS;
		exports.PANEL_KEYS = PANEL_KEYS;
		exports.PANEL_SELECTOR = PANEL_SELECTOR;
		exports.REFRACTION_ID = REFRACTION_ID;
		return module.exports;
	}
});
