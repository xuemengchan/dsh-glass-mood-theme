window.__ModuleLoader__.load({
	id: "dsh-glass-mood-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		/**
		 * dsh-glass-mood-theme — browser half (single self-contained module).
		 *
		 * A Glassmorphism theme for the dsh web client whose material changes with
		 * agent activity:
		 *
		 *   idle   (nothing running)   -> pearl-white glass, airy and calm, slow fades
		 *   work   (a turn in flight)  -> steel-blue glass, crisp and decisive, fast cuts
		 *
		 * Each mood can carry its OWN MP4/WebM background clip. Both clips stay
		 * loaded and playing, so a mood switch crossfades between them instead of
		 * swapping frames; a slot with no clip falls back to the other one, and the
		 * mood wash over the video changes with it.
		 *
		 * How it is built (each rule learned from the shipped ui-theme contract and
		 * from the containment failures the mature glass themes already documented):
		 *
		 * - Colors ride the OFFICIAL theme service. `ctx.theme.overrideTokens()`
		 *   stacks one alias-token layer over whatever light/dark preference the
		 *   user picked; every value is a `{ light, dark }` pair, so a preference
		 *   flip re-resolves on its own and `theme/change` needs no listener.
		 * - A wallpaper is only visible if the theme stops covering it, so the
		 *   "clarity" knob thins the official background panes (alpha only, never
		 *   color) and fades the mood wash. Text containers keep an alpha floor:
		 *   readability is not a variable the user can accidentally delete.
		 * - Glass needs something behind it: one fixed stage sits at z-index 0 and
		 *   `#root` is lifted to z-index 1.
		 * - Blur NEVER goes on `#root` or on a column container: a non-none
		 *   backdrop-filter makes that element the containing block of every
		 *   fixed-position descendant (menus, tooltips, toasts). It rides a
		 *   `::before` pseudo with `isolation: isolate` on three verified-safe
		 *   targets only (composer card, message bubbles, settings dialog).
		 * - The menu material (`--dsw-menu-surface-fill`, `--dsw-menu-backdrop-filter`),
		 *   modal masks and every semantic state color stay official on purpose.
		 * - Config lives in localStorage (a third-party settings namespace cannot be
		 *   written through the settings RPC); picked video files live in
		 *   IndexedDB, so nothing needs a host half or a server route.
		 *
		 * Every write retracts on dispose: the token layer, the stylesheet, the stage,
		 * both object URLs, the slot row, the body attributes and `window.__dshGlassMood`.
		 */

		//#region constants
		var PLUGIN_ID = "dsh-glass-mood-theme";
		/** Override-layer identity: one layer per source, restacked on every change. */
		var SOURCE = "dsh-glass-mood";
		var STYLE_ID = "dsh-glass-mood-style";
		var STAGE_ID = "dsh-glass-mood-bg";
		var FORCE_KEY = "dsh-glass-mood:force";
		var NOBLUR_KEY = "dsh-glass-mood:no-blur";
		var VIDEO_KEY = "dsh-glass-mood:video";
		var IDB_NAME = "dsh-glass-mood";
		var IDB_STORE = "media";
		/** One IndexedDB key per mood slot; the bare `wallpaper` key is the v1 legacy. */
		var IDB_KEY_PREFIX = "wallpaper:";
		var IDB_LEGACY_KEY = "wallpaper";
		var SLOTS = ["idle", "work"];
		/** Lingering idle time before the pearl mood returns — hides between-step gaps. */
		var IDLE_ENTER_MS = 1600;
		/** Tiny debounce so a one-frame flicker never cuts to work. */
		var WORK_ENTER_MS = 120;
		/** A mood is never replaced sooner than this, so switching stays readable. */
		var MIN_DWELL_MS = 600;
		/** Safety net: snapshot reads are cheap, and this covers an unreactive source. */
		var POLL_MS = 1500;
		/** How long the one-shot surface cross-fade window stays open (slowest fade + slack). */
		var FADE_WINDOW_MS = 1100;
		/** A turn parked on a user interaction is still work (the turn has not ended). */
		var COUNT_PENDING_AS_WORK = true;
		/** How much of a mood wash survives at full clarity (0 = none). */
		var TINT_THROUGH_CLARITY = 0.3;
		/**
		 * Wallpaper defaults. `tint` is the mood wash over the clip; `clarity` is how
		 * far the theme gets out of the clip's way (higher = thinner panes).
		 */
		var VIDEO_DEFAULTS = { fit: "cover", opacity: 0.6, blur: 0, tint: 0.35, clarity: 0.45, autoDim: true };
		/** Above this the IndexedDB write is worth warning about. */
		var VIDEO_WARN_BYTES = 400 * 1024 * 1024;
		var PANEL_KEY = "dsh-glass-mood:panels";
		/** The three shell columns, in DOM order, with the token each one paints. */
		var PANEL_KEYS = ["left", "main", "right"];
		/**
		 * Which official alias each column's surface is derived from. The left
		 * column paints `--dsw-specific-sidebar-fill`; the frame paints
		 * `--dsw-alias-bg-base` behind the centre and the right column.
		 */
		var PANEL_BASE_TOKEN = {
			left: "--dsw-specific-sidebar-fill",
			main: "--dsw-alias-bg-base",
			right: "--dsw-alias-bg-base"
		};
		/** Column lookup, from the shell's own class local names. */
		var PANEL_SELECTOR = {
			left: '[class*="_sidebarCol"]',
			main: '[class*="_centerCol"]',
			right: '[data-rightbar-col], [class*="_rightbarCol"]'
		};
		/**
		 * Geometry and light defaults. Frame 0 keeps the window's own corners as
		 * the outer contour; panel 20 is the official `--dsw-radius-xl` for an
		 * independent content card, and the gap is the surface inset between them.
		 *
		 * `opacity: -1` means "follow the mood palette's own alpha". Any value at or
		 * above 0 is an ABSOLUTE alpha for that panel: 1 is a solid panel that hides
		 * the wallpaper, 0 is fully clear. The two extremes have to be reachable, or
		 * the knob cannot do what its label promises.
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
			press: true
		};
		/**
		 * Surface probe bounds. A column's visible surface is not always the column:
		 * the sidebar paints its own background one or two wrappers deeper, which is
		 * why a column-level fill and a column-level blur were invisible there. The
		 * probe takes the DEEPEST qualifying element — the innermost box that still
		 * spans the panel — so both the fill and the frost land under its content
		 * instead of behind another painted layer.
		 */
		var SURFACE_MAX_NODES = 48;
		var SURFACE_MAX_DEPTH = 5;
		/** A surface spans at least this share of its column on both axes. */
		var SURFACE_MIN_COVERAGE = 0.85;
		/** Background alpha (or a background image) that counts as painted. */
		var SURFACE_MIN_ALPHA = 0.04;
		/**
		 * A content surface this large (a share of each viewport axis) counts as
		 * page-like: a settings page. Smaller ones are transient popovers, and the
		 * file-diff preview is one of those.
		 */
		var BIG_SURFACE_RATIO = 0.42;
		/**
		 * Columns narrower than this are a collapsed rail or a hidden track, not a
		 * content panel. Styling them (clipping, margins, material) is what made the
		 * sidebar's reopen control disappear, so they keep the app's own styling.
		 */
		var COLLAPSED_MAX_WIDTH = 56;
		/** The frame sampler is tiny on purpose: an average is all the theme needs. */
		var SAMPLE_WIDTH = 24;
		var SAMPLE_HEIGHT = 14;
		/** Sampling a frame is cheap but not free, so it is throttled well below the poll. */
		var SAMPLE_INTERVAL_MS = 4000;
		/** Above this average brightness the media earns a dimming layer. */
		var DIM_KNEE = 0.55;
		/** That layer never exceeds Apple's 35%, and never darkens dark footage. */
		var DIM_MAX = 0.35;
		/** How far the content's own hue pulls the glass toward it (0 = never). */
		var SPILL_MIX = 0.45;
		/** The saturation the tint aims for: enough chroma to read as colour. */
		var SPILL_SATURATION = 0.34;
		/** Light panes step down to here so their tint has room; dark panes do not move. */
		var SPILL_MAX_LIGHTNESS = 0.86;
		/** Below this saturation the footage is effectively grey: no hue to spill. */
		var SPILL_MIN_SATURATION = 0.08;
		/**
		 * Below this brightness the footage casts no colourful light worth picking up,
		 * however saturated its pixels nominally are: a near-black frame's "hue" is an
		 * artefact of the maths, not something a person could see.
		 */
		var SPILL_MIN_BRIGHTNESS = 0.08;
		/**
		 * Wallpaper visibility is ONE perceptual axis, so one knob drives both halves:
		 * the clip's own strength and how far the theme gets out of its way. Two
		 * separate sliders moved the same perception and read as duplicates.
		 */
		var VISIBILITY_MIN_CLIP = 0.35;
		/**
		 * Edge refraction for the liquid-glass rim: a small displacement driven by
		 * turbulence, applied as a `backdrop-filter: url(#…)` layer so it bends the
		 * backdrop at the element's own edge (where the backdrop alpha transitions)
		 * and leaves the centre untouched.
		 */
		var REFRACTION_ID = "dsh-glass-mood-refraction";
		/**
		 * A crisp lens, not a smear: a single octave of low-amplitude turbulence
		 * displaces the backdrop only where its alpha transitions (the rounded edge),
		 * with no pre-blur. Adding feGaussianBlur here is what made the toggle read as
		 * "more blur" instead of "refraction".
		 */
		var REFRACTION_SVG =
			'<svg id="' + REFRACTION_ID + '" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' +
			'<filter id="' + REFRACTION_ID + '-filter" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">' +
			'<feTurbulence type="fractalNoise" baseFrequency="0.016 0.02" numOctaves="1" seed="7" result="noise"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>' +
			"</filter></svg>";
		/**
		 * How far `clarity` may thin each token's alpha, and the alpha it may never
		 * go below. The canvas and the sidebar uncover the clip; anything that can
		 * carry text keeps a high floor, because the clip's brightness is unknown —
		 * legibility is a floor, not a setting the user can delete by accident.
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
		 * Content surfaces: the minimum alpha they keep while a wallpaper is showing.
		 * The shipped theme paints every one of these with an opaque static colour, so
		 * a wallpaper must never eat into them — that is what made the file-diff
		 * popover and the settings page unreadable.
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
		 * The alias surface this theme owns. Deliberately narrow: backgrounds,
		 * borders, labels, the brand accent, interaction fills and the sidebar /
		 * input / bubble specifics. Menu material, modal masks, code-diff and state
		 * colors are NOT touched — they carry meaning or a documented ownership.
		 * Four palettes, every value a [light, dark] pair.
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

		/** Palette rows in TOKEN_KEYS order, per mood and per color scheme. */
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
		 * Build the `{ token: { light, dark } }` dictionary the theme service takes.
		 * Both schemes are mandatory (`overrideTokens` throws on a bare string), so
		 * a missing or empty value is a programming error and is reported as one.
		 * @param mood - palette id.
		 * @returns the override dictionary for `ctx.theme.overrideTokens`.
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
		 * Rewrite one CSS color's alpha, leaving every other color form untouched.
		 * Only rgba() is understood, which is exactly the shape the panes use.
		 * @param value - the CSS color.
		 * @param rate - how much clarity may remove, 0..1.
		 * @param floor - the alpha this token may never go below.
		 * @param clarity - the user's clarity, 0..1.
		 * @returns the new color, or the original when it is not a dimmable rgba.
		 */
		function dimAlpha(value, rate, floor, clarity) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var alpha = Number(match[4]);
			var next = Math.max(floor, alpha * (1 - rate * clarity));
			return "rgba(" + match[1] + ", " + match[2] + ", " + match[3] + ", " + Math.round(next * 1000) / 1000 + ")";
		}

		/**
		 * Thin the panes so a wallpaper can actually be seen. Colors are never
		 * rewritten, only alphas, and only for tokens with a declared budget: a
		 * token with no entry keeps its exact value.
		 * @param pair - the mood's override dictionary.
		 * @param clarity - the user's clarity, 0..1.
		 * @returns a new override dictionary.
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
			// Protection is not thinning: it raises a content surface back up to a
			// readable alpha, never down, and never touches its hue.
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
		 * Lift one CSS colour to at least `floor`, leaving every other colour form
		 * untouched. Only rgba() is understood, which is the shape these tokens use.
		 * @param value - the CSS color.
		 * @param floor - the alpha this surface keeps while a wallpaper is showing.
		 * @returns the new color, or the original when it is not a liftable rgba.
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
		 * The stage. Opaque, so whatever the canvas paints below it never washes the
		 * glass; light/dark variants swap on `body[data-ds-dark-theme]`, mood
		 * variants crossfade through the opacity of two stacked layer groups, and up
		 * to two clips render underneath them — one per mood — so the mood switch is
		 * a crossfade between moving pictures.
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
			/* ---- stage: fixed, clips + gradients, behind the lifted app frame ---- */
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
			/* A slow cool breath while a turn is in flight: the only motion in the theme. */
			"#" + STAGE_ID + ">[data-glass-layer=dim]{inset:0;background:rgba(0,0,0,var(--gm-media-dim,0));transition:background-color var(--gm-fade) cubic-bezier(.4,0,.2,1)}",
			"#" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:0;background:radial-gradient(70% 55% at 50% -10%, rgba(152,178,202,.16) 0%, rgba(152,178,202,0) 70%)}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:.55;animation:gm-breathe 5.5s ease-in-out infinite}",
			/* Over footage the wash is at its most visible, so the pulse steps back. */
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{opacity:.35}",
			"@keyframes gm-breathe{0%,100%{opacity:.45}50%{opacity:.95}}",
			"@media (prefers-reduced-motion: reduce){body[data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=pulse]{animation:none;opacity:.4}}",
			/* ---- clips: one element per mood slot, crossfaded by the mood attribute ----
			   Both keep playing, so the switch never waits for a decoder; a slot with no
			   clip of its own is marked `both` and serves whichever mood is active. */
			"#" + STAGE_ID + ">video[data-glass-clip]{position:absolute;inset:0;width:100%;height:100%;object-fit:var(--gm-wall-fit,cover);object-position:center;opacity:0;filter:blur(var(--gm-wall-blur,0px));transform:scale(var(--gm-wall-scale,1));transform-origin:center;pointer-events:none;transition:opacity var(--gm-fade) cubic-bezier(.4,0,.2,1)}",
			"body[data-glass-mood=idle] #" + STAGE_ID + ">video[data-glass-clip=idle],body[data-glass-mood=idle] #" + STAGE_ID + ">video[data-glass-clip=both]{opacity:var(--gm-wall-opacity,0.6)}",
			"body[data-glass-mood=work] #" + STAGE_ID + ">video[data-glass-clip=work],body[data-glass-mood=work] #" + STAGE_ID + ">video[data-glass-clip=both]{opacity:var(--gm-wall-opacity,0.6)}",
			/* The mood wash rides on top of the clip, and fades out as clarity rises. */
			"body[data-glass-wallpaper=on] #" + STAGE_ID + ">[data-glass-layer=idle]," +
				"body[data-glass-wallpaper=on] #" + STAGE_ID + ">[data-glass-layer=work]{filter:saturate(.4)}",
			"body[data-glass-wallpaper=on][data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:var(--gm-tint,0.3)}",
			"body[data-glass-wallpaper=on][data-glass-mood=idle] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:0}",
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=idle]{opacity:0}",
			"body[data-glass-wallpaper=on][data-glass-mood=work] #" + STAGE_ID + ">[data-glass-layer=work]{opacity:calc(var(--gm-tint,0.3) * .75)}",
			/* ---- lift the app frame: a plain stacking context, never a filter ---- */
			"#root{position:relative;z-index:1}",
			/* ---- mood design variables (structure, not color) ---- */
			"body[data-glass-mood]{--gm-fade:900ms;--gm-blur:26px;--gm-sat:118%;--gm-frost:rgba(255,255,255,.10);--gm-rim-strong:rgba(255,255,255,.46);--gm-rim-soft:rgba(255,255,255,.16);--gm-halo:rgba(86,96,140,.10);--gm-tint:0.3;--gm-sheen-mood:0.92;--gm-refract:none}",
			"body[data-glass-mood=work]{--gm-fade:260ms;--gm-blur:13px;--gm-sat:128%;--gm-frost:rgba(214,234,255,.10);--gm-rim-strong:rgba(255,255,255,.55);--gm-rim-soft:rgba(150,200,255,.18);--gm-halo:rgba(24,72,132,.16);--gm-sheen-mood:1.08}",
			"body[data-ds-dark-theme][data-glass-mood]{--gm-frost:rgba(255,255,255,.07);--gm-rim-strong:rgba(255,255,255,.26);--gm-rim-soft:rgba(255,255,255,.10);--gm-halo:rgba(0,0,0,.30)}",
			"body[data-ds-dark-theme][data-glass-mood=work]{--gm-frost:rgba(150,200,255,.08);--gm-rim-strong:rgba(196,226,255,.30);--gm-rim-soft:rgba(150,200,255,.14);--gm-halo:rgba(0,0,0,.34)}",
			/* ---- frosted glass on three verified-safe targets ----
			   backdrop-filter would turn a column container into the containing block of
			   its fixed-position descendants, so it rides a ::before pseudo whose parent
			   is isolated. The composer card and the settings dialog are already
			   positioned; only the bubble needs position:relative. */
			/* position + z-index, not isolation: see the backdrop-root note above. */
			"body[data-glass-blur=on] [data-composer-card]{position:relative;z-index:0}",
			"body[data-glass-blur=on] [data-time-hover-root] [class*=_bubble]{position:relative;z-index:0}",
			/* Page-like content gets frosting back: the settings surface reads well as
			   frosted glass, and the blur is what keeps a thin surface legible. The
			   `data-glass-frost` hook is set by JS only on surfaces big enough to be a
			   page, so small transient popovers — the file-diff preview above all —
			   keep a solid official backing instead of a blurred one. */
			"body[data-glass-blur=on] [data-glass-frost=on]{position:relative;z-index:0}",
			"body[data-glass-blur=on] [data-composer-card]::before," +
				"body[data-glass-blur=on] [data-time-hover-root] [class*=_bubble]::before," +
				"body[data-glass-blur=on] [data-glass-frost=on]::before{" +
				"content:\"\";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;" +
				"-webkit-backdrop-filter:blur(calc(var(--gm-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat)) var(--gm-refract);" +
				"backdrop-filter:blur(calc(var(--gm-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat)) var(--gm-refract);" +
				"background-color:var(--gm-frost);" +
				"box-shadow:inset 0 1px 0 var(--gm-rim-strong),inset 0 0 0 1px var(--gm-rim-soft),0 0 24px var(--gm-halo)}",
			/* ---- one-shot cross-fade of surface colors, only around a mood change ---- */
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
			/* ---- the three shell columns: one material system, no crescents ----
			   The official layout gives the centre column a lone rounded corner and
			   leaves the sidebar flat, which exposes a wedge of the frame between them
			   (the "crescent" the radius standard warns about). Here the contour lives
			   on exactly one surface per arrangement: with a gap, each column is its own
			   card inset by the gutter; without one, the panels are square and the
			   frame's own radius clips them into a single continuous sheet. */
			"body[data-glass-panels] [data-glass-panel]{position:relative;z-index:0;margin:var(--gm-gap) calc(var(--gm-gap) / 2) 0;border-radius:var(--gm-radius);overflow:hidden;box-shadow:var(--gm-panel-shadow,none)}",
			/* A fullscreen right panel is an overlay, not a column: leave it alone. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=right]{margin:0;overflow:visible;border-radius:0}",
			/* The column IS the surface: its layout wrapper must not paint a second
			   fill on top of it, or the opacity knob would be invisible. */
			"body[data-glass-panels] [data-glass-panel] > *{background-color:transparent}",
			/* When the probe finds a deeper surface, the paint and the frost move to it
			   and the column steps aside — otherwise the two layers stack and the knob
			   only moves the invisible one. */
			"body[data-glass-panels] [data-glass-panel][data-glass-delegate=on]{background-color:transparent}",
			/* A painter that cannot see the wallpaper gives up its own paint so the
			   column's material (and its frost) is what shows. */
			"body[data-glass-panels] [data-glass-hollow]{background-color:transparent;background-image:none}",
			"body[data-glass-panels] [data-glass-surface]{position:relative;z-index:0}",
			"body[data-glass-panels] [data-glass-surface=left]{--gm-panel-blur:var(--gm-panel-left-blur);background-color:var(--gm-panel-left-fill)}",
			"body[data-glass-panels] [data-glass-surface=main]{--gm-panel-blur:var(--gm-panel-main-blur);background-color:var(--gm-panel-main-fill)}",
			"body[data-glass-panels] [data-glass-surface=right]{--gm-panel-blur:var(--gm-panel-right-blur);background-color:var(--gm-panel-right-fill)}",
			/* The frost is deliberately NOT gated on the transparency preference. Skipping
			   it looked like a free saving (a solid pane has nothing to see through), but
			   it also means one preference reading can silently disable the blur knob —
			   and a blur over a solid pane is invisible anyway. */
			/* The blur rides a pseudo, never the panel element itself: an element with a
			   backdrop-filter becomes the containing block of its fixed-position
			   descendants, which would displace any floating control living inside a
			   panel. A pseudo has no descendants, so it is safe — and with the wallpaper
			   stage inside the shell its backdrop now contains the footage. */
			"body[data-glass-panels][data-glass-blur=on] [data-glass-surface]::before{" +
				"content:\"\";position:absolute;inset:0;z-index:-1;pointer-events:none;background:transparent;" +
				"-webkit-backdrop-filter:blur(calc(var(--gm-panel-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat));" +
				"backdrop-filter:blur(calc(var(--gm-panel-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat))}",
			"body[data-glass-panels][data-glass-blur=on] [data-glass-panel]:not([data-glass-delegate=on])::before{" +
				"content:\"\";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;background:transparent;" +
				"-webkit-backdrop-filter:blur(calc(var(--gm-panel-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat));" +
				"backdrop-filter:blur(calc(var(--gm-panel-blur) * var(--gm-blur-scale,1))) saturate(var(--gm-sat))}",
			"body[data-glass-panels] [data-glass-panel=left]{--gm-panel-blur:var(--gm-panel-left-blur);--gm-sheen:var(--gm-panel-left-sheen);--gm-panel-shadow:var(--gm-panel-left-shadow);margin-left:var(--gm-gap);background-color:var(--gm-panel-left-fill)}",
			"body[data-glass-panels] [data-glass-panel=main]{--gm-panel-blur:var(--gm-panel-main-blur);--gm-sheen:var(--gm-panel-main-sheen);--gm-panel-shadow:var(--gm-panel-main-shadow);background-color:var(--gm-panel-main-fill)}",
			"body[data-glass-panels] [data-glass-panel=right]{--gm-panel-blur:var(--gm-panel-right-blur);--gm-sheen:var(--gm-panel-right-sheen);--gm-panel-shadow:var(--gm-panel-right-shadow);margin-right:var(--gm-gap);background-color:var(--gm-panel-right-fill)}",
			/* The scheme is resolved in JS (one published fill per panel follows the
			   presenter), so there is deliberately no per-scheme variant here. */
			/* A collapsed right column leaves the centre as the last surface. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-collapsed] [data-glass-panel=main]{margin-right:var(--gm-gap)}",
			/* The outer sheet: transparent gutter, radius, and the single clipping contour. */
			"body[data-glass-panels] [data-glass-frame]{border-radius:var(--gm-frame-radius);padding-bottom:var(--gm-gap)}",
			/* Only the flush arrangement needs the frame to cut; a gap must not clip the
			   app's own floating controls (the sidebar reopen control is one). */
			"body[data-glass-panels][data-glass-gap=off] [data-glass-frame]{overflow:hidden}",
			"body[data-glass-panels][data-glass-gap=on] [data-glass-frame]{background:transparent}",
			/* The rim + divider overlay: `::after` is a positioned child, so it paints
			   ABOVE the column's in-flow content. A divider drawn as the column's own
			   inset shadow could not — the sidebar surface covered it, which is exactly
			   why the knob looked dead. Masking clips box-shadow to the ring, so the
			   outer contact shadow lives on the panel instead (see box-shadow above). */
			"body[data-glass-panels] [data-glass-panel]::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;padding:1px;" +
				"background:linear-gradient(135deg,var(--gm-rim-a) 0%,var(--gm-rim-b) 38%,var(--gm-rim-edge) 62%,var(--gm-rim-c) 100%);background-size:220% 220%;" +
				"-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);" +
				"-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;" +
				"opacity:calc(var(--gm-sheen) * var(--gm-sheen-mood,1));" +
				"box-shadow:inset 0 1px 0 var(--gm-rim-a),inset 0 0 0 1px var(--gm-rim-edge),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
			/* The divider lives on that overlay, so it draws over the sidebar surface. */
			"body[data-glass-panels][data-glass-gap=off] [data-glass-panel=left]::after{box-shadow:inset -1px 0 0 0 var(--gm-divider),inset 0 1px 0 var(--gm-rim-a),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
			"body[data-glass-panels][data-glass-gap=off] [data-glass-panel=right]::after{box-shadow:inset 1px 0 0 0 var(--gm-divider),inset 0 1px 0 var(--gm-rim-a),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
			/* Interaction feedback: a press that deforms the control, from the
			   immersive-material spec (`interactive`). It uses the `scale` property
			   rather than `transform`, so it cannot clobber an app transform, and it is
			   limited to genuinely pressable controls. */
			"@keyframes gm-press{from{scale:1}to{scale:.972}}",
			"body[data-glass-press=on] button:active,body[data-glass-press=on] [role=button]:active," +
				"body[data-glass-press=on] [role=tab]:active,body[data-glass-press=on] [role=menuitem]:active{" +
				"animation:gm-press 160ms cubic-bezier(.2,.8,.2,1) forwards}",
			"@media (prefers-reduced-motion: reduce){body[data-glass-press=on] button:active," +
				"body[data-glass-press=on] [role=button]:active,body[data-glass-press=on] [role=tab]:active," +
				"body[data-glass-press=on] [role=menuitem]:active{animation:none}}",
			/* ---- the wallpaper settings row: consumes official alias tokens only ---- */
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
		 * Read one optional service without assuming the context exposes `get`.
		 * @param ctx - the client context.
		 * @param name - service key.
		 * @returns the service, or undefined when it is absent.
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
		 * Keep a video playing. Autoplay is only allowed for a muted, inline video;
		 * a refusal is expected on a locked-down page and must never break the plugin.
		 * @param video - the video element.
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
					started.catch(function () { /* autoplay refused: the stage keeps the gradient */ });
				}
			} catch (error) { /* a browser without media playback still gets the gradient */ }
		}

		/** One clip slot, normalized. */
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
		 * Normalize a stored or patched wallpaper config. The v1 shape (one video at
		 * the top level) is read as the idle slot, so an existing install keeps
		 * working without the user touching anything.
		 * @param raw - stored JSON or a patch.
		 * @returns a complete config.
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

		/** @returns whether any slot carries a clip. */
		function hasWallpaperConfig(config) {
			return config.clips.idle.source !== "" || config.clips.work.source !== "";
		}

		/**
		 * The alpha a CSS colour actually paints with.
		 * @param color - a computed `background-color`.
		 * @returns 0..1.
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
		 * @param node - a candidate surface element.
		 * @returns whether it lives inside a dialog. A modal is never a panel's surface:
		 * it comes and goes, and treating one as a surface flipped the panel's material
		 * back and forth every time the settings page was re-rendered.
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
		 * Find the element that actually paints a column's surface: the DEEPEST
		 * descendant that still spans most of the column and paints (a background
		 * colour or a background image). Reading computed styles is only done on
		 * demand (mount, a panel change, a rebuilt column), never on the cheap
		 * re-tag poll.
		 * @param win - the window (supplies getComputedStyle).
		 * @param column - the column element.
		 * @returns the surface element, or null when the column itself is the surface.
		 */
		function findSurface(win, column) {
			var all = paintersIn(win, column);
			return all.length === 0 ? null : all[all.length - 1];
		}

		/**
		 * Every element in a column that spans it and paints, shallowest first.
		 * @param win - the window (supplies getComputedStyle).
		 * @param column - the column element.
		 * @returns the painters, or an empty array.
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
					// Keep walking: the deepest painter is the one whose children are the
					// panel's content, so it is where the material belongs.
					if (paints) found.push(child);
				}
			}
			return found;
		}

		/** Clamp a number into a range, falling back when it is not finite. */
		function clampNumber(value, min, max, fallback) {
			var number = Number(value);
			return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
		}

		/**
		 * Normalize the panel-material config. Every value is clamped rather than
		 * trusted: this shape is written by sliders and by hand-edited storage.
		 * @param raw - stored JSON or a patch.
		 * @returns a complete panel config.
		 */
		function normalizePanels(raw) {
			var source = raw === undefined || raw === null ? {} : raw;
			var panels = {};
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var key = PANEL_KEYS[i];
				var base = PANEL_DEFAULTS[key];
				var given = source[key] === undefined || source[key] === null ? {} : source[key];
				panels[key] = {
					// -1 is the "follow the palette" sentinel; 0..1 is an absolute alpha.
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
				press: source.press === undefined ? PANEL_DEFAULTS.press : source.press === true
			};
		}

		/**
		 * The alpha a panel's fill may use, in one color scheme.
		 *
		 * Two modes, and the difference matters:
		 *  - `opacity < 0` (auto): the official alias's own alpha, thinned by the
		 *    wallpaper visibility budget, so the panel follows the mood palette.
		 *  - `opacity >= 0` (explicit): an ABSOLUTE alpha. It deliberately overrides
		 *    the visibility thinning, because otherwise "fully opaque" would still
		 *    leave the wallpaper showing through at 38% and the knob could never do
		 *    what its label promises.
		 * @param key - panel key.
		 * @param scheme - 'light' or 'dark'.
		 * @param panels - the panel config.
		 * @param clarity - the wallpaper clarity, 0..1.
		 * @param wallpaperOn - whether a clip is configured.
		 * @param mood - the mood whose palette supplies the base colour.
		 * @param sample - the last media reading, whose hue tints the pane when the
		 * content-tinting switch is on. Nothing is tinted without it.
		 * @returns a CSS color.
		 */
		function panelFill(key, scheme, panels, clarity, wallpaperOn, mood, sample, reducedTransparency) {
			var token = PANEL_BASE_TOKEN[key];
			var value = pairFor(mood === "work" ? "work" : "idle")[token][scheme];
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var explicit = panels[key].opacity;
			var alpha;
			if (reducedTransparency === true) {
				// "Reduce transparency" outranks the visibility knob: a pane you have to
				// read through is exactly what the preference asks to remove.
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
			// The content's own hue reaches the pane, never the footage: the clip keeps
			// its colours and the glass takes on a hint of them. Nothing is tinted when
			// the switch is off, because `sample` is then null.
			var reading = sample === undefined || sample === null ? null : sample;
			var tinted = tintTowardHue(
				Number(match[1]),
				Number(match[2]),
				Number(match[3]),
				reading !== null && reading.ready ? reading.hue : null,
				SPILL_MIX
			);
			return "rgba(" + tinted[0] + ", " + tinted[1] + ", " + tinted[2] + ", " + Math.round(alpha * 1000) / 1000 + ")";
		}

		/**
		 * @param hue - 0..360.
		 * @param saturation - 0..1.
		 * @param lightness - 0..1.
		 * @returns [r, g, b] in 0..255.
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
		 * Pull a colour toward the content's hue. The blend is a straight RGB lerp
		 * between the authored colour and "that hue at this colour's own lightness and
		 * saturation", so the path runs through neutral grey.
		 *
		 * Rotating the hue on the wheel instead would be a mistake here: the short way
		 * from a cool rim (220°) to warm content (29°) runs through magenta, which is
		 * exactly the purple cast this theme had to remove.
		 * @param r - 0..255.
		 * @param g - 0..255.
		 * @param b - 0..255.
		 * @param hue - target hue in degrees, or null to leave the colour alone.
		 * @param mix - 0..1 share of the way to travel.
		 * @returns [r, g, b].
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
			// A neutral stop carries no hue to move, and a tint would only dirty it.
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
		 * The label tiers, weakest first. Under "increase contrast" every tier takes
		 * the primary colour: the hierarchy is carried by size and weight instead of by
		 * fading text toward the background.
		 */
		var LABEL_TIERS = [
			"--dsw-alias-label-secondary",
			"--dsw-alias-label-tertiary",
			"--dsw-alias-label-caption",
			"--dsw-alias-label-dimmed",
			"--dsw-alias-label-document-preview"
		];

		/**
		 * Answer "increase contrast": every label tier becomes the primary colour, and
		 * no content surface is allowed to stay translucent.
		 * @param pair - the light/dark token pairs.
		 * @returns a new pair set; the input is not modified.
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
		 * Answer "reduce transparency": no text-bearing surface may depend on what is
		 * behind it. The canvas is deliberately left alone — the wallpaper is the
		 * person's own choice and it is only visible where nothing has to be read.
		 * @param pair - the light/dark token pairs.
		 * @returns a new pair set.
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
		 * Tint a surface toward the content's hue, visibly.
		 *
		 * A hue rotation is not enough on its own: the panes are within a couple of
		 * percent of neutral, so rotating their hue moves nothing. The target is the
		 * content's hue at `SPILL_SATURATION`, at the surface's own lightness capped by
		 * `SPILL_MAX_LIGHTNESS` (a light pane needs to step down before it can hold any
		 * chroma), and the blend is a straight RGB lerp so it passes through neutral
		 * rather than through magenta.
		 * @param r - 0..255.
		 * @param g - 0..255.
		 * @param b - 0..255.
		 * @param hue - target hue in degrees, or null to leave the colour alone.
		 * @param mix - 0..1 share of the way to travel.
		 * @returns [r, g, b].
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
		 * Rotate an `rgba()` string's hue toward the content, leaving its alpha alone.
		 * @param value - a CSS rgba() color.
		 * @param hue - target hue in degrees, or null to leave it alone.
		 * @param mix - 0..1 share of the way to travel.
		 * @returns the biased color, or the original when it is not a liftable rgba.
		 */
		function biasColorString(value, hue, mix) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var biased = biasTowardHue(Number(match[1]), Number(match[2]), Number(match[3]), hue, mix);
			return "rgba(" + biased[0] + ", " + biased[1] + ", " + biased[2] + ", " + match[4] + ")";
		}

		/**
		 * @param r - average red, 0..255.
		 * @param g - average green.
		 * @param b - average blue.
		 * @returns the perceived brightness, 0..1 (Rec. 709 weights).
		 */
		function brightnessOf(r, g, b) {
			return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		}

		/**
		 * @param r - average red, 0..255.
		 * @param g - average green.
		 * @param b - average blue.
		 * @returns the hue in degrees, or null when the average is effectively grey.
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
		 * The rim colours for the liquid-glass edge, per mood, per scheme. Light
		 * falls from the top-left; the bottom-right keeps a faint counter-rim so the
		 * contour never disappears against a bright wallpaper.
		 * @param mood - palette id.
		 * @param scheme - 'light' or 'dark'.
		 * @param sample - the last media reading, when its hue should spill onto the rim.
		 * @returns rim colours, the ambient-occlusion tone, and a divider builder.
		 */
		function panelRim(mood, scheme, sample) {
			var work = mood === "work";
			var dark = scheme === "dark";
			// The content's own hue reaches the glass through its edge, never through the
			// footage: the clip keeps its colours and the rim picks up a hint of them.
			var spillHue = sample !== undefined && sample !== null && sample.ready ? sample.hue : null;
			// A white highlight on a white panel is invisible, so a light-scheme edge
			// carries a cool grey hairline plus a contact shadow instead; the bright
			// component only leads in the dark scheme, where it can actually read.
			return {
				a: dark ? "rgba(255,255,255," + (work ? 0.42 : 0.34) + ")" : "rgba(255,255,255," + (work ? 0.6 : 0.52) + ")",
				b: biasColorString(dark ? "rgba(" + (work ? "198,224,255" : "255,255,255") + ",0.16)" : "rgba(" + (work ? "150,190,235" : "176,186,206") + ",0.34)", spillHue, SPILL_MIX),
				c: biasColorString(dark ? "rgba(" + (work ? "150,200,255" : "255,246,238") + ",0.24)" : "rgba(" + (work ? "120,170,220" : "150,160,182") + ",0.42)", spillHue, SPILL_MIX),
				ao: dark ? "rgba(0,0,0,0.5)" : "rgba(90,100,140,0.16)",
				edge: dark ? "rgba(0,0,0,0.34)" : "rgba(120,132,156,0.34)",
				contact: dark ? "rgba(0,0,0,0.42)" : "rgba(84,94,124,0.20)",
				/**
				 * The flush-layout hairline, scaled by the user's divider strength. The
				 * base is deliberately strong enough to see: a 5% hairline is not a
				 * divider, it is a rumour.
				 * @param strength - 0..1.
				 * @returns a CSS color.
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
		 * Owns the stage, both clip slots, the token layer and the activity state machine.
		 * @param deps - injected environment (kept explicit so the module is testable).
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
			var layerDispose = null;
			var unsubscribes = [];
			/** One video element per mood slot: both exist so a switch never waits. */
			var videos = {};
			/** Object URLs this plugin created, one per slot. */
			var clipUrls = {};
			var wallpaper = normalizeVideo(null);
			var wallpaperListeners = [];
			var panels = normalizePanels(null);
			var panelListeners = [];
			/** The alpha each panel currently paints, for the row's readout. */
			var panelAlphaCache = { left: 0, main: 0, right: 0 };
			/**
			 * What the footage currently looks like. `ready` stays false until a frame
			 * has actually been read, so nothing is ever guessed: an unreadable clip
			 * (a cross-origin URL taints the canvas) falls back to the neutral wash.
			 */
			var mediaSample = { ready: false, brightness: 0.5, hue: null, saturation: 0, dim: 0, sampledAt: 0 };
			var sampleCanvas = null;
			var prefers = { reducedTransparency: false, moreContrast: false };
			var preferenceLists = [];

			/** @returns the first clip that actually has a frame to read. */
			function activeVideo() {
				for (var i = 0; i < SLOTS.length; i++) {
					var video = videos[SLOTS[i]];
					if (video === undefined || video === null) continue;
					if (video.getAttribute("data-glass-clip") === "none") continue;
					if (typeof video.readyState === "number" && video.readyState < 2) continue;
					return video;
				}
				return null;
			}

			/** @returns the offscreen sampler canvas, created once. */
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

			/** Publish what the footage implies: a dim layer and a hue to spill. */
			function publishMedia() {
				var dim = 0;
				if (wallpaper.autoDim === true && mediaSample.ready && mediaSample.brightness > DIM_KNEE) {
					dim = Math.min(DIM_MAX, ((mediaSample.brightness - DIM_KNEE) / (1 - DIM_KNEE)) * DIM_MAX);
				}
				mediaSample.dim = Math.round(dim * 1000) / 1000;
				doc.body.style.setProperty("--gm-media-dim", String(mediaSample.dim));
			}

			/**
			 * Read one downscaled frame and derive its brightness and hue. Throttled,
			 * and a no-op when the canvas is unavailable or the clip is unreadable.
			 * @param force - ignore the throttle (a new clip deserves a fresh reading).
			 * @returns whether a frame was read.
			 */
			function sampleMedia(force) {
				if (disposed) return false;
				var video = activeVideo();
				if (video === null) {
					if (mediaSample.ready) {
						mediaSample = { ready: false, brightness: 0.5, hue: null, saturation: 0, dim: 0, sampledAt: mediaSample.sampledAt };
						publishMedia();
						syncPanels();
					}
					return false;
				}
				var now = deps.now();
				if (force !== true && now - mediaSample.sampledAt < SAMPLE_INTERVAL_MS) return false;
				mediaSample.sampledAt = now;
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
					// Tainted canvas (a cross-origin clip): stop guessing, use the wash.
					mediaSample.ready = false;
					mediaSample.hue = null;
					publishMedia();
					syncPanels();
					return false;
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
				mediaSample = {
					ready: true,
					brightness: brightness,
					hue: brightness < SPILL_MIN_BRIGHTNESS ? null : hueOf(r, g, b),
					saturation: max === 0 ? 0 : (max - min) / max,
					dim: mediaSample.dim,
					sampledAt: now
				};
				publishMedia();
				syncPanels();
				return true;
			}

			/**
			 * Watch the two accessibility preferences Liquid Glass has to answer. A
			 * browser without `matchMedia` simply reports "no preference".
			 * @returns the current state.
			 */
			function readPreferences() {
				prefers.reducedTransparency = queryPreference("(prefers-reduced-transparency: reduce)");
				prefers.moreContrast = queryPreference("(prefers-contrast: more)");
				// The attributes drive the CSS and the diagnostic, so they follow the
				// reading whether or not a full repaint is asked for.
				if (prefers.reducedTransparency) doc.body.dataset.glassTransparency = "reduced";
				else delete doc.body.dataset.glassTransparency;
				if (prefers.moreContrast) doc.body.dataset.glassContrast = "more";
				else delete doc.body.dataset.glassContrast;
				return prefers;
			}

			/** @param query - a media query. @returns whether it is supported and matches. */
			function queryPreference(query) {
				if (deps.matchMedia === undefined || deps.matchMedia === null) return false;
				var list = null;
				try { list = deps.matchMedia(query); } catch (error) { return false; }
				if (list === null || list === undefined) return false;
				return list.matches === true;
			}

			/**
			 * Re-read the preferences and repaint what they touch. At boot only
			 * `readPreferences` runs: the mood commit that follows publishes the token
			 * layer, and publishing twice would stack two layers for nothing.
			 */
			function applyPreferences() {
				readPreferences();
				applyTokens();
				syncPanels();
			}

			/** Follow a system change to either preference. */
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
			 * Remove anything a previous instance left in the DOM: a live reload can
			 * mount this plugin twice, and two stages (or two style sheets) are how the
			 * interface ended up buried under a stray wallpaper layer.
			 * @returns how many orphan stages were removed.
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
					"[data-glass-delegate]", "[data-glass-hollow]", "[data-glass-frame]", "[data-glass-checker]"
				];
				for (var i = 0; i < stray.length; i++) {
					var nodes = doc.querySelectorAll(stray[i]);
					for (var n = 0; n < nodes.length; n++) {
						if (typeof nodes[n].removeAttribute === "function") nodes[n].removeAttribute(stray[i].slice(1, -1));
					}
				}
				var vars = ["--gm-media-dim", "--gm-gap", "--gm-frame-radius", "--gm-radius", "--gm-refract",
					"--gm-blur-scale", "--gm-rim-a", "--gm-rim-b", "--gm-rim-c", "--gm-rim-edge", "--gm-rim-ao",
					"--gm-rim-contact", "--gm-divider", "--gm-wall-fit", "--gm-wall-opacity", "--gm-wall-blur",
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

			/** Which shell columns were actually found in the DOM. */
			var panelFound = { left: false, main: false, right: false };
			/** The column element per key, to notice a shell rebuild. */
			var panelNodes = { left: null, main: null, right: null };
			/** The element that actually paints each panel, when it is not the column. */
			var panelSurfaces = { left: null, main: null, right: null };
			/** Painters hollowed so the column's own material shows instead. */
			var panelHollow = { left: null, main: null, right: null };
			/** Why a panel had to keep its material on the column. */
			var panelDiag = { left: [], main: [], right: [] };
			var refractionMounted = false;
			var retagTimer = 0;
			var disposed = false;

			/** A guarded read: storage throws in private mode and off loopback. */
			function readKey(key) {
				try {
					return storage === undefined || storage === null ? null : storage.getItem(key);
				} catch (error) {
					return null;
				}
			}

			/** A guarded write; a failed persist never breaks the live theme. */
			function writeKey(key, value) {
				try {
					if (storage !== undefined && storage !== null) storage.setItem(key, value);
				} catch (error) { /* storage unavailable: the change stays in memory */ }
			}

			//#region wallpaper storage
			/** IndexedDB is optional: a page without it simply cannot keep a picked file. */
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

			/** @returns whether this page can keep picked files at all. */
			function storageAvailable() {
				var factory = deps.indexedDB;
				return factory !== undefined && factory !== null && typeof factory.open === "function";
			}

			/**
			 * @returns a promise for one slot's stored blob, distinguishing "the store
			 * is unavailable" from "the key is genuinely absent" — only the second one
			 * is allowed to clear a user's configuration.
			 */
			function readStoredClip(slot) {
				if (!storageAvailable()) return Promise.resolve({ available: false, blob: null });
				return withStore("readonly", function (store) { return store.get(IDB_KEY_PREFIX + slot); })
					.then(function (value) { return { available: true, blob: value === undefined ? null : value }; })
					.catch(function () { return { available: false, blob: null }; });
			}

			/** @returns the v1 single-file slot in the same shape, or unavailable. */
			function readLegacyClip() {
				if (!storageAvailable()) return Promise.resolve({ available: false, blob: null });
				return withStore("readonly", function (store) { return store.get(IDB_LEGACY_KEY); })
					.then(function (value) { return { available: true, blob: value === undefined ? null : value }; })
					.catch(function () { return { available: false, blob: null }; });
			}

			/** Drop the v1 key once its bytes have been copied to the slot key. */
			function dropLegacyClip() {
				if (!storageAvailable()) return Promise.resolve();
				return withStore("readwrite", function (store) { return store.delete(IDB_LEGACY_KEY); }).catch(function () {});
			}

			/** @returns a promise that settles when the blob is stored (or rejected). */
			function writeStoredClip(slot, blob) {
				return withStore("readwrite", function (store) { return store.put(blob, IDB_KEY_PREFIX + slot); });
			}

			/** @returns a promise that settles when one stored blob is gone. */
			function dropStoredClip(slot) {
				return withStore("readwrite", function (store) { return store.delete(IDB_KEY_PREFIX + slot); }).catch(function () {});
			}
			//#endregion

			//#region mood state machine
			/**
			 * The one signal this theme needs: is any session doing work?
			 * Preferred source is the ui-session status map (one entry per session,
			 * already aggregated); the session list plus per-session faces is the
			 * fallback, and `dsh-glass-mood:force` overrides both for inspection.
			 * @returns true while the agent is working.
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

			/** @returns the mood the current activity implies. */
			function desiredMood() {
				return readActivity() ? "work" : "idle";
			}

			/** Drop any pending transition. */
			function cancelPending() {
				if (timer !== 0) {
					clearTimer(timer);
					timer = 0;
				}
				pending = null;
			}

			/**
			 * Publish the token layer for the current mood, thinning the panes when a
			 * wallpaper is on. One funnel for both the mood machine and the sliders.
			 */
			function applyTokens() {
				var pair = pairFor(mood === null ? "idle" : mood);
				if (hasWallpaperConfig(wallpaper)) pair = dimPair(pair, wallpaper.clarity);
				if (prefers.reducedTransparency) pair = solidifySurfaces(pair);
				if (prefers.moreContrast) pair = boostContrast(pair);
				layerDispose = theme.overrideTokens(SOURCE, pair);
			}

			/** Adopt a mood: attribute, token layer, one-shot fade window. */
			function commit(next) {
				cancelPending();
				var fading = mood !== null && mood !== next;
				// The first commit paints the truth observed at mount, so it is not a
				// transition and must not be dwell-gated (a refresh mid-turn lands
				// decisive immediately). Every later commit is a switching decision.
				if (mood !== null) lastSwitch = now();
				mood = next;
				doc.body.dataset.glassMood = next;
				applyTokens();
				syncPanels();
				if (fading) {
					doc.body.dataset.glassFading = next;
					if (fadeTimer !== 0) clearTimer(fadeTimer);
					fadeTimer = setTimer(function () {
						fadeTimer = 0;
						delete doc.body.dataset.glassFading;
					}, FADE_WINDOW_MS);
				}
			}

			/** Schedule a transition, respecting the minimum dwell between switches. */
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

			/** Recompute the mood; the only entry point of the state machine. */
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

			/** Subscribe to every observable source that can report activity. */
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
				poll = deps.setInterval(function () {
					evaluate();
					sampleMedia(false);
				}, POLL_MS);
				// A colour-scheme flip re-resolves which palette each panel paints, so
				// the published fills follow the presenter rather than boot time.
				if (ctx !== undefined && ctx !== null && typeof ctx.on === "function") {
					try {
						ctx.on("theme/change", function () { syncPanels(); });
					} catch (error) { /* a context without the event still gets the boot scheme */ }
				}
			}
			//#endregion

			//#region wallpaper
			/** Push the current config to every listener (the settings row). */
			function announceWallpaper() {
				var snapshot = videoConfig();
				for (var i = 0; i < wallpaperListeners.length; i++) {
					try { wallpaperListeners[i](snapshot); } catch (error) { /* one bad row must not stop the rest */ }
				}
			}

			/** @returns a deep copy of the live wallpaper config. */
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
			 * Which clip each element plays. A slot with its own clip owns it; a lone
			 * clip is served by exactly one element marked `both`, so a single
			 * configured video still covers both moods (the v1 behaviour) without
			 * decoding the same file twice.
			 * @returns per-slot play plans.
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

			/** Release one slot's object URL, if this plugin created one. */
			function releaseClipUrl(slot) {
				var url = clipUrls[slot];
				if (url !== undefined && url !== null && objectUrls !== undefined && objectUrls !== null && typeof objectUrls.revokeObjectURL === "function") {
					try { objectUrls.revokeObjectURL(url); } catch (error) { /* already revoked */ }
				}
				clipUrls[slot] = null;
			}

			/** Paint the stage from the current config: sources, slots, wash, attribute. */
			/**
			 * @returns where the wallpaper stage belongs. It must be a descendant of the
			 * same backdrop root as the panels, or a backdrop-filter inside a panel
			 * cannot see it; the app shell is the closest ancestor they share.
			 */
			function stageHost() {
				var frame = doc.querySelector('[class*="_frame"]');
				if (frame !== null && frame !== undefined && typeof frame.insertBefore === "function") return { host: frame, shell: true };
				var root = typeof doc.getElementById === "function" ? doc.getElementById("root") : null;
				if (root !== null && root !== undefined && typeof root.insertBefore === "function") return { host: root, shell: true };
				return { host: doc.body, shell: false };
			}

			/** @returns the parent of a node, across real and stub DOMs. */
			function parentOf(node) {
				if (node === null || node === undefined) return null;
				if (node.parentNode !== undefined) return node.parentNode;
				return node.parent === undefined ? null : node.parent;
			}

			/**
			 * Keep the stage inside the app shell. Cheap enough for the poll: it only
			 * moves the node when the host actually changed.
			 */
			function ensureStageHost() {
				var stage = doc.getElementById(STAGE_ID);
				if (stage === null || stage === undefined) return;
				var target = stageHost();
				// The marker tracks the current host whether or not a move is needed: the
				// stage is created directly inside the shell on its first render.
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
			 * @returns the computed backdrop-filter per panel plus the value it should
			 * have, so a silent failure can be told apart from a value that never
			 * arrived. This is the diagnostic for "the blur knob does nothing".
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
						/** A delegated panel frosts an inner element; otherwise the column. */
						delegated: panelSurfaces[key] !== null && panelSurfaces[key] !== undefined,
						/** The alpha the pane paints with: 1 means no blur can show through. */
						fillAlpha: fill === "" ? null : effectiveAlpha(fill),
						/** Whether the frost rule is even eligible (the no-blur escape hatch). */
						blurGate: doc.body.dataset.glassBlur ?? "off",
						/** Live traits of whatever hosts the material now. */
						backdropRoots: backdropRoots(node),
						/** Why the probe chose this host (empty when nothing interfered). */
						probeReason: panelDiag[key],
						/** Painters hollowed so the column's material is the one that shows. */
						hollowed: panelHollow[key] === null ? 0 : panelHollow[key].length,
						blurVariable: style !== null && style !== undefined && typeof style.getPropertyValue === "function" ? String(style.getPropertyValue("--gm-panel-blur") ?? "") : "",
						backdrop: style === null || style === undefined ? "" : String(style.backdropFilter ?? ""),
						pseudoBackdrop: pseudo === null || pseudo === undefined ? "" : String(pseudo.backdropFilter ?? ""),
						stageHost: stageHostText
					};
				}
				return report;
			}

			/**
			 * Paint a high-contrast checkerboard inside the wallpaper stage. If a panel's
			 * blur works, the squares behind that panel turn into smooth grey; if they
			 * stay sharp, the blur is not reaching the backdrop at all. A video cannot
			 * show that, so this is the honest test.
			 * @param on - true to show it, false to remove it.
			 * @returns the resulting state.
			 */
			function checker(on) {
				var mounted = doc.querySelector("[data-glass-checker]");
				if (on === false) {
					if (mounted !== null && mounted !== undefined && typeof mounted.remove === "function") mounted.remove();
					return { checker: false };
				}
				var stage = doc.getElementById(STAGE_ID);
				if (stage === null || stage === undefined) return { checker: false, reason: "no-stage" };
				if (mounted === null || mounted === undefined) {
					mounted = doc.createElement("div");
					mounted.setAttribute("data-glass-checker", "");
					mounted.setAttribute("style", "position:absolute;inset:0;pointer-events:none;opacity:.85;background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/22px 22px");
					stage.appendChild(mounted);
				}
				return { checker: true };
			}

			function renderWallpaper() {
				if (disposed) return;
				var active = hasWallpaperConfig(wallpaper);
				doc.body.dataset.glassWallpaper = active ? "on" : "off";
				doc.body.style.setProperty("--gm-wall-fit", wallpaper.fit);
				doc.body.style.setProperty("--gm-wall-opacity", String(wallpaper.opacity));
				doc.body.style.setProperty("--gm-wall-blur", wallpaper.blur + "px");
				// Blur bleeds past the edges; a small overscan hides the seam.
				doc.body.style.setProperty("--gm-wall-scale", String(1 + (wallpaper.blur / 32) * 0.08));
				// Clarity also fades the mood wash, so one dial can make the clip clear.
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
						try { video.pause(); } catch (error) { /* never started */ }
						video.removeAttribute("src");
						if (typeof video.load === "function") {
							try { video.load(); } catch (error) { /* no source to reset */ }
						}
						continue;
					}
					video.setAttribute("data-glass-clip", active ? entry.slot : "none");
					// A stored file plays from this slot's object URL; a link plays directly.
					var next = clip.source === "url" ? clip.url : clipUrls[slot];
					if (next === null || next === undefined || next === "") continue;
					if (video.getAttribute("src") !== next) {
						video.setAttribute("src", next);
						video.src = next;
					}
					// Both live clips keep playing: that is what makes the switch a
					// crossfade instead of a decoder stall.
					startPlayback(video);
				}
				announceWallpaper();
				sampleMedia(true);
			}

			/**
			 * Load one slot's clip. A file is stored and played from an object URL; a
			 * link plays directly.
			 * @param slot - 'idle' or 'work'.
			 * @param clip - the normalized clip.
			 * @param blob - the file bytes, when the clip is a local file.
			 * @returns a promise resolving to the resulting config.
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
			 * Merge a config patch, persist it, and repaint. Clip fields address one
			 * slot (`slot`, defaulting to `idle`); the rest are shared knobs.
			 * @param patch - partial config.
			 * @returns the resulting config.
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
				// Visibility is the single knob for "how much wallpaper you see": it sets
				// the clip's own strength AND how far the theme yields to it, so the two
				// halves of one perception can never disagree. `opacity` and `clarity`
				// stay writable for scripts.
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
			 * Install a picked file into one slot: store the blob, play it from an
			 * object URL.
			 * @param file - the chosen File/Blob.
			 * @param name - its display name.
			 * @param slot - 'idle' (default) or 'work'.
			 * @returns a promise resolving to the resulting config.
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
			 * Forget one slot (default: both) plus its stored bytes.
			 * @param slot - 'idle', 'work', or undefined for both.
			 * @returns a promise that settles when the stored blobs are gone.
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
			 * Restore the persisted config at mount, then the stored files it names.
			 * A config that outlived its bytes is cleared honestly rather than left
			 * pointing at nothing. The v1 single-file shape (top-level `source` and the
			 * bare `wallpaper` IndexedDB key) is migrated into the idle slot.
			 * @returns a promise that settles when the restore attempt is done.
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
							// The store itself is unavailable: keep the config and let the
							// stage show the gradient rather than deleting a valid choice.
							if (result.available !== true) return undefined;
							if (result.blob === null) return dropSlot(target);
							return installClip(target, wallpaper.clips[target], result.blob).then(function (config) {
								if (useLegacy && target === "idle") return dropLegacyClip().then(function () { return config; });
								return config;
							});
						});
					})(slot, legacy));
				}
				return Promise.all(jobs).then(function () { return videoConfig(); });
			}

			/** Clear one slot whose stored bytes are missing. */
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
			/** Push the current panel config to every listener (the settings row). */
			function announcePanels() {
				var snapshot = panelConfig();
				var found = { left: panelFound.left, main: panelFound.main, right: panelFound.right };
				for (var i = 0; i < panelListeners.length; i++) {
					try { panelListeners[i](snapshot, found); } catch (error) { /* one bad row must not stop the rest */ }
				}
			}

			/** @returns a deep copy of the live panel config. */
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
				return copy;
			}

			/** @returns which shell columns were found, for the row and for debugging. */
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
					/** Which element each panel's material was handed to, for diagnosis. */
					surfaceDetail: detail,
					config: panelConfig()
				};
			}

			/**
			 * Tag page-like content surfaces for frosting. A settings page is a big
			 * surface and frosted glass suits it; the small file-diff popover is not,
			 * and blurring its backdrop is what made the diff hard to read. Size is the
			 * only signal that separates them without guessing class names.
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
			 * Find the three shell columns and stamp our own hooks on them. The
			 * shell's class local names are the lookup, our attributes are the contract:
			 * every style rule then reads a name this plugin owns.
			 * @param deep - also probe for an inner surface and mount the light sweep.
			 * @returns the found map.
			 */
			function tagPanels(deep) {
				if (disposed) return panelFound;
				var frame = doc.querySelector('[class*="_frame"]');
				if (frame !== null && frame !== undefined) frame.setAttribute("data-glass-frame", "");
				var rebuilt = false;
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var node = doc.querySelector(PANEL_SELECTOR[key]);
					if (node === null || node === undefined) {
						panelFound[key] = false;
						panelNodes[key] = null;
						continue;
					}
					// A collapsed (or not yet laid out) column is left completely alone: no
					// clipping, no margin, no material. It comes back on the next pass once
					// it has a real width again.
					if (!columnUsable(node)) {
						panelFound[key] = false;
						panelNodes[key] = null;
						if (node.getAttribute("data-glass-panel") !== undefined && node.getAttribute("data-glass-panel") !== null) node.removeAttribute("data-glass-panel");
						if (node.getAttribute("data-glass-delegate") !== undefined && node.getAttribute("data-glass-delegate") !== null) node.removeAttribute("data-glass-delegate");
						var stale = panelSurfaces[key];
						if (stale !== null && stale !== undefined) stale.removeAttribute("data-glass-surface");
						panelSurfaces[key] = null;
						continue;
					}
					panelFound[key] = true;
					if (panelNodes[key] !== node) rebuilt = true;
					panelNodes[key] = node;
					node.setAttribute("data-glass-panel", key);
				}
				if (deep === true || rebuilt) discoverSurfaces();
				// A rebuilt shell also needs the wallpaper stage moved back inside it.
				ensureStageHost();
				return panelFound;
			}

			/**
			 * @param node - a shell column.
			 * @returns whether it is wide enough to be treated as a panel. When the box
			 * cannot be measured the column is assumed usable, so a plain DOM still gets
			 * the full treatment.
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
			 * @param node - a candidate surface.
			 * @returns whether it is still in the document (so its material still lands
			 * somewhere visible). Falls back to a parent walk for stub DOMs.
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
			 * Hand each panel's material to the element that actually paints it. Without
			 * this the sidebar's own surface stays on top of the column, so that panel's
			 * opacity and blur knobs move values nobody can see.
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
					// Keep the surface we already handed the material to. Re-probing on every
					// pass made the panel's opacity flicker between two values, because a probe
					// that finds nothing leaves the inner layer's own (now protected, nearly
					// opaque) fill in charge.
					if (surfaceAttached(sticky)) {
						if (sticky.getAttribute("data-glass-surface") !== key) sticky.setAttribute("data-glass-surface", key);
						column.setAttribute("data-glass-delegate", "on");
						continue;
					}
					var painters = paintersIn(win, column);
					var next = painters.length === 0 ? null : painters[painters.length - 1];
					// Hand the material to the column and hollow the painters instead, when the
					// painter cannot see past itself.
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
					column.setAttribute("data-glass-delegate", "on");
				}
			}

			/** @returns the color scheme the presenter currently has on the body. */
			function currentScheme() {
				try {
					return doc.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
				} catch (error) {
					return "light";
				}
			}

			/**
			 * Publish everything the panel CSS reads. Called on start, on every panel
			 * change, on every mood commit and on every scheme flip, so the variables
			 * are always the current truth rather than a snapshot of boot time.
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
				style.setProperty("--gm-gap", panels.gap + "px");
				style.setProperty("--gm-frame-radius", panels.frameRadius + "px");
				style.setProperty("--gm-radius", panels.panelRadius + "px");
				style.setProperty("--gm-refract", panels.refraction ? "url(#" + REFRACTION_ID + "-filter)" : "none");
				// With refraction on, the frost gives up a little blur so the edge reads
				// as a lens rather than as extra blur (the knob used to look like a
				// blur switch, which is exactly what it must not be).
				style.setProperty("--gm-blur-scale", panels.refraction ? "0.86" : "1");
				// One switch for content-derived colour: it drives both the pane and the rim.
				var spillSample = panels.rimSpill === true ? mediaSample : null;
				for (var i = 0; i < PANEL_KEYS.length; i++) {
					var key = PANEL_KEYS[i];
					var panel = panels[key];
					style.setProperty("--gm-panel-" + key + "-blur", panel.blur + "px");
					style.setProperty("--gm-panel-" + key + "-sheen", String(panel.sheen));
					var fill = panelFill(key, scheme, panels, wallpaper.clarity, wallpaperOn, moodNow, spillSample, prefers.reducedTransparency);
					style.setProperty("--gm-panel-" + key + "-fill", fill);
					// The effective alpha is what the row prints, so the slider always
					// shows the truth even while it is following the palette.
					panelAlphaCache[key] = effectiveAlpha(fill);
					style.setProperty("--gm-panel-" + key + "-alpha", String(panelAlphaCache[key]));
					// The rim's contact shadow carries the highlight knob's weight outside
					// the panel, where a white hairline on a white surface cannot read.
					var contact = Math.round((scheme === "dark" ? 0.44 : 0.22) * panel.sheen * (moodNow === "work" ? 1.15 : 0.9) * 1000) / 1000;
					style.setProperty(
						"--gm-panel-" + key + "-shadow",
						"0 10px 28px -14px rgba(" + (scheme === "dark" ? "0,0,0" : "84,94,124") + "," + contact + ")"
					);
				}
				var rim = panelRim(moodNow, scheme, spillSample);
				style.setProperty("--gm-rim-a", rim.a);
				style.setProperty("--gm-rim-b", rim.b);
				style.setProperty("--gm-rim-c", rim.c);
				style.setProperty("--gm-rim-edge", rim.edge);
				style.setProperty("--gm-rim-ao", rim.ao);
				style.setProperty("--gm-rim-contact", rim.contact);
				style.setProperty("--gm-divider", rim.divider(panels.divider));
			}

			/**
			 * List every ancestor of a node that forms a BACKDROP ROOT. A backdrop-filter
			 * can only see what is painted inside its own root, so an ancestor carrying
			 * `contain: paint`, a filter, opacity, isolation, a mask or a blend mode
			 * leaves the frost with nothing to blur — the one failure a computed
			 * `backdrop-filter` value cannot reveal on its own.
			 * @param node - the element the frost is hosted on.
			 * @returns a list of `tag.class: property=value` entries, nearest first.
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

			/** @returns the alpha of a computed rgba() colour, for the row's readout. */
			function effectiveAlpha(color) {
				var match = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/.exec(color);
				return match === null ? 1 : Math.round(Number(match[1]) * 1000) / 1000;
			}

			/**
			 * Merge a panel patch, persist it, and repaint.
			 * @param patch - partial panel config.
			 * @returns the resulting config.
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
				panels = normalizePanels(merged);
				writeKey(PANEL_KEY, JSON.stringify(panels));
				tagPanels(true);
				syncPanels();
				announcePanels();
				return panelConfig();
			}

			/** Restore the persisted panel config, then publish it. */
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

			/** Mount the shared edge-refraction filter while this plugin lives. */
			function mountRefraction() {
				if (refractionMounted) return;
				var host = doc.createElement("div");
				host.setAttribute("data-glass-refraction", "");
				host.innerHTML = REFRACTION_SVG;
				doc.body.appendChild(host);
				refractionMounted = true;
			}
			//#endregion

			/** Mount everything this plugin owns. @returns the disposer. */
			function start() {
				if (started) return function () {};
				started = true;

				readPreferences();
				watchPreferences();
				// Never build on top of a previous instance.
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
				// Both clips mount up front: a mood switch is a crossfade, never a load.
				for (var v = 0; v < SLOTS.length; v++) {
					var video = doc.createElement("video");
					video.setAttribute("data-glass-clip", "none");
					video.setAttribute("data-glass-slot", SLOTS[v]);
					video.setAttribute("aria-hidden", "true");
					stage.appendChild(video);
					videos[SLOTS[v]] = video;
				}
				// `dim` is appended last on purpose: it is a legibility scrim over the
				// whole media stack, exactly as Apple prescribes for glass over bright media.
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
				// The panel material is part of the theme, not a mode: mount it with the
				// engine and re-find the columns whenever the shell rebuilds them.
				mountRefraction();
				restorePanels();
				tagBigSurfaces();
				ensureStageHost();
				retagTimer = deps.setInterval(function () {
					tagPanels();
					tagBigSurfaces();
					ensureStageHost();
				}, 2500);
				// Publish the wallpaper variables once even with nothing configured, so
				// the stage, the CSS defaults and the settings row always agree.
				renderWallpaper();
				restoreWallpaper();

				win.__dshGlassMood = {
					/** @returns the mood currently painted. */
					current: function () { return mood; },
					/** Pin a mood ('idle' | 'work') or clear the pin with '' — applies at once. */
					force: function (value) {
						try {
							if (value === "idle" || value === "work") storage.setItem(FORCE_KEY, value);
							else storage.removeItem(FORCE_KEY);
						} catch (error) { /* storage unavailable: the pin is simply not persisted */ }
						commit(desiredMood());
					},
					/** Re-read activity now (a manual poll). */
					refresh: evaluate,
					/** The live wallpaper config. */
					wallpaper: videoConfig,
					/** Merge a wallpaper config patch, e.g. { slot: 'work', url } or { clarity: 1 }. */
					setWallpaper: setWallpaper,
					/** Install a picked file: __dshGlassMood.setFile(file, file.name, 'work'). */
					setFile: setWallpaperFile,
					/** Remove one slot (`'idle'` / `'work'`) or both. */
					clearWallpaper: clearWallpaper,
					/** The live panel-material config. */
					panels: panelConfig,
					/** Which shell columns were found, plus the config. */
					panelStatus: panelStatus,
					/** Merge a panel patch, e.g. { main: { blur: 24 }, gap: 0 }. */
					setPanels: setPanels,
					/** Re-find the shell columns (after a layout change). */
					retag: tagPanels
				};

				return shutdown;
			}

			/**
			 * Undo everything this engine did: timers, subscriptions, hooks, variables,
			 * the stylesheet and the stage. This is also the panic switch, because a
			 * theme that can hide part of the app has to be removable without knowing
			 * why: `__dshGlassMood.off()`.
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
					if (retagTimer !== 0) {
						deps.clearInterval(retagTimer);
						retagTimer = 0;
					}
					if (poll !== 0) {
						deps.clearInterval(poll);
						poll = 0;
					}
					for (var u = 0; u < unsubscribes.length; u++) {
						try { unsubscribes[u](); } catch (error) { /* a dead source is already released */ }
					}
					unsubscribes.length = 0;
					if (layerDispose !== null) {
						try { layerDispose(); } catch (error) { /* the registry may already be gone */ }
						layerDispose = null;
					}
					for (var s = 0; s < SLOTS.length; s++) {
						var video = videos[SLOTS[s]];
						if (video !== undefined && video !== null) {
							try { video.pause(); } catch (error) { /* never started */ }
							video.removeAttribute("src");
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
					for (var df = 0; df < tagged.length; df++) tagged[df].removeAttribute("data-glass-delegate");
					var hollowed = doc.querySelectorAll("[data-glass-hollow]");
					for (var hl = 0; hl < hollowed.length; hl++) hollowed[hl].removeAttribute("data-glass-hollow");
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
					["--gm-gap", "--gm-frame-radius", "--gm-radius", "--gm-refract", "--gm-blur-scale", "--gm-rim-a", "--gm-rim-b", "--gm-rim-c", "--gm-rim-edge", "--gm-rim-ao", "--gm-rim-contact", "--gm-divider"].forEach(function (name) {
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
					doc.body.style.removeProperty("--gm-wall-fit");
					doc.body.style.removeProperty("--gm-wall-opacity");
					doc.body.style.removeProperty("--gm-wall-blur");
					doc.body.style.removeProperty("--gm-wall-scale");
					doc.body.style.removeProperty("--gm-tint");
					if (win.__dshGlassMood !== undefined) delete win.__dshGlassMood;
					// One clean-up path for both "unmount" and "a stray left behind": the
					// sweep also catches whatever a future layer adds.
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
				 * The alpha a panel is painting right now. In auto mode this is the
				 * palette's own alpha (thinned by the visibility budget), which is what
				 * the row must show instead of the -1 sentinel.
				 * @param key - panel key.
				 * @returns 0..1.
				 */
				panelOpacity: function (key) {
					return panelAlphaCache[key] === undefined ? 0 : panelAlphaCache[key];
				},
				setPanels: setPanels,
				panelStatus: panelStatus,
				retag: tagPanels,
				/** Re-probe for inner surfaces (after a layout change). */
				probe: discoverSurfaces,
				/** Re-scan for page-like surfaces worth frosting. */
				tagBigSurfaces: tagBigSurfaces,
				/** Computed backdrop-filter per panel: the blur diagnostic. */
				blurReport: blurReport,
				/** Show or hide the checkerboard that makes blur visible. */
				checker: checker,
				/**
				 * What the footage last read as, and the dim layer it earned. `ready`
				 * false means nothing was read (no clip, or a cross-origin clip).
				 * @returns the sampler state.
				 */
				media: function () {
					return {
						ready: mediaSample.ready,
						brightness: Math.round(mediaSample.brightness * 1000) / 1000,
						hue: mediaSample.hue === null ? null : Math.round(mediaSample.hue),
						saturation: Math.round(mediaSample.saturation * 1000) / 1000,
						dim: mediaSample.dim
					};
				},
				/** Panic switch: drop every hook and the stylesheet for this session. */
				off: shutdown,
				/** Clear anything a stray mount left in the DOM, without unmounting. */
				sweep: sweepOrphans,
				/**
				 * One line per panel explaining how the blur is hosted, for a person who
				 * cannot open a console.
				 * @returns a short human-readable summary.
				 */
				blurSummary: function () {
					var lines = [];
					for (var i = 0; i < PANEL_KEYS.length; i++) {
						var key = PANEL_KEYS[i];
						var label = key === "left" ? "\u5de6\u4fa7\u680f" : (key === "main" ? "\u4e3b\u9762\u677f" : "\u53f3\u4fa7\u680f");
						var host = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : panelNodes[key];
						if (host === null || host === undefined) {
							lines.push(label + "\uff1a\u672a\u8bc6\u522b");
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
						var where = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? "\u5185\u5c42\u5143\u7d20" : "\u5217\u81ea\u8eab";
						var why = panelDiag[key].length === 0 ? "" : "\uff0c\u539f\u56e0\uff1a" + panelDiag[key][0];
						lines.push(label + "\uff1a\u6750\u8d28\u5728" + where + "\uff0c\u6a21\u7cca " + (asked === "" ? "?" : asked) +
							"\uff08\u5143\u7d20\u8ba1\u7b97\u503c " + computed + "\uff0c::before " + pseudo + "\uff09\uff0c\u9762\u677f alpha " + alpha + why);
					}
					return lines;
				},
				/** The two accessibility preferences this theme answers. */
				preferences: function () {
					return { reducedTransparency: prefers.reducedTransparency, moreContrast: prefers.moreContrast };
				},
				/** Re-read them now (a system change can be picked up on demand). */
				refreshPreferences: applyPreferences,
				/** Register a listener for wallpaper changes; returns an unsubscribe. */
				subscribeWallpaper: function (listener) {
					wallpaperListeners.push(listener);
					return function () {
						wallpaperListeners = wallpaperListeners.filter(function (entry) { return entry !== listener; });
					};
				},
				/** Register a listener for panel changes; returns an unsubscribe. */
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
		 * A slider with a numeric readout. Every knob prints its value, because "drag
		 * until it looks right" is not a setting — especially for values like opacity
		 * and radius that the eye cannot put a number on.
		 * @param value - the current value.
		 * @param step - the slider step; drives the printed precision.
		 * @returns the display string.
		 */
		function formatValue(value, step, unit) {
			var number = Number(value);
			if (!Number.isFinite(number)) return "";
			var text = step >= 1 ? String(Math.round(number)) : number.toFixed(2);
			return unit === undefined || unit === null || unit === "" ? text : text + unit;
		}
		/**
		 * The wallpaper preference row for the General settings section.
		 *
		 * `settings.general.item` passes no owner props and projects no label, so the
		 * row owns its copy, its state and its write path: it renders the controls and
		 * talks to the engine (same module closure) directly. React is required from
		 * the shell, and the row is skipped when it is unavailable.
		 * @param React - the shell React namespace.
		 * @param engine - the live engine.
		 * @returns a row component.
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

				// Commit from the event value, never from the rendered state: the
				// keystroke that triggers the commit may be newer than this closure.
				var commitUrl = function (slot, value) {
					var next = String(value === undefined || value === null ? "" : value).trim();
					setDrafts(function (current) {
						var merged = { idle: current.idle, work: current.work };
						merged[slot] = next;
						return merged;
					});
					setConfig(engine.setWallpaper({ slot: slot, url: next }));
				};
				// A commit without a readable field value does nothing rather than
				// clearing a working wallpaper.
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
									try { win.console.warn("[glass-mood] 壁纸文件较大（" + Math.round(file.size / 1048576) + "MB），写入浏览器存储可能较慢"); } catch (error) { /* no console */ }
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
						// Footage this bright earns a legibility scrim (capped at 35%); the
						// switch is here so it can be judged, and switched off, live.
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
		 * Contribute the wallpaper row, if the settings slot and React are available.
		 * The row is additive and never replaces a shipped cell (`id` is ours).
		 * @param ctx - the client context.
		 * @param engine - the live engine.
		 */
		function registerWallpaperRow(ctx, engine) {
			var slots = getService(ctx, "slots");
			if (slots === undefined || slots === null || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
			var React = null;
			try { React = require("react"); } catch (error) { React = null; }
			if (React === null || React === undefined || typeof React.createElement !== "function") return;
			var Row = createWallpaperRow(React, engine);
			// `transcript-view` owns 12 and `developer-tools` owns 15: 13 sits between,
			// right after the stock Appearance and font-size rows.
			slots.inject("settings.general.item", function () {
				return slots.register({ name: "settings.general.item", id: "glass-mood-wallpaper", order: 13 }, Row);
			});
		}
		//#endregion

		/**
		 * The panel-material and light row for the General settings section.
		 *
		 * Same contract as the wallpaper row: no owner props, no projected label, so
		 * the row owns its copy, its state and its write path. Each control writes
		 * one field of the engine's panel config.
		 * @param React - the shell React namespace.
		 * @param engine - the live engine.
		 * @returns a row component.
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
				var checkerState = useState(false);
				var checkerOn = checkerState[0];
				var setCheckerOn = checkerState[1];
				var status = useState(engine.panelStatus().found);
				var found = status[0];
				var setFound = status[1];

				useEffect(function () {
					// A deep re-tag: opening the row is the moment to re-probe for the
					// element that actually paints each panel.
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
						// The slider shows the EFFECTIVE alpha, so its number matches what
						// is on screen even while the panel follows the palette.
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

				return h("div", { className: "gm-row" },
					h("div", null,
						h("div", { className: "gm-row-title" }, "玻璃主题 · 面板与光感"),
						h("div", { className: "gm-row-hint" }, hint),
						// The blur can fail in a way no computed value reveals (an element
						// under `contain: paint` cannot see the wallpaper), so the row says
						// out loud where the material ended up and why. No console needed.
						h("div", { className: "gm-row-hint" }, "模糊挂载：" + engine.blurSummary().join("；"))
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
						toggle("按压形变", config.press !== false, function (value) { setConfig(engine.setPanels({ press: value })) }),
						// A self-test anyone can read by looking: with a checkerboard behind
						// the panels, a panel whose blur works turns the squares smooth.
						toggle("棋盘格自检", checkerOn, function (value) {
							setCheckerOn(value === true);
							engine.checker(value === true);
						})
					)
				);
			};
		}

		/**
		 * Contribute the panel row, if the settings slot and React are available.
		 * @param ctx - the client context.
		 * @param engine - the live engine.
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
		 * Client plugin body: mount the mood engine for this plugin's lifetime.
		 * The theme service is a hard dependency (nothing to style without it);
		 * the activity sources, the slots service and React are optional, so a
		 * missing one degrades instead of failing.
		 * @param ctx - browser cordis context.
		 */
		function apply(ctx) {
			if (typeof document === "undefined" || document === null || typeof window === "undefined" || window === null) return;
			var theme = getService(ctx, "theme");
			if (theme === undefined || theme === null || typeof theme.overrideTokens !== "function") return;

			// A live reload can call apply() again without disposing the previous effect.
			// Shut that instance down first, or its stage and stylesheet linger and the
			// interface ends up under two wallpapers.
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
