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
		/** How often the shell columns and the big surfaces are re-found. */
		var RETAG_MS = 2500;
		/** How often a column resize may cost a re-tag while an animation is running. */
		var RESIZE_THROTTLE_MS = 120;
		/** How much of the frame an expanded panel has to cover to be that panel. */
		var OVERLAY_MIN_SPAN = 0.6;
		/** How much of the frame's width a fullscreen panel covers (the expanded sidebar stays clear). */
		var FULLSCREEN_MIN_SPAN = 0.6;
		/** Its height, on the other hand, is the frame's: it sits below the caption and spans the rest. */
		var FULLSCREEN_MIN_HEIGHT = 0.85;
		/** Bounds for that search, so one probe stays cheap. */
		var FULLSCREEN_MAX_NODES = 260;
		var FULLSCREEN_MAX_DEPTH = 8;
		/** Bounds for the presentation-layer search. */
		var PRESENT_MAX_NODES = 400;
		var PRESENT_MAX_DEPTH = 10;
	/** Where a diagnostic build sends one report; nothing listens in normal use. */
	var REPORT_URL = "http://127.0.0.1:8791/glass-report";
	var REPORT_KEY = "dsh-glass-mood:last-report";
	var REPORT_MAX_POSTS = 14;
	/**
	 * The report is a debugging instrument, so it is OFF until a person turns it
	 * on: with this key unset, no layout event posts anything and nothing is
	 * stored. The manual entry point (`__dshGlassMood.postReport()`, or
	 * `setReports(true)` for the automatic ones) is the difference this switch
	 * exists to mark — an instrument nobody asked for is not diagnostics, it is
	 * an undocumented network call plus a 200KB DOM snapshot in storage.
	 */
	var REPORT_ENABLE_KEY = "dsh-glass-mood:report";
		/** How long the one-shot surface cross-fade window stays open (slowest fade + slack). */
		var FADE_WINDOW_MS = 1100;
		/**
		 * The build the settings row prints. It exists so "the fix did not work" can never
		 * be confused with "the new build never loaded": which one is on screen is visible
		 * in the UI, and a test keeps this in step with package.json.
		 */
		var BUILD = "1.53.0";
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
	 * Every per-panel variable suffix, in one list, so the writer and the two
	 * cleaners (sweep and dispose) can never disagree about what exists. The
	 * `rim` entry is the one that used to be written and then forgotten by both
	 * cleaners — harmless in effect, but a variable audit could not trust it.
	 */
	var PANEL_VAR_SUFFIXES = ["blur", "sheen", "fill", "alpha", "shadow", "rim"];
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
		 * The right panel's own presentation marker, read out of the app's bundle
		 * rather than guessed: `ui-sidebar-right` renders the panel element with
		 * `data-sidebar-right-panel={fullscreen ? "fullscreen" : "push"}` and
		 * `style={{ width: fullscreen ? "100vw" : width }}`, while its own stylesheet
		 * pins it `position:absolute; top:0; bottom:0; right:0` inside the right
		 * column (`.rightbarCol{min-width:0;position:relative;overflow:visible}`).
		 *
		 * So a fullscreen right panel is NOT the column: the column keeps its normal
		 * track underneath ("fullscreen covers the viewport while retaining the
		 * wide-screen columns underneath", per the same package's README) and the
		 * panel hangs left over the centre to cover it. Painting the material on the
		 * column therefore covers only the strip the panel used to occupy — which is
		 * exactly the reported "transparency and blur stop at the sidebar's old
		 * position". The selector is the app's own word for that layer.
		 */
		var RIGHT_PANEL_FULLSCREEN_SELECTOR = '[data-sidebar-right-panel="fullscreen"]';
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
			press: true,
			blurFallback: false,
			/**
			 * A panel whose material element holds a `position: fixed` control must
			 * not carry the frost itself: a backdrop-filter makes that element the
			 * containing block of every fixed descendant, which re-anchors the app's
			 * own floating controls (the sidebar's collapse control is one — it left
			 * the top bar and landed on top of the sidebar logo). The material is
			 * skipped for such a panel instead, and the reason is reported. Turn this
			 * off only to confirm the diagnosis: the control moves again.
			 */
			fixedGuard: true
		};
		/**
		 * The mood's own cast on the glass. Both palettes sit within a couple of per
		 * cent of neutral, so a mood swap used to be nearly invisible on the panes —
		 * what a person reads as "warm" or "cool" came almost entirely from the clip.
		 * This is the floor the material itself carries, so the glass follows the
		 * mood even with no wallpaper at all; the content's own hue (`rimSpill`) still
		 * rides on top of it.
		 */
		var MOOD_CAST = {
			idle: { hue: 38, mix: 0.1 },
			work: { hue: 206, mix: 0.2 }
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
		 * displaces the backdrop, with no pre-blur. Adding feGaussianBlur here is what
		 * made the toggle read as "more blur" instead of "refraction".
		 *
		 * What it can and cannot do, said plainly: a displacement map shifts the whole
		 * backdrop by one field, so over a smooth blurred wallpaper it is nearly
		 * invisible — Fresnel is a per-pixel field that grows toward the edge, and
		 * turbulence is not that. The visible edge work is therefore done in CSS (the
		 * four Fresnel bands on `::after`); this filter only adds the uneven, hand-made
		 * quality to the surfaces that carry it, and it rides the composer, the
		 * bubbles and the settings surface — never a panel column, where a `url()`
		 * the browser refuses would take the whole frost with it.
		 */
		var REFRACTION_SVG =
			'<svg id="' + REFRACTION_ID + '" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' +
			'<filter id="' + REFRACTION_ID + '-filter" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">' +
			'<feTurbulence type="fractalNoise" baseFrequency="0.016 0.02" numOctaves="1" seed="7" result="noise"/>' +
			'<feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>' +
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
		/* The frost is a veil, and a veil is what turns glass into milk: Apple's own
		   guidance (and every audit of it) puts translucency at "frost 10-25, above 30
		   reads as milky plastic". So the white layer stays thin and the separation is
		   earned the way the Clear variant earns it — by dimming what is behind the
		   glass, not by painting over it — with a small contrast lift to hold text.
		   Blur follows the same logic: Liquid Glass bends light, it does not haze it,
		   so the radius stays low enough for the footage to stay recognisable. */
		"body[data-glass-mood]{--gm-fade:520ms;--gm-blur:19px;--gm-sat:118%;--gm-contrast:1.03;--gm-frost:rgba(255,255,255,.055);--gm-rim-strong:rgba(255,255,255,.46);--gm-rim-soft:rgba(255,255,255,.16);--gm-halo:rgba(86,96,140,.10);--gm-tint:0.3;--gm-sheen-mood:0.92;--gm-refract:none}",
		"body[data-glass-mood=work]{--gm-fade:260ms;--gm-blur:10px;--gm-sat:128%;--gm-contrast:1.06;--gm-frost:rgba(214,234,255,.055);--gm-rim-strong:rgba(255,255,255,.55);--gm-rim-soft:rgba(150,200,255,.18);--gm-halo:rgba(24,72,132,.16);--gm-sheen-mood:1.08}",
		"body[data-ds-dark-theme][data-glass-mood]{--gm-frost:rgba(255,255,255,.04);--gm-rim-strong:rgba(255,255,255,.26);--gm-rim-soft:rgba(255,255,255,.10);--gm-halo:rgba(0,0,0,.30)}",
		"body[data-ds-dark-theme][data-glass-mood=work]{--gm-frost:rgba(150,200,255,.045);--gm-rim-strong:rgba(196,226,255,.30);--gm-rim-soft:rgba(150,200,255,.14);--gm-halo:rgba(0,0,0,.34)}",
			/* Reduced motion has to cut the mood crossfade too, and it must come after the
			   rules it overrides: equal specificity means the last declaration wins. */
			"@media (prefers-reduced-motion: reduce){body[data-glass-mood]{--gm-fade:1ms}}",
			/* An expanding column earns its material on the way, not in a jump. */
			"@media (prefers-reduced-motion: reduce){body[data-glass-panels] [data-glass-panel]{transition:none}}",
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
				"-webkit-backdrop-filter:blur(var(--gm-blur)) saturate(var(--gm-sat)) var(--gm-refract);" +
				"backdrop-filter:blur(var(--gm-blur)) saturate(var(--gm-sat)) var(--gm-refract);" +
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
			"body[data-glass-panels] [data-glass-panel]{position:relative;z-index:0;margin:var(--gm-gap) calc(var(--gm-gap) / 2) 0;border-radius:var(--gm-radius);overflow:hidden;box-shadow:var(--gm-panel-shadow,none);transition:border-radius 220ms cubic-bezier(.4,0,.2,1),background-color 220ms cubic-bezier(.4,0,.2,1),box-shadow 220ms cubic-bezier(.4,0,.2,1)}",
			/* A fullscreen right panel is an overlay, not a column, so the column must stop
			   drawing a card of its own — but it keeps its GUTTER, and that is load-bearing.
			   The layer inside it is positioned `top:0; right:0; bottom:0` against the
			   column's box, so the column's own gutter is what holds the expanded panel on
			   the same rhythm as every other card: the top and right gaps come from the
			   column's margins and the bottom one from the frame's `padding-bottom`.
			   Clearing the margins (which is what this rule used to do) left the panel
			   flush against the title bar while the frame's padding still held it off the
			   bottom — the reported "the top gap is gone but the bottom one is still
			   there". So the margins are deliberately NOT touched here, which also makes
			   the column's geometry identical in both modes.

			   `border-radius` is deliberately not touched either. It used to be set to 0,
			   from when the column WAS the panel in this mode — and because every panel
			   carries `transition: border-radius 220ms`, collapsing animated the column
			   from a square back to 12px. The material returns to the column at that same
			   moment, so the switch played as "square first, then it rounds off". Leaving
			   the radius alone means there is nothing to animate. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=right]{overflow:visible;box-shadow:none}",
			/* The column must also stop drawing its own rim and divider. That overlay is a
			   positioned `::after` — the LAST child, so it paints ABOVE the panel the app
			   presents — and the column is still only 447px wide here. Left alone it drew
			   its left-edge rim and its divider as a bright vertical line straight down
			   the middle of the expanded panel: exactly the seam between the old centre
			   panel and the old right panel, surviving into a mode where neither of those
			   boxes means anything. The contour and the rim belong to the layer now. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=right]::after{content:none}",
			/* While the right panel is presented full, the centre panel stays mounted but
			   must stop showing through it. The presentation layer is the app's own and may
			   be only part-transparent, so without this the centre pane reads as a ghost
			   behind the expanded panel — and its blur is what someone sees there, not the
			   expanded panel's. `visibility` and not `display`: the grid keeps its columns,
			   nothing reflows, and collapsing restores it. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=main]{margin-right:0;visibility:hidden}",
			/* Its rim stops being drawn too, rather than being left to `visibility` alone.
			   A hidden pane is supposed to leave nothing behind; the rim overlay is a
			   separate positioned child carrying both a shadow and a corner gradient, and
			   "the shadow of the old centre panel is still there" is exactly what it looks
			   like when it does. */
			"body[data-glass-panels] [data-glass-frame][data-rightbar-fullscreen] [data-glass-panel=main]::after{content:none}",
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
			"body[data-glass-panels] [data-glass-surface]{position:relative;z-index:0;border-radius:var(--gm-radius);overflow:hidden}",
			/* The contour has to be on the surface, not only on the column.
			   A delegated panel paints NO fill of its own (`background-color:transparent`),
			   so a corner radius on the column draws nothing — there is no paint to round.
			   The paint is on the inner surface, whose own radius is 0, and which sits
			   inside the column at exactly its size, so `overflow:hidden` on the column has
			   nothing to clip. The result is square corners on a panel that measures
			   `border-radius: 12px`: the radius was being asked of the one element that
			   paints nothing. Both round now, and the surface clips its own content. */
			/* A fullscreen right panel is positioned by the app: `position:absolute`,
			   anchored top/bottom/right inside the right column so it can hang left
			   across the centre and cover the frame. The generic surface rule just above
			   would answer `position:relative` and drop it back into the column's flow —
			   which does not merely misplace the material, it undoes the presentation the
			   app is drawing. This host therefore keeps the position the app gave it; the
			   extra attribute is what wins the specificity contest. */
			"body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{position:absolute}",
			/* The contour moves with the material. Two things make this look like ONE card
			   rather than a card inside a card:

			   1. It clips. The app gives the pane inside it its own
			      `--dsh-windows-content-radius` on the top-left corner only, so without a
			      clip the corner showed two nested arcs of different radii — the outer
			      glass and the inner pane. Clipping to the outer radius leaves one contour.
			      (The app's own note, "only fullscreen panels clip overflow for that
			      corner", is about the same corner.)
			   2. All four corners round. This rule used to say `R 0 0 R`, because the layer
			      was anchored to the window's right edge and rounding there would bite two
			      crescents of wallpaper out of nothing. That reason expired when the panel
			      gained its own gutter (see the max-width below): it now stops 6px short of
			      the edge, so the right side is a free edge like every other, and leaving it
			      square made the expanded panel the only pane on screen with two square
			      corners. */
			"body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{border-radius:var(--gm-radius);overflow:hidden}",
			/* The left side needs a gutter of its own. The layer's width comes from the
			   app (`100vw`, capped to `100vw - sidebar`), so the column's margins cannot
			   reach it — and without this the panel's left edge sat exactly on the sidebar
			   instead of holding the same gap as every other card. The cap shrinks by the
			   gap on each side of that seam: half of it is the sidebar's own right gutter
			   and the other half is this one. Windows-only, because the variable it reads
			   (`--dsh-windows-sidebar-width`) is only published there — the app's own cap
			   is Windows-only for the same reason. */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-surface][data-glass-fullscreen]{max-width:calc(100vw - var(--dsh-windows-sidebar-width) - var(--gm-gap) - var(--gm-gap) / 2)}",
			/* The pane inside a fullscreen panel brings its OWN top-left corner:
			   `[data-windows-titlebar] .OUqwTW_panel[data-sidebar-right-panel=fullscreen]
			    [data-dockkit-column="0"][data-dockkit-pane]{border-radius:var(--dsh-windows-content-radius) 0 0 0}`
			   — 16px, against this theme's 12px. Two arcs of different radii on the same
			   corner is the reported ghosting, and clipping cannot fix it: the pane sits
			   inside the panel, so `overflow:hidden` never reaches it.
			   So the pane follows the glass rather than the glass following the pane —
			   the radius knob stays in charge, and there is one contour. */
			/* `[data-windows-titlebar]` is not decoration here — it is what wins. The app's
			   own rule for this pane is
			     [data-windows-titlebar] .OUqwTW_panel[data-sidebar-right-panel=fullscreen]
			       [data-dockkit-column="0"][data-dockkit-pane]   → (0,5,0)
			   and the same rule written without that prefix is only (0,4,1), so it LOST and
			   the corner went on drawing two arcs while the test — which only checked that
			   the text existed — stayed green. Specificity is part of the contract. */
			/* NO radius at all, not "the same radius".
			   Only one element may own the contour. The glass (this layer) owns it; the pane
			   is the content container inside it and had its own arc from the app's
			   `--dsh-windows-content-radius` (16px). Matching it to 12px still left two arcs
			   whenever the two boxes were not pixel-identical — which a content container
			   never quite is. With no radius it cannot draw one, and since the pane sits at
			   exactly the layer's box, the layer's own `overflow:hidden` clips its square
			   corners away. */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-fullscreen] [data-dockkit-column=\"0\"][data-dockkit-pane]{border-radius:0}",
			/* One surface, not two. The pane paints a pale layer of its own
			   (`rgba(255,255,255,0.094)`), and two rounded rects of the SAME box and the
			   SAME radius stacked should coincide — but only one of them is transparent,
			   so the edge a person sees is the pane's, drawn just inside the glass's.
			   That sliver is what was left of the ghosting. It also means the opacity knob
			   was lying: set to 0 the pane still showed a white wash the knob could not
			   reach. The glass underneath is the surface; the pane is content. */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-fullscreen] [data-dockkit-pane]{background-color:transparent}",
			/* The rim follows too, with the sheen knob the right panel owns — otherwise the
			   expanded panel is the one pane on screen with a fill and a frost but no
			   edge light, which reads as flat paint rather than glass. */
			"body[data-glass-panels] [data-glass-fullscreen]{--gm-sheen:calc(var(--gm-panel-right-sheen) * var(--gm-panel-right-rim,1))}",
			/* The sidebar's surface is WIDER than its column. The app sizes it from the track
			   (measured: surface 269px inside a 260px column), because this theme insets the
			   column with a gutter. So its corner sits 9px outside the column and the column's
			   `overflow:hidden` cuts it into a short remnant — which is why the sidebar's
			   corner reads SMALLER than the centre panel's, even though both measure 12px.
			   Here the column owns the contour and the surface only paints. (The centre
			   column's surface is exactly its column's size, so its own 12px coincides and
			   costs nothing — but a surface that overlays its column must not round.) */
			"body[data-glass-panels] [data-glass-surface=left]{--gm-panel-blur:var(--gm-panel-left-blur);background-color:var(--gm-panel-left-fill);border-radius:0}",
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
			/* The blur the browser demonstrably honours: on the element that carries the
			   material, so the backdrop it samples is the same one the fill shows through. */
			/* The self-test must be able to prove itself: it forces a blur big enough to
			   destroy a 6px checkerboard, on whichever arrangement the panel uses. */
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
			/* The title bar is a PSEUDO-ELEMENT with an opaque fill, spanning the whole
			   window above every panel:
			     [data-windows-titlebar] .BynINW_frame:before{
			       content:""; height:var(--dsh-windows-titlebar-height);
			       background:var(--dsw-specific-sidebar-fill); inset:0 0 auto }
			   Everything else in this theme floats on the wallpaper, but that strip never
			   joined the system — and because its bottom edge is dead straight, a panel's
			   rounded corner sitting just below it reads as "a right-angled shadow pressed
			   onto the corner". It is the one opaque band in the whole arrangement, so it
			   goes transparent like the rest. Nothing about the drag region changes. */
			"[data-windows-titlebar] body[data-glass-panels] [data-glass-frame]::before{background:transparent}",
			/* The rim + divider overlay: `::after` is a positioned child, so it paints
			   ABOVE the column's in-flow content. A divider drawn as the column's own
			   inset shadow could not — the sidebar surface covered it, which is exactly
			   why the knob looked dead. Masking clips box-shadow to the ring, so the
			   outer contact shadow lives on the panel instead (see box-shadow above). */
		/* Fresnel, not a hairline. Grazing light is brightest exactly at the boundary
		   and falls off inward on a curve, so the rim is FOUR edge bands (one per
		   side) rather than one flat gradient across the panel: each band starts at
		   the perimeter and dies inside, and the corners — where two bands overlap —
		   catch the most light, which is what a real rounded edge does. Two corner
		   gradients carry the key light and its opposite, and two 1px fringes give
		   the edge its dispersion. The band is a few px wide on purpose: a 1px ring
		   reads as a border, not as glass. */
		"body[data-glass-panels] [data-glass-panel]::after," +
			"body[data-glass-panels] [data-glass-fullscreen]::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;" +
			"background:" +
			"linear-gradient(to bottom,var(--gm-rim-a) 0,var(--gm-rim-b) 18%,transparent 58%) top center/100% var(--gm-rim-band,10px) no-repeat," +
			"linear-gradient(to top,var(--gm-rim-c) 0,transparent 62%) bottom center/100% calc(var(--gm-rim-band,10px) * .7) no-repeat," +
			"linear-gradient(to right,var(--gm-rim-b) 0,transparent 62%) center left/var(--gm-rim-band,10px) 100% no-repeat," +
			"linear-gradient(to left,var(--gm-rim-c) 0,transparent 62%) center right/calc(var(--gm-rim-band,10px) * .7) 100% no-repeat," +
			/* The catch light used to be a FIXED 90x70 ellipse. Laid over a 12px corner its
			   curvature matches nothing, so the corner drew a second arc of its own — which
			   is the reported ghosting, and it was always the top-left one because this is
			   the only corner that carries a catch light (the bottom-right carries a shade).
			   With the panes set this transparent the rim is most of what a person sees, so
			   it dominated. It now scales with the panel's own radius, so it reads as the
			   corner catching light rather than as another contour. */
			"radial-gradient(calc(var(--gm-radius,20px) * 2.6) calc(var(--gm-radius,20px) * 2.1) at 0% 0%,var(--gm-rim-catch,rgba(255,255,255,.12)) 0,transparent 68%)," +
			"radial-gradient(120px 100px at 100% 100%,var(--gm-rim-shade,rgba(84,104,150,.07)) 0,transparent 66%);" +
			"opacity:calc(var(--gm-sheen) * var(--gm-sheen-mood,1) * var(--gm-sheen-edge,1));" +
			"box-shadow:inset 0 1px 0 var(--gm-rim-disp,var(--gm-rim-a)),inset 0 -1px 0 var(--gm-rim-warm,transparent)," +
			"inset 0 0 0 1px var(--gm-rim-edge),inset 0 -28px 56px -34px var(--gm-rim-ao)}",
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

		/**
		 * Whether an already-delegated surface still earns the material. The delegation
		 * was handed out from one measurement, and the layout moves under it: when the
		 * right panel goes fullscreen the column widens while the inner surface the
		 * material was handed to keeps its old width, so the pane's fill and blur stop
		 * covering the panel and the app's own paint shows through the rest.
		 * @param win - the window (supplies getComputedStyle).
		 * @param column - the column the material would fall back to.
		 * @param node - the surface currently holding the material.
		 * @returns true when it still covers the column and still paints.
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
			press: source.press === undefined ? PANEL_DEFAULTS.press : source.press === true,
			blurFallback: source.blurFallback === undefined ? PANEL_DEFAULTS.blurFallback : source.blurFallback === true,
			fixedGuard: source.fixedGuard === undefined ? PANEL_DEFAULTS.fixedGuard : source.fixedGuard === true
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
			// The mood's cast first, so the pane reads warm or cool on its own; the
			// content's hue then rides on top of it.
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
		 * Pull a colour toward the mood's own cast, leaving its alpha alone. The
		 * palette rows are close enough to neutral that a mood swap had almost no
		 * visible effect on the material: this is what makes the glass itself follow
		 * the wallpaper's warmth instead of waiting for the sampler.
		 * @param value - a CSS rgba() color.
		 * @param mood - 'idle' or 'work'.
		 * @returns the cast color, or the original when it is not a liftable rgba.
		 */
		function moodColorString(value, mood) {
			var match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value);
			if (match === null) return value;
			var cast = mood === "work" ? MOOD_CAST.work : MOOD_CAST.idle;
			var casted = tintTowardHue(Number(match[1]), Number(match[2]), Number(match[3]), cast.hue, cast.mix);
			return "rgba(" + casted[0] + ", " + casted[1] + ", " + casted[2] + ", " + match[4] + ")";
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
			b: biasColorString(moodColorString(dark ? "rgba(" + (work ? "198,224,255" : "255,255,255") + ",0.16)" : "rgba(" + (work ? "150,190,235" : "176,186,206") + ",0.34)", mood), spillHue, SPILL_MIX),
			c: biasColorString(moodColorString(dark ? "rgba(" + (work ? "150,200,255" : "255,246,238") + ",0.24)" : "rgba(" + (work ? "120,170,220" : "150,160,182") + ",0.42)", mood), spillHue, SPILL_MIX),
			ao: dark ? "rgba(0,0,0,0.5)" : "rgba(90,100,140,0.16)",
			edge: dark ? "rgba(0,0,0,0.34)" : "rgba(120,132,156,0.34)",
			contact: dark ? "rgba(0,0,0,0.42)" : "rgba(84,94,124,0.20)",
			/**
			 * Dispersion: the two 1px fringes a real edge splits light into — the cool
			 * one where the light enters (top), the warm one where it leaves (bottom).
			 * Kept to a few per cent: this is a hint of prism, not a rainbow.
			 */
			disp: dark ? (work ? "rgba(150,205,255,0.40)" : "rgba(255,240,222,0.34)") : (work ? "rgba(120,175,235,0.52)" : "rgba(255,247,235,0.46)"),
			warm: dark ? (work ? "rgba(120,170,225,0.26)" : "rgba(255,214,170,0.26)") : (work ? "rgba(150,195,240,0.30)" : "rgba(255,206,150,0.30)"),
			/** The corner nearest the key light, and the one furthest from it. Both stay
			 * faint: a corner glow large enough to notice is a haze over the content. */
			catch: dark ? (work ? "rgba(190,225,255,0.08)" : "rgba(255,252,246,0.07)") : (work ? "rgba(210,235,255,0.13)" : "rgba(255,255,255,0.12)"),
			shade: dark ? "rgba(0,0,0,0.13)" : "rgba(84,104,150,0.07)",
			/**
			 * How far the Fresnel band reaches inward. Apple's specular highlight is a
			 * glint with an amplitude of a few pixels, not a gradient across the panel:
			 * the band has to die within a handful of pixels or it reads as a wash (the
			 * first attempt at 18px did exactly that). The calm mood breathes a little
			 * wider, the decisive one is a crisp lens edge.
			 */
			band: work ? "7px" : "10px",
			/** The same rim with the edge switch off: a soft hairline, no dispersion. */
			softBand: work ? "4px" : "6px",
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
			/** The one-shot timer that parks the clip the crossfade has finished with. */
			var parkTimer = 0;
			var visibilityWatched = false;
			/** Watches the shell columns' size, so an opening sidebar is tagged at once. */
			var resizeObserver = null;
			var resizeTimer = 0;
			var lastResizeAt = -Infinity;
			var observedNodes = [];
			var layerDispose = null;
			var unsubscribes = [];
			/** One video element per mood slot: both exist so a switch never waits. */
			var videos = {};
			/** Object URLs this plugin created, one per slot. */
			var clipUrls = {};
		var wallpaper = normalizeVideo(null);
		var wallpaperListeners = [];
		/**
		 * What the last storage attempt could not do, in the row's own words. A
		 * picked file whose bytes are gone, or a store that refused the write, used
		 * to pass silently — the person only found out when the next restart
		 * dropped a choice they remember making.
		 */
		var wallpaperNotice = "";
			var panels = normalizePanels(null);
			var panelListeners = [];
			/** The alpha each panel currently paints, for the row's readout. */
			var panelAlphaCache = { left: 0, main: 0, right: 0 };
			/**
			 * What each slot's footage looks like — ONE READING PER SLOT, not one for
			 * whichever clip happens to be on screen.
			 *
			 * Sampling only the visible clip meant a mood switch carried the previous
			 * clip's hue and brightness for up to one sample interval (4s): the panes
			 * changed palette at once and then kept drifting toward the footage that had
			 * just gone, which is exactly what "the colour lags" looks like. Both slots
			 * are read on their own cadence, so a switch uses the colour it already has.
			 *
			 * `ready` stays false until a frame has actually been read, so nothing is
			 * ever guessed: an unreadable clip (a cross-origin URL taints the canvas)
			 * falls back to the neutral wash.
			 */
			function blankSample() {
				return { ready: false, brightness: 0.5, hue: null, saturation: 0, dim: 0, sampledAt: 0 };
			}
			var mediaSamples = { idle: blankSample(), work: blankSample() };
			/** @returns 'work' or 'idle': the slot the current mood is showing. */
			function activeSlot() {
				return mood === "work" ? "work" : "idle";
			}
			/** @param slot - a mood slot. @returns its last reading, never undefined. */
			function sampleFor(slot) {
				return mediaSamples[slot] === undefined || mediaSamples[slot] === null ? blankSample() : mediaSamples[slot];
			}
			var sampleCanvas = null;
			var prefers = { reducedTransparency: false, moreContrast: false };
			var preferenceLists = [];

		/**
		 * @param slot - the mood slot to read.
		 * @returns the clip element that serves it (the other slot's when one clip
		 * covers both moods), or null when there is no frame to read.
		 *
		 * Reading whichever slot happens to be first is why the material stopped
		 * following the wallpaper: with both clips configured the sampler always took
		 * the idle one, so in the work mood the panes and the rim kept the idle
		 * footage's hue (and its dimming) while a cold clip was playing behind them.
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
			/** Publish what the clip on screen implies: a dim layer for the media stack. */
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
			 * Read one downscaled frame and derive its brightness and hue. Throttled,
			 * and a no-op when the canvas is unavailable or the clip is unreadable.
			 * @param force - ignore the throttle (a new clip deserves a fresh reading).
			 * @returns whether a frame was read.
			 */
		function sampleMedia(force) {
			if (disposed) return false;
			var read = false;
			for (var i = 0; i < SLOTS.length; i++) {
				if (readSlot(SLOTS[i], force)) read = true;
			}
			publishMedia();
			// A fresh reading only re-tints the panes. The full republish also
			// re-decides where each panel's frost lives, and that decision is a
			// measured probe (one computed-style read per descendant): it belongs to
			// layout events, never to a timer that runs while nothing has moved.
			if (read) publishPanelColors();
			return read;
		}

			/**
			 * Read one frame of one slot into that slot's own reading.
			 * @param slot - 'idle' or 'work'.
			 * @param force - ignore the throttle (a new clip, or a mood switch).
			 * @returns whether the reading changed.
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
					// Tainted canvas (a cross-origin clip): stop guessing, use the wash.
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
				for (var s = 0; s < PANEL_VAR_SUFFIXES.length; s++) {
					doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[k] + "-" + PANEL_VAR_SUFFIXES[s]);
				}
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
			/** Where each panel's blur lives: "element" or "pseudo". */
			var panelBlurHost = { left: null, main: null, right: null };
			/** Set when a fixed descendant forced the pseudo arrangement. */
			var panelBlurNote = { left: [], main: [], right: [] };
			var reportPosts = 0;
			var reportTimer = 0;
			/**
			 * One report is taken from an ordinary layout, before anything is expanded.
			 * Every report before this was taken with the right panel presented full —
			 * the single mode in which the columns are NOT laid out the way they normally
			 * are — so a question about a corner in the normal layout had no evidence
			 * behind it at all, and answering it would have meant guessing again.
			 */
			var initialReported = false;
			/**
			 * Whether the right panel was presented full on the previous pass. A mode
			 * switch is the one moment a shadow can outlive the panel that cast it, and
			 * neither existing trigger covers it: `initial` fires once per session and
			 * `expanded` only ever fires while the mode is ON. So collapsing gets its own
			 * snapshot, taken just after the switch settles.
			 */
			var wasExpanded = false;

			/**
			 * Put the blur where it demonstrably works for this panel. A column keeps the
			 * pseudo arrangement (the one that was stable); a delegated inner surface
			 * takes the blur on itself, because a pseudo there reports a valid blur and
			 * samples nothing. The fixed-descendant condition is still measured — it is
			 * reported rather than allowed to silently move the blur somewhere useless,
			 * since a collapsed column is already left untouched by `columnUsable`.
			 * @param key - the panel key.
			 */
			function aimBlur(key) {
				var host = panelSurfaces[key] !== null && panelSurfaces[key] !== undefined ? panelSurfaces[key] : panelNodes[key];
				if (host === null || host === undefined || typeof host.setAttribute !== "function") return;
				/* ONLY ONE element of a panel may carry the frost, and the other candidate
				   has to give its marker back. This is the whole bug behind "the expanded
				   right panel has no blur":

				   An element with a `backdrop-filter` becomes a BACKDROP ROOT, and a
				   descendant's own `backdrop-filter` can then only sample what is painted
				   INSIDE that ancestor. A panel delegates its material to a layer inside
				   its column, so once the column keeps a frost of its own, the layer's
				   frost samples an empty backdrop — nothing. The measured result was the
				   reported symptom exactly: the column's own strip (447px, where the
				   sidebar used to be) blurred, and the 1183px layer actually covering the
				   frame blurred nothing at all.

				   `aimBlur` only ever touched the current host, so the marker the column
				   earned before the delegation was never taken off it. */
				var other = host === panelNodes[key] ? panelSurfaces[key] : panelNodes[key];
				if (other !== null && other !== undefined && other !== host && typeof other.removeAttribute === "function") {
					other.removeAttribute("data-glass-blur-host");
				}
				// Measured in this browser: a negative-z pseudo reports a valid blur and
				// samples nothing, on a delegated surface and on a column alike; the element
				// itself blurs. So the element carries it, and the one cost of that - it
				// becomes the containing block of its fixed descendants - is named here.
			if (panels.blurFallback === true) {
				host.removeAttribute("data-glass-blur-host");
				panelBlurHost[key] = "pseudo";
				panelBlurNote[key] = ["\u5df2\u6309\u8981\u6c42\u964d\u7ea7"];
				return;
			}
			// The scan is a getComputedStyle per descendant, so it only runs when the
			// frost is actually on: with the blur switched off nothing can re-anchor.
			var fixed = doc.body.dataset.glassBlur === "off" ? [] : fixedDescendants(host);
			// A backdrop-filter on the material element re-anchors every fixed
			// descendant to it. The app's own floating controls live inside these
			// columns (the sidebar collapse control is one), and re-anchoring moved it
			// out of the top bar onto the sidebar logo. Position beats frost: such a
			// panel keeps its fill and its rim, and goes without the blur.
			if (panels.fixedGuard === true && fixed.length > 0) {
				host.removeAttribute("data-glass-blur-host");
				panelBlurHost[key] = "none";
				panelBlurNote[key] = ["\u542b fixed \u5b50\u5143\u7d20\uff1a" + fixed.join("\u3001") + "\uff08\u5df2\u8df3\u8fc7\u78e8\u7802\uff0c\u4fdd\u4f4f\u5176\u5b9a\u4f4d\uff09"];
				return;
			}
			host.setAttribute("data-glass-blur-host", "element");
			panelBlurHost[key] = "element";
			panelBlurNote[key] = fixed.length === 0 ? [] : ["\u542b fixed \u5b50\u5143\u7d20\uff1a" + fixed.join("\u3001")];
			}
			var refractionMounted = false;
			var retagTimer = 0;
			var disposed = false;

		/**
		 * @returns whether the diagnostic report was switched on. Read live, so
		 * flipping the key takes effect on the next layout event without a restart.
		 */
		function reportsEnabled() {
			return readKey(REPORT_ENABLE_KEY) === "1";
		}

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
		 *
		 * The previous layer is retracted before the new one is stacked. The host
		 * documents one layer per source, restacked on every change; if that ever
		 * turns out to mean "stacked" rather than "replaced", the retract is what
		 * keeps the old values from surviving underneath — and a disposed engine
		 * must never re-add a layer, which is what the guard is for (a settings
		 * row outliving `off()` would otherwise resurrect half a theme).
		 */
		function applyTokens() {
			if (disposed) return;
			var pair = pairFor(mood === null ? "idle" : mood);
			if (hasWallpaperConfig(wallpaper)) pair = dimPair(pair, wallpaper.clarity);
			if (prefers.reducedTransparency) pair = solidifySurfaces(pair);
			if (prefers.moreContrast) pair = boostContrast(pair);
			if (layerDispose !== null) {
				try { layerDispose(); } catch (error) { /* the registry may already be gone */ }
				layerDispose = null;
			}
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
			// Both clips play through the switch, and the one that stops being shown
			// is parked once the fade is over.
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

		/**
		 * The two clocks this plugin runs, each startable and stoppable on its own:
		 * a hidden tab needs neither a poll nor a surface scan.
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
				// Deep as well: the tick is also the safety net for a layout that changed
				// without any column resizing (the app swapping an inner surface, say), and
				// a surface that still covers exits immediately instead of re-probing.
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
		 * Both slots play across a switch, so the crossfade has a frame to land on
		 * without waiting for a decoder.
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
		 * Park every clip that is not on screen. Two wallpapers decoding all day are
		 * felt on a laptop; one is not — and the crossfade survives it, because the
		 * incoming slot is primed first and the outgoing one only stops after the
		 * fade-out has run.
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
				// One clip serving both moods is never parked.
				if (entry.slot === "both") continue;
				parkSlot(slot);
			}
		}

		/** @param slot - the mood slot whose decoder may be released. */
		function parkSlot(slot) {
			var video = videos[slot];
			if (video === undefined || video === null) return;
			try { video.pause(); } catch (error) { /* never started */ }
		}

		/** Prime both slots, then release the one the fade has finished with. */
		function schedulePace() {
			primeSlots();
			if (parkTimer !== 0) clearTimer(parkTimer);
			parkTimer = setTimer(function () {
				parkTimer = 0;
				paceSlots();
			}, FADE_WINDOW_MS + 80);
		}

		/** A hidden tab needs no decoder at all. */
		function pauseSlots() {
			for (var i = 0; i < SLOTS.length; i++) parkSlot(SLOTS[i]);
		}

		/**
		 * Stop every clock and decoder while the tab is hidden, and bring them back
		 * on the next visible frame. A wallpaper is the last thing that should be
		 * spending battery on a window nobody is looking at.
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
		 * Watch the columns' own size. The retag pass runs every 2.5s, which is fine
		 * for a shell that never changes and far too slow for one that does: an
		 * opening sidebar sat there as a plain column for a second before it got its
		 * radius and its material. A resize is the one signal that arrives in the same
		 * frame as the change.
		 *
		 * Debounced, because an animated sidebar fires every frame and a re-tag is a
		 * measured probe (each pass reads geometry and computed styles): 60ms is
		 * imperceptible and turns ~20 probes into one.
		 */
		function watchColumns() {
			if (win === undefined || win === null || typeof win.ResizeObserver !== "function") return;
			if (resizeObserver !== null) return;
			resizeObserver = new win.ResizeObserver(function () {
				if (disposed) return;
				// Leading edge, then at most one pass per throttle window. A trailing
				// debounce only fires once the animation STOPS — which is precisely the
				// "plain column that snaps at the end" this is here to prevent.
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
		 * Observe the three columns whether or not they currently qualify as panels:
		 * a collapsed rail is exactly the one that has to be watched, because it is
		 * the one that is about to change.
		 */
		function observeColumns() {
			if (resizeObserver === null || typeof doc.querySelector !== "function") return;
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var node = findColumn(PANEL_KEYS[i]);
				if (node === null || node === undefined) continue;
				if (observedNodes.indexOf(node) !== -1) continue;
				try {
					resizeObserver.observe(node);
					observedNodes.push(node);
				} catch (error) { /* a node the observer cannot take */ }
			}
		}

		/** One re-tag-and-republish pass, however many resizes asked for it. */
		function runResizePass() {
			lastResizeAt = now();
			// Deep, so the delegated surfaces are re-validated against the new column
			// widths: a resize is exactly the moment a delegation can go stale, and the
			// fullscreen right panel is the case that made this visible.
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
			startPolling();
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
				autoDim: wallpaper.autoDim,
				notice: wallpaperNotice
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
						/** "element" when the blur rides the material element, "pseudo" otherwise. */
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
				// Force a large blur while the self-test is on: the question is whether the
				// mechanism works on this panel, not what value someone happened to set.
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
			schedulePace();
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
			return writeStoredClip(slot, blob).then(function () { return videoConfig(); }, function () {
				// Quota, private mode, a store that refuses the write: the clip plays
				// from its object URL for this session, and the row says so instead of
				// letting the next restart silently drop the choice.
				wallpaperNotice = "文件仅在本次会话生效：浏览器存储不可用或空间不足";
				return videoConfig();
			});
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
			// A fresh pick is a fresh attempt: whatever the last one could not keep
			// is no longer what the row should be saying.
			wallpaperNotice = "";
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
			wallpaperNotice = "";
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
						if (result.available !== true) {
							wallpaperNotice = "浏览器存储不可用：已保存的壁纸文件无法恢复，可重新选择文件";
							return undefined;
						}
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
			wallpaperNotice = "有状态的壁纸文件已丢失（可能在别处被清理），该状态已重置";
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
			copy.blurFallback = panels.blurFallback;
			copy.fixedGuard = panels.fixedGuard;
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
			 * DIAGNOSTIC ONLY — never used to choose a host. It reports the deepest element
			 * that covers the frame while the right panel is presented full, from the app's
			 * own description of that presentation (a floating panel that leaves the centre
			 * width unchanged and sits below the caption, right of the expanded sidebar).
			 *
			 * It was tried as the host and it picked the CENTRE panel's content root, whose
			 * box is the centre column's, so the right panel's material landed on the centre
			 * panel and the blur seen through the expanded panel was the centre panel's own.
			 * It stays because it is what made that visible in a report.
			 * @returns the deepest frame-covering element that paints, or null.
			 */
			/**
		 * The layer that presents the right panel full. It covers the frame, it paints,
		 * and — the clause that matters — it does not belong to another panel. Without
		 * that last test the search returned the centre panel's own content root, whose box
		 * is simply the centre column's, and the right panel's material ended up on the
		 * centre panel: the blur seen through the expanded panel was the centre's own.
		 * @returns the deepest qualifying element, or null.
		 */
		/**
		 * Every element that could be the presentation layer, for the diagnostic. The
		 * finder answers "which one"; this answers "what was there at all", which is what
		 * turns a miss into a reading instead of another guess.
		 * @returns up to six descriptions.
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
				// Not inside another panel: that is what keeps the centre panel's own surfaces,
				// and the sidebar's, out of the running however large they are.
				if (insidePanel(node)) continue;
				var box = node.getBoundingClientRect();
				// A presentation panel is kept below the caption and to the right of the
				// sidebar, so it starts where the centre does and runs to the frame's right
				// edge. That one clause keeps whole-app wrappers (left edge 0) out.
				var centre = panelNodes.main;
				var centreBox = centre !== null && centre !== undefined && typeof centre.getBoundingClientRect === "function" ? centre.getBoundingClientRect() : null;
				var leftEdge = centreBox === null ? frameBox.left : centreBox.left;
				var inBand = box.left >= leftEdge - 12 && (box.left + box.width) >= (frameBox.left + frameBox.width) - 12;
				if (inBand && box.width >= frameBox.width * FULLSCREEN_MIN_SPAN && box.height >= frameBox.height * FULLSCREEN_MIN_HEIGHT) {
					// No paint test: the layer that presents a panel is a transparent
					// container and its children do the drawing. Requiring it to paint
					// itself rejected the one element that mattered — the live report came
					// back with no candidate at all.
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
		 * Whether a node belongs to one of the three panels. A presentation layer never
		 * does: it is the thing presented *instead* of them.
		 * @param node - the candidate.
		 * @returns true when a panel is one of its ancestors.
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
			 * The element that renders an expanded right panel. The app does not widen the
			 * column for that mode — the frame's grid is untouched and `rightbarFullscreen`
			 * only suppresses transitions and hides the drag handle — so the expanded panel
			 * is presented over the frame instead, in the shell's overlay layer. The column
			 * stays where it was, which is why the material used to sit on the old geometry
			 * while the expanded panel stayed bare and the main panel showed through it.
			 * @returns the largest frame-spanning child of the overlay, or null.
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
					// A toast or a notice also lives here; an expanded panel covers the frame.
					if (frameBox !== null && (box.width < frameBox.width * OVERLAY_MIN_SPAN || box.height < frameBox.height * OVERLAY_MIN_SPAN)) continue;
					var area = box.width * box.height;
					if (area > bestArea) { bestArea = area; best = child; }
				}
				return best;
			}

			/**
			 * Every descendant of a panel that carries a corner radius of its own.
			 *
			 * A corner that reads as TWO arcs always means two radii, and the second one is
			 * never the panel's — it belongs to something inside it, at an unknown depth,
			 * which no amount of squinting at a screenshot will name. This names it.
			 * @returns up to 24 entries, with the box so a wrong one can be ruled out.
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
					/* Only something big enough to reach a corner can draw a second one. The
					   first run of this audit spent all 24 slots on the sidebar's buttons and
					   session rows (28x28, 256x32) and never got to the other two panels at
					   all — a useful lesson: an audit that cannot say "nothing here" is worse
					   than none, because it looks like an answer. */
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
			 * A short, bounded description of one element: what it is, what it says about
			 * itself, where it is, and the CSS that decides what it paints and how it stacks.
			 * @param node - the element.
			 * @returns a plain object, or null when it cannot be read.
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
								/* A shadow and a visibility were both invisible to this report,
								   which is why a shadow surviving a mode switch could only ever
								   be guessed at. Both are read from now on. */
								shadow: String(style.boxShadow ?? ""),
								visibility: String(style.visibility ?? "")
						};
					}
				}
				return out;
			}

			/**
			 * Walk a subtree breadth-first into a bounded list, so one report can answer
			 * "what is actually on screen and who paints it" without a console.
			 * @param node - the subtree root.
			 * @param max - how many elements to describe.
			 * @returns the list, root first.
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
			 * Everything the expanded-right-panel question needs: the frame's shape, the
			 * overlay layer if there is one, the right column's subtree, and what this plugin
			 * decided for each panel.
			 * @returns a plain object safe to send as JSON.
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
					// The gutter every card is supposed to agree on, so "the gaps do not
					// match" can be read off the report instead of eyeballed.
					gap: panels.gap,
					expanded: rightbarExpanded(),
					frame: describeNode(frame),
					/* The title bar lives on a pseudo-element, which `describeNode` can
					   never see. It carried an opaque fill for the whole life of this theme
					   while every report said the frame was transparent — a blind spot that
					   cost a full round trip. Read it explicitly. */
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
					/* The rim is a pseudo-element too, and it is the only other thing drawing
					   into the same corner as the glass. When the pane is nearly transparent
					   the rim is most of what is left on screen, so "there are two arcs" can
					   only be settled by reading it. */
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
					// What the app itself calls the fullscreen panel, beside the two
					// geometry guesses above: when they disagree, the app wins.
					fullscreenPanel: describeNode(fullscreenRightPanel()),
					presentationLayer: describeNode(presentationLayerNode()),
					presentationCandidates: presentationCandidates(),
					// Which element inside a panel is drawing a SECOND corner.
					cornerAudit: cornerAudit(),
					/* Anything still wearing the fullscreen marker, whether or not this pass
					   handed it the material. The marker drives a rim, so one left behind
					   after the mode ends is a shadow that outlived its panel — which is
					   exactly what "the old panel's shadow is still there" would look like. */
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
				// The largest elements on screen, so "which layer is the panel" is answered by
				// the data rather than by another guess.
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
				// The centre column too: a question about ITS corners could not be answered
				// from a report that only ever walked the right one.
				var mainColumn = panelNodes.main;
				if (mainColumn !== null && mainColumn !== undefined) report.mainColumn = describeTree(mainColumn, 12);
				for (var k = 0; k < PANEL_KEYS.length; k++) {
					var key = PANEL_KEYS[k];
					var node = panelNodes[key];
					report.panels[key] = {
						node: describeNode(node),
						delegated: panelSurfaces[key] !== null && panelSurfaces[key] !== undefined,
						surface: describeNode(panelSurfaces[key]),
						// What the knobs were ASKED for, beside what the CSS resolved: an
						// alpha of 0 in the fill is a person's own setting until this says
						// otherwise, and the two must never be confused.
						asked: {
							opacity: panels[key] === undefined || panels[key] === null ? null : panels[key].opacity,
							blur: panels[key] === undefined || panels[key] === null ? null : panels[key].blur
						},
						// Anything that would make the frost sample nothing.
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
			 * Send one report and keep a copy locally, so a blocked request still leaves the
			 * evidence somewhere the row can point at.
			 * @param reason - what asked for it, recorded in the payload.
			 */
			function postDomReport(reason, force) {
				/* The ordinary-layout snapshot is exempt from the cap on purpose. That cap
				   exists so an expanded panel does not flood the receiver, but it also meant
				   the one report worth most never arrived: the app restores the right panel
				   expanded, so six `expanded` reports were spent within a second of loading
				   and the snapshot of a NORMAL layout — the only evidence that can answer a
				   question about a corner in a normal layout — was silently dropped. */
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
				} catch (error) { /* a full quota costs the copy, not the report */ }
				if (typeof win.fetch !== "function") return;
				try {
					var sent = win.fetch(REPORT_URL, { method: "POST", body: text, mode: "cors", headers: { "content-type": "text/plain" } });
					if (sent !== undefined && sent !== null && typeof sent.catch === "function") sent.catch(function () { /* nothing listening */ });
				} catch (error) { /* nothing listening */ }
			}

	/**
	 * Find one shell column. The right column is asked twice on purpose: a comma
	 * list hands back whichever match comes first in DOCUMENT order, so the app's
	 * own data hook can lose to a hashed class name that merely sits earlier in
	 * the tree. The data hook is the app's word for this column, so it is asked
	 * first and alone; the class name is the fallback.
	 * @param key - panel key.
	 * @returns the column element, or null.
	 */
	function findColumn(key) {
		if (key === "right") {
			var marked = null;
			try { marked = doc.querySelector("[data-rightbar-col]"); } catch (error) { marked = null; }
			if (marked !== null && marked !== undefined) return marked;
		}
		try { return doc.querySelector(PANEL_SELECTOR[key]); } catch (error) { return null; }
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
				/* Three attempts at finding the expanded right panel by geometry are recorded
				   here as failures, because all three moved the material onto the wrong
				   element: a "deepest element that covers the frame" search picked the
				   centre panel's own content root (1701x1500 — the centre column's box), so
				   the blur seen through the expanded panel was the centre's own; a
				   "frame-spanning child of the overlay layer" search found nothing, because
				   the app's overlay layer carries toasts, not this panel; and a
				   "presentation band" rule found nothing either.
				   The column is the column in every mode — the app keeps its grid track
				   underneath a fullscreen panel — so nothing is reassigned here. What
				   changes in that mode is only WHERE THE MATERIAL IS PAINTED, and that is
				   decided in `discoverSurfaces()` from the app's own marker. */
			/* Every automatic report sits behind the switch. The ordinary-layout
			   snapshot in particular used to fire once per session with no way to
			   say no — a debugging instrument had become part of the default cost
			   of running the theme. `wasExpanded` still tracks the mode either
			   way, so switching the report on mid-session catches the next one. */
			if (reportsEnabled()) {
				// The mode that keeps being reported as broken gets measured once, on entry
				// and again a moment later so a late layout is included.
				if (rightbarExpanded() === true && deep === true && reportTimer === 0) {
					reportTimer = setTimer(function () { reportTimer = 0; postDomReport("expanded"); }, 900);
				}
				// The ordinary layout, measured once per session while it is still ordinary.
				if (deep === true && initialReported === false && rightbarExpanded() !== true) {
					initialReported = true;
					setTimer(function () { postDomReport("initial", true); }, 1500);
				}
				/* Just after collapsing. This is the snapshot the "the shadow of the old
				   panel is still there" question needs: whatever survived the switch is
				   still on screen here, and nothing else was looking at it. */
				if (deep === true && wasExpanded === true && rightbarExpanded() !== true) {
					setTimer(function () { postDomReport("collapse", true); }, 400);
				}
			}
				wasExpanded = rightbarExpanded();
				var rebuilt = false;
			for (var i = 0; i < PANEL_KEYS.length; i++) {
				var key = PANEL_KEYS[i];
				var node = findColumn(key);
					// Whoever held this panel before gives the hooks back: a stale host must
					// not keep a pane painted where the panel no longer is.
					var previous = panelNodes[key];
					if (previous !== null && previous !== undefined && previous !== node) {
						previous.removeAttribute("data-glass-panel");
						previous.removeAttribute("data-glass-delegate");
						if (panelSurfaces[key] !== null && panelSurfaces[key] !== undefined) {
							panelSurfaces[key].removeAttribute("data-glass-surface");
							// The marker goes too, or the layer keeps a position this plugin
							// was only holding for it while the mode was on.
							panelSurfaces[key].removeAttribute("data-glass-fullscreen");
							panelSurfaces[key] = null;
						}
					}
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
			// A rebuilt shell also needs the wallpaper stage moved back inside it.
			ensureStageHost();
			// Whatever this pass found, the next resize has to arrive in the same frame.
			observeColumns();
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
			 * Whether the app has the right panel expanded over the frame. In that mode
			 * the app caps the column at 70% of the viewport and squeezes the centre to
			 * 400px, while the panel's own content keeps a narrower width than the column
			 * it now sits in — so the material has to stay on the column, which is the
			 * only element that spans the mode.
			 * @returns true while the frame reports the expanded right panel.
			 */
			function rightbarExpanded() {
				if (typeof doc.querySelector !== "function") return false;
				try {
					// The app writes this attribute on the frame and nowhere else, so it is
					// queried on its own rather than through a class name.
					return doc.querySelector("[data-rightbar-fullscreen]") !== null;
				} catch (error) {
					return false;
				}
			}

		/**
		 * The element that renders the right panel while it is presented full.
		 *
		 * Nothing here is measured against the frame or ranked by area: both of those
		 * were tried and both picked the CENTRE panel (its content root shares the
		 * centre column's box), which handed the right panel's material to the wrong
		 * panel. The app names the layer itself, so the lookup is that name.
		 *
		 * Several session subtrees can be mounted at once ("only the foreground
		 * subtree reports a frame track; other subtrees stay hidden"), so the visible
		 * one is the largest box that is actually laid out — a hidden subtree collapses
		 * to nothing and cannot win.
		 * @returns the fullscreen panel element, or null when the mode is off.
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
					/* A right panel presented full is a layer the app positions over the frame,
					   not the column: the column keeps its own track underneath and the layer
					   hangs left across the centre to cover it (see the note on
					   RIGHT_PANEL_FULLSCREEN_SELECTOR). Material left on the column covers the
					   strip the panel used to occupy and nothing else — the reported "the
					   transparency and the blur stop at the sidebar's old position" — so here
					   it moves onto the layer.

					   The layer paints nothing of its own, which is why the ordinary probe
					   never found it: a probe looks for an element that already paints, and
					   this one is a transparent container whose children do the drawing. The
					   fill is what turns it into a painter, and from that moment it
					   re-validates like any other delegated surface. */
					var full = key === "right" ? fullscreenRightPanel() : null;
					if (key === "right" && (full === null || full === undefined)) {
						/* The mode went off, so the layer hands everything back — the material,
						   the marker, and the position this plugin was holding for it. This is
						   done here rather than left to the re-validation below on purpose:
						   the layer still covers the column once it has been given a fill, so
						   it would look like a perfectly valid surface and keep the material
						   in ordinary `push` mode too — where it would also lose the absolute
						   position the app anchors it with, since that is what the marker
						   protects. The column's own rules take over from here. */
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
						// Still measured, still reported: an ancestor forming a backdrop root
						// would leave this frost with nothing to sample. It does not move the
						// material back to the column, because the column is not where the
						// panel is drawn — it is only where it used to be.
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
					// Keep the surface we already handed the material to, but only while it
					// still covers the column: the delegation was measured once, and the
					// column moves under it (the right panel going fullscreen widens the
					// column without widening the inner surface, which is why the pane's
					// opacity and blur stopped covering the panel). Re-probing on every pass
					// made the panel's opacity flicker between two values, because a probe
					// that finds nothing leaves the inner layer's own (now protected, nearly
					// opaque) fill in charge — re-validating keeps that protection without
					// freezing a stale measurement in place.
					if (surfaceAttached(sticky) && surfaceStillCovers(win, column, sticky)) {
						if (sticky.getAttribute("data-glass-surface") !== key) sticky.setAttribute("data-glass-surface", key);
						aimBlur(key);
						column.setAttribute("data-glass-delegate", "on");
						continue;
					}
					if (sticky !== null && sticky !== undefined) {
						// It stopped covering the column, so it goes back to the app's own
						// paint and the material returns to whichever element covers now.
						sticky.removeAttribute("data-glass-surface");
						panelSurfaces[key] = null;
						column.removeAttribute("data-glass-delegate");
					}
					var painters = paintersIn(win, column) ?? [];
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

			/** @returns the color scheme the presenter currently has on the body. */
			function currentScheme() {
				try {
					return doc.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
				} catch (error) {
					return "light";
				}
			}

		/**
		 * Republish the panel material: first decide where each panel's frost
		 * lives (the one measured step), then publish every variable the CSS
		 * reads. Called on start, on every panel change, on every mood commit and
		 * on every scheme flip, so the variables are always the current truth
		 * rather than a snapshot of boot time.
		 */
		function syncPanels() {
			if (disposed) return;
			doc.body.dataset.glassPanels = "on";
			doc.body.dataset.glassGap = panels.gap > 0 ? "on" : "off";
			doc.body.dataset.glassPress = panels.press ? "on" : "off";
			// One computed-style read per descendant, per panel: the whole cost of
			// this function lives in this line, which is why the poll path calls
			// publishPanelColors instead.
			for (var bk = 0; bk < PANEL_KEYS.length; bk++) aimBlur(PANEL_KEYS[bk]);
			publishPanelColors();
		}

		/**
		 * The variables only, no probing. A fresh frame reading re-tints the panes
		 * through here: the 1.5s poll must never pay for a blur-host decision that
		 * only a layout event can change.
		 */
		function publishPanelColors() {
			if (disposed) return;
			var style = doc.body.style;
			var scheme = currentScheme();
			var moodNow = mood === null ? "idle" : mood;
			var wallpaperOn = hasWallpaperConfig(wallpaper);
			style.setProperty("--gm-gap", panels.gap + "px");
				style.setProperty("--gm-frame-radius", panels.frameRadius + "px");
				style.setProperty("--gm-radius", panels.panelRadius + "px");
				style.setProperty("--gm-refract", panels.refraction ? "url(#" + REFRACTION_ID + "-filter)" : "none");
				// Nothing else about the frost follows this switch. It used to scale the
				// blur down while it was on — a real trade (displacement needs structure,
				// and blur eats structure), but at 19px the 14% it took was invisible as
				// refraction and perfectly visible as "the panel got blurrier", which is
				// the one thing this knob must never look like.
				// One switch for content-derived colour: it drives both the pane and the rim.
				// The mood's own slot, read ahead of time: a switch must not spend four
				// seconds wearing the previous clip's colour.
				var spillSample = panels.rimSpill === true ? sampleFor(moodNow === "work" ? "work" : "idle") : null;
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
					/* A nearly clear pane has no glass for light to catch on, yet the rim —
					   a `--gm-rim-band` wide gradient along each edge with `border-radius:
					   inherit` — keeps drawing at full strength. At alpha 0 it is the ONLY
					   thing left on screen, and because the band has its own rounded ends it
					   reads as a second pane inside the first: the reported "two corners on
					   the left". Edge light belongs to glass; it fades with the fill.
					   Above 12% the glass is there to carry it, so nothing changes. */
					/* Linear, and it reaches ZERO. An earlier version floored it at 0.15, which
					   is not nothing: the rim's edge line is `inset 0 0 0 1px` — a 1px inset
					   shadow whose inner radius is 12 - 1 = 11px against the glass's 12px, so
					   two concentric arcs sit 1px apart. A hairline like that still reads at
					   5% opacity on a pale pane, which is the "there is still an arc inside
					   the corner" that survived. No glass, no edge light. */
					var rimWeight = panelAlphaCache[key] >= 0.12 ? 1 : Math.max(0, panelAlphaCache[key] / 0.12);
					style.setProperty("--gm-panel-" + key + "-rim", String(Math.round(rimWeight * 1000) / 1000));
					// The rim's contact shadow carries the highlight knob's weight outside
					// the panel, where a white hairline on a white surface cannot read.
					var contact = Math.round((scheme === "dark" ? 0.44 : 0.22) * panel.sheen * (moodNow === "work" ? 1.15 : 0.9) * 1000) / 1000;
					/* The spread used to be a flat -14px, and a negative spread SHRINKS the
					   shadow's shape — the corner radius shrinks with it. With the panel at
					   12px the effective radius was max(0, 12 - 14) = 0, so the shadow this
					   comment wants OUTSIDE the panel was in fact a square block sitting
					   INSIDE it. Through a pane this transparent that is not a soft halo, it
					   is a hard right-angled shadow in the corner. The spread now follows
					   the radius, so the shadow keeps the card's shape. */
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
			// The edge switch has to change the EDGE. It used to do nothing but scale the
			// frost blur, which is why it read as a blur control: the rim now tightens
			// into a lens edge (a brighter, wider specular with its dispersion showing),
			// or relaxes back to a soft hairline.
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
		 * Name the fixed descendants, not just count them: putting the blur on an
			 * element re-anchors exactly these, so if one is ever displaced the report has
			 * to say which one it was.
			 * @param node - the subtree root.
			 * @returns up to two `tag.class` labels, or ["(unknown)"] when unanswerable.
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
			if (given.blurFallback !== undefined) merged.blurFallback = given.blurFallback;
			if (given.fixedGuard !== undefined) merged.fixedGuard = given.fixedGuard;
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
			// A background tab keeps neither clock nor decoder running.
			watchVisibility();
			watchColumns();
				// The panel material is part of the theme, not a mode: mount it with the
				// engine and re-find the columns whenever the shell rebuilds them.
				mountRefraction();
				restorePanels();
				tagBigSurfaces();
			ensureStageHost();
			startRetag();
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
					// Dropping the attribute alone leaves the decoder and the buffer
					// alive; `load()` is the call that actually releases them. The object
					// URL goes after it, or the reset has nothing to read.
					if (typeof video.load === "function") {
						try { video.load(); } catch (error) { /* no source to reset */ }
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
						for (var s = 0; s < PANEL_VAR_SUFFIXES.length; s++) {
							doc.body.style.removeProperty("--gm-panel-" + PANEL_KEYS[p] + "-" + PANEL_VAR_SUFFIXES[s]);
						}
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
					var sample = sampleFor(activeSlot());
					return {
						ready: sample.ready,
						brightness: Math.round(sample.brightness * 1000) / 1000,
						hue: sample.hue === null ? null : Math.round(sample.hue),
						saturation: Math.round(sample.saturation * 1000) / 1000,
						dim: sample.dim
					};
				},
				/** Both slots' last reading, for anyone debugging the spill. */
				mediaSlots: function () {
					return { idle: sampleFor("idle"), work: sampleFor("work") };
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
						var arrangement = panelBlurHost[key] === "element" ? "\u5143\u7d20\u81ea\u8eab" : "\u4f2a\u5143\u7d20";
						if (panelBlurNote[key].length > 0) arrangement = arrangement + "\uff08" + panelBlurNote[key][0] + "\uff09";
						lines.push(label + "\uff1a\u6750\u8d28\u5728" + where + "\uff0c\u6a21\u7cca\u6302\u5728" + arrangement + "\uff0c\u503c " + (asked === "" ? "?" : asked) +
							"\uff08\u5143\u7d20\u8ba1\u7b97\u503c " + computed + "\uff0c::before " + pseudo + "\uff09\uff0c\u9762\u677f alpha " + alpha + why);
					}
					return lines;
				},
				/** The DOM report a diagnostic build sends; also readable on demand. */
				domReport: domReport,
			/** Send one now (used by the row while the panel is expanded). */
			postReport: function () { postDomReport("manual"); return reportPosts; },
			/**
			 * Switch the automatic diagnostic report on or off. Off is the default;
			 * `postReport()` sends one either way, because that is the explicit
			 * request this switch exists to tell apart from an automatic one.
			 * @param on - true to enable the automatic reports.
			 * @returns whether it is on now.
			 */
			setReports: function (on) {
				try {
					if (on === true) storage.setItem(REPORT_ENABLE_KEY, "1");
					else storage.removeItem(REPORT_ENABLE_KEY);
				} catch (error) { /* storage unavailable: the switch is simply not persisted */ }
				return reportsEnabled();
			},
				/** The build the settings row prints. */
				build: function () { return BUILD; },
				/**
				 * What the layout measures right now, for the expanded right panel. The
				 * material has to sit on an element that spans the mode, so this reports the
				 * column beside the element that actually holds it.
				 * @returns the expanded flag plus one readable line per panel.
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
					// What the storage could not keep, when it could not keep something:
					// a silent failure here used to resurface as a vanished wallpaper.
					config.notice ? h("div", { className: "gm-row-hint" }, config.notice) : null,
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
				// Diagnostics on demand: normally silent, and only speaks when a panel was
				// not identified or a blur had to be placed around a floating control.
				var diagnosis = engine.blurSummary().filter(function (line) {
					return /未识别|fixed|降级/.test(line);
				});
				// While the right panel is expanded the layout is the thing in question, so
				// the row states what it measures: the column, the element holding the
				// material, and both widths.
				var layout = engine.layoutReport();
				if (layout.expanded === true) diagnosis = diagnosis.concat(layout.lines);

				return h("div", { className: "gm-row" },
					h("div", null,
						h("div", { className: "gm-row-title" }, "玻璃主题 · 面板与光感"),
						h("div", { className: "gm-row-hint" }, hint),
						// Which build is on screen, so a fix that "did not work" is never
						// confused with a build that never loaded.
						h("div", { className: "gm-row-hint" }, "版本 v" + engine.build()),
						// The blur can fail in a way no computed value reveals, so the row
						// used to print where each panel's material and blur ended up. That
						// is diagnostics, not a setting: it now appears only when there is
						// something to say — a panel it could not identify, or a panel whose
						// blur had to be placed around a floating control.
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
			// The settings rows belong to this effect's scope, so an unload — or the
			// next live-reload mount — takes them down with the engine instead of
			// leaving rows behind that talk to a disposed one.
			registerWallpaperRow(ctx, engine);
			registerPanelsRow(ctx, engine);
			return function () {
				dispose();
				if (window.__dshGlassMoodTeardown === dispose) delete window.__dshGlassMoodTeardown;
			};
		}, "glass-mood: mood engine");
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
