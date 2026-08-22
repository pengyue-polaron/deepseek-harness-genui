window.__ModuleLoader__.load({ id: "dsh-plugin-genui", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

//#region src/client/api.ts
let managementRoot;
async function managementEndpoint() {
	managementRoot ??= fetch("/.well-known/dsh-genui", { headers: { accept: "application/json" } }).then(async (response) => {
		const value = await response.json();
		if (!response.ok || typeof value.route_prefix !== "string") throw new Error(value.error ?? "design settings are unavailable");
		return `${value.route_prefix}/manage/designs`;
	});
	return managementRoot;
}
async function managementJson(path = "", init) {
	const endpoint = await managementEndpoint();
	const response = await fetch(`${endpoint}${path}`, {
		...init,
		headers: {
			accept: "application/json",
			...init?.headers
		}
	});
	const value = await response.json();
	if (!response.ok) throw new Error(value.error ?? `design request failed: ${response.status}`);
	return value;
}
async function withExportBase(value) {
	const [settings, endpoint] = await Promise.all([value, managementEndpoint()]);
	return {
		...settings,
		export_base: endpoint
	};
}
function access(meta) {
	if (meta.previewUrl === void 0) throw new Error("preview is unavailable");
	const preview = new URL(meta.previewUrl, window.location.href);
	const token = new URLSearchParams(preview.hash.slice(1)).get("token");
	const markerAt = preview.pathname.indexOf("/preview/");
	if (token === null || markerAt < 0) throw new Error("preview capability is missing");
	return {
		preview,
		token,
		endpoint: `${preview.origin}${preview.pathname.slice(0, markerAt)}/api/${encodeURIComponent(meta.artifactId)}`
	};
}
async function post(meta, action, value) {
	const { endpoint, token } = access(meta);
	const response = await fetch(`${endpoint}/${action}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json"
		},
		body: JSON.stringify(value)
	});
	const body = await response.json();
	if (!response.ok) throw new Error(body.error ?? `artifact request failed: ${response.status}`);
	return body;
}
function grantPermission(meta, versionId, capabilityId) {
	return post(meta, "permission/grant", {
		version_id: versionId,
		capability_id: capabilityId
	});
}
function grantAllPermissions(meta, versionId) {
	return post(meta, "permission/grant-all", { version_id: versionId });
}
function listPermissions(meta, versionId) {
	return post(meta, "permission/list", { version_id: versionId });
}
function revokePermission(meta, capabilityId) {
	return post(meta, "permission/revoke", { capability_id: capabilityId });
}
function previewUrlForLocale(meta, locale) {
	const { preview } = access(meta);
	preview.searchParams.set("lang", locale);
	return preview.toString();
}
function readDesignSettings() {
	return withExportBase(managementJson());
}
function setDefaultDesign(designId) {
	return withExportBase(managementJson("/default", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ design_id: designId })
	}));
}
function importDesign(designId, content) {
	return withExportBase(managementJson("/import", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			design_id: designId,
			content
		})
	}));
}

//#endregion
//#region src/client/canvas.ts
const MIN_CANVAS_WIDTH = 340;
const MAX_CANVAS_WIDTH = 640;
const MIN_CONVERSATION_WIDTH = 560;
const CANVAS_SHARE = .46;
const INITIAL_SURFACE = {
	mode: "split",
	width: 440
};
function solveCanvasSurface(frameWidth, workspaceWidth) {
	const available = Math.max(0, workspaceWidth);
	const largestWithoutCrowdingChat = available - MIN_CONVERSATION_WIDTH;
	if (largestWithoutCrowdingChat < MIN_CANVAS_WIDTH) return {
		mode: "full",
		width: frameWidth
	};
	const preferred = Math.round(available * CANVAS_SHARE);
	return {
		mode: "split",
		width: Math.min(MAX_CANVAS_WIDTH, largestWithoutCrowdingChat, Math.max(MIN_CANVAS_WIDTH, preferred))
	};
}
function hostColumns(element) {
	let center = element;
	while (true) {
		const frame = center.parentElement;
		if (frame === null) break;
		if (Array.from(frame.children).some((child) => child instanceof HTMLElement && child.hasAttribute("data-shell-overlay"))) return {
			center,
			frame
		};
		center = frame;
	}
	throw new Error("Harness layout columns are missing");
}
var CanvasController = class {
	activeBySession = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Map();
	open(sessionId, artifactId) {
		if (this.activeBySession.get(sessionId) === artifactId) return;
		this.activeBySession.set(sessionId, artifactId);
		this.emit(sessionId);
	}
	close(sessionId, artifactId) {
		if (this.activeBySession.get(sessionId) !== artifactId) return;
		this.activeBySession.delete(sessionId);
		this.emit(sessionId);
	}
	isOpen(sessionId, artifactId) {
		return this.activeBySession.get(sessionId) === artifactId;
	}
	subscribe(sessionId, listener) {
		const group = this.listeners.get(sessionId) ?? /* @__PURE__ */ new Set();
		group.add(listener);
		this.listeners.set(sessionId, group);
		return () => {
			group.delete(listener);
			if (group.size === 0) this.listeners.delete(sessionId);
		};
	}
	emit(sessionId) {
		for (const listener of this.listeners.get(sessionId) ?? []) listener();
	}
};
const canvasController = new CanvasController();
function useCanvasArtifact(sessionId, artifactId) {
	return (0, react.useSyncExternalStore)((listener) => canvasController.subscribe(sessionId, listener), () => canvasController.isOpen(sessionId, artifactId), () => false);
}
function useCanvasSurface(open, card) {
	const [surface, setSurface] = (0, react.useState)(INITIAL_SURFACE);
	(0, react.useLayoutEffect)(() => {
		if (!open || card === null) return;
		const { center, frame } = hostColumns(card);
		const update = () => {
			const next = solveCanvasSurface(frame.getBoundingClientRect().width, center.getBoundingClientRect().width);
			center.style.setProperty("--dsh-genui-canvas-width", `${next.width}px`);
			if (next.mode === "split") {
				center.dataset.genuiCanvasHost = "true";
				center.style.setProperty("--dsh-genui-canvas-reserve", `${next.width}px`);
			} else {
				delete center.dataset.genuiCanvasHost;
				center.style.removeProperty("--dsh-genui-canvas-reserve");
			}
			setSurface((current) => current.mode === next.mode && current.width === next.width ? current : next);
		};
		const observer = new ResizeObserver(update);
		observer.observe(frame);
		observer.observe(center);
		update();
		return () => {
			observer.disconnect();
			delete center.dataset.genuiCanvasHost;
			center.style.removeProperty("--dsh-genui-canvas-width");
			center.style.removeProperty("--dsh-genui-canvas-reserve");
		};
	}, [card, open]);
	return surface;
}

//#endregion
//#region src/client/design-settings.tsx
function designDescription(id, t) {
	switch (id) {
		case null: return t("design.autoDescription");
		case "material-3": return t("design.material3Description");
		case "apple-human-interface": return t("design.appleDescription");
		case "shadcn-ui": return t("design.shadcnDescription");
		default: return t("design.customDescription");
	}
}
function designIdForImport(fileName, content, now = Date.now()) {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
	const withoutExtension = fileName.replace(/\.md$/i, "");
	const slug = (withoutExtension.toLowerCase() === "design" ? heading : withoutExtension).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
	if (slug.length >= 3 && /^[a-z]/.test(slug)) return slug;
	if (slug.length > 0) return `design-${slug}`.slice(0, 64);
	return `design-${now.toString(36)}`;
}
function DesignSettingsCard({ t }) {
	const inputId = (0, react.useId)();
	const inputRef = (0, react.useRef)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [settings, setSettings] = (0, react.useState)();
	const [pending, setPending] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)();
	const [failed, setFailed] = (0, react.useState)(false);
	const load = async () => {
		setFailed(false);
		try {
			setSettings(await readDesignSettings());
		} catch {
			setFailed(true);
		}
	};
	(0, react.useEffect)(() => {
		load();
	}, []);
	const selectedLabel = (settings?.designs.find((design) => design.id === settings.default_design_id))?.title ?? t("design.autoShort");
	const choose = async (designId) => {
		setPending(true);
		setFailed(false);
		setMessage(void 0);
		try {
			setSettings(await setDefaultDesign(designId || null));
			setMessage(t("design.saved"));
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	};
	const importFile = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (file === void 0) return;
		setPending(true);
		setFailed(false);
		setMessage(void 0);
		try {
			if (file.size > 128 * 1024) throw new Error("too large");
			const content = await file.text();
			setSettings(await importDesign(designIdForImport(file.name, content), content));
			setMessage(t("design.imported"));
		} catch {
			setFailed(true);
		} finally {
			setPending(false);
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: "dsh-genui-design-card",
		"data-open": open || void 0,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: designSettingsCss }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsh-genui-design-head",
				"aria-expanded": open,
				onClick: () => setOpen((value) => !value),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-genui-design-head-copy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("design.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("design.description") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-genui-design-current",
						children: selectedLabel
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-genui-design-chevron",
						"aria-hidden": "true",
						children: "⌄"
					})
				]
			}),
			open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-genui-design-body",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: `${inputId}-select`,
						children: t("design.defaultLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						id: `${inputId}-select`,
						name: "genui-default-design",
						autoComplete: "off",
						translate: "no",
						value: settings?.default_design_id ?? "",
						disabled: settings === void 0 || pending,
						onChange: (event) => {
							choose(event.target.value);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("design.auto")
						}), settings?.designs.map((design) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: design.id,
							children: design.title
						}, design.id))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "dsh-genui-design-preview",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							translate: "no",
							children: selectedLabel
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: designDescription(settings?.default_design_id ?? null, t) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-genui-design-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: inputRef,
								id: inputId,
								name: "genui-design-import",
								type: "file",
								accept: ".md,text/markdown,text/plain",
								"aria-label": t("design.import"),
								hidden: true,
								onChange: (event) => {
									importFile(event);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: pending,
								onClick: () => inputRef.current?.click(),
								children: t("design.import")
							}),
							settings?.default_design_id == null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-genui-design-export-disabled",
								"aria-disabled": "true",
								children: t("design.export")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: `${settings.export_base}/${encodeURIComponent(settings.default_design_id)}?download=1`,
								download: "DESIGN.md",
								onClick: () => setMessage(t("design.exported")),
								children: t("design.export")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								"aria-live": "polite",
								children: pending ? t("design.saving") : failed ? t("design.failed") : message
							})
						]
					})
				]
			}) : null
		]
	});
}
const designSettingsCss = `
.dsh-genui-design-card { list-style:none; overflow:hidden; border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); }
.dsh-genui-design-card[data-open='true'] { border-color:var(--dsw-alias-label-dimmed); background:var(--dsw-alias-bg-layer-2); }
.dsh-genui-design-head { display:flex; width:100%; align-items:center; gap:12px; border:0; border-radius:12px; padding:14px 16px; background:none; color:inherit; cursor:pointer; font:inherit; text-align:left; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.dsh-genui-design-head:focus-visible, .dsh-genui-design-body select:focus-visible, .dsh-genui-design-actions button:focus-visible, .dsh-genui-design-actions a:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px; }
.dsh-genui-design-head-copy { display:flex; min-width:0; flex:1; flex-direction:column; gap:4px; }
.dsh-genui-design-head-copy strong { font-size:15px; line-height:1.4; }
.dsh-genui-design-head-copy span { color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:1.5; }
.dsh-genui-design-current { overflow:hidden; max-width:180px; border-radius:999px; padding:2px 9px; background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-secondary); font-size:11px; line-height:18px; text-overflow:ellipsis; white-space:nowrap; }
.dsh-genui-design-chevron { color:var(--dsw-alias-label-tertiary); font-size:18px; transition:transform .16s; }
.dsh-genui-design-card[data-open='true'] .dsh-genui-design-chevron { transform:rotate(180deg); }
.dsh-genui-design-body { margin:0 16px; padding:14px 0 12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dsh-genui-design-body label { display:block; margin-bottom:6px; font-size:13px; font-weight:600; }
.dsh-genui-design-body select { width:100%; height:36px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 10px; background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font-family:inherit; font-size:13px; line-height:1.4; }
.dsh-genui-design-preview { display:grid; gap:2px; margin:8px 0 14px; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:1.5; }
.dsh-genui-design-preview strong { color:var(--dsw-alias-label-secondary); font-size:12px; }
.dsh-genui-design-actions { display:flex; align-items:center; gap:8px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l2); }
.dsh-genui-design-actions button, .dsh-genui-design-actions a, .dsh-genui-design-export-disabled { box-sizing:border-box; display:inline-flex; min-height:32px; align-items:center; justify-content:center; border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 12px; background:transparent; color:var(--dsw-alias-label-secondary); font-family:inherit; font-size:12px; font-weight:600; line-height:1; text-decoration:none; }
.dsh-genui-design-actions button, .dsh-genui-design-actions a { cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.dsh-genui-design-actions button:hover:not(:disabled), .dsh-genui-design-actions a:hover { border-color:var(--dsw-alias-label-dimmed); color:var(--dsw-alias-label-primary); }
.dsh-genui-design-actions button:disabled, .dsh-genui-design-export-disabled { cursor:default; opacity:.45; }
.dsh-genui-design-actions span { min-width:0; flex:1; color:var(--dsw-alias-label-tertiary); font-size:12px; text-align:right; }
@media (max-width:640px) { .dsh-genui-design-head { gap:6px; padding:12px 10px; } .dsh-genui-design-head-copy span, .dsh-genui-design-current { display:none; } .dsh-genui-design-head-copy strong { font-size:13px; } .dsh-genui-design-body { margin:0 10px; } .dsh-genui-design-actions { align-items:stretch; flex-direction:column; } .dsh-genui-design-actions button, .dsh-genui-design-actions a, .dsh-genui-design-export-disabled { min-height:40px; padding:0 8px; white-space:normal; } .dsh-genui-design-actions span { text-align:left; } }
@media (prefers-reduced-motion:reduce) { .dsh-genui-design-chevron { transition:none; } }
`;

//#endregion
//#region src/client/icons.tsx
const paths = {
	check: ["M20 6 9 17l-5-5"],
	"chevron-down": ["m6 9 6 6 6-6"],
	"chevron-up": ["m18 15-6-6-6 6"],
	maximize: [
		"M15 3h6v6",
		"m14 10 7-7",
		"M9 21H3v-6",
		"m3 21 7-7"
	],
	minimize: [
		"M4 14h6v6",
		"m3 21 7-7",
		"M20 10h-6V4",
		"m14 10 7-7"
	],
	"panel-right": ["M3 4h18v16H3z", "M15 4v16"],
	"panel-right-close": [
		"M3 4h18v16H3z",
		"M15 4v16",
		"m11 9-3 3 3 3"
	],
	refresh: [
		"M21 12a9 9 0 0 0-15.56-6.16L3 8",
		"M3 3v5h5",
		"M3 12a9 9 0 0 0 15.56 6.16L21 16",
		"M16 16h5v5"
	],
	shield: ["M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"]
};
function ShellIcon({ name }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: paths[name].map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: path }, path))
	});
}

//#endregion
//#region src/client/ledger.ts
var ArtifactCardLedger = class {
	sequence = 0;
	entries = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Map();
	mount(key, callId, element, hasPreview) {
		const group = this.entries.get(key) ?? /* @__PURE__ */ new Map();
		group.set(callId, {
			callId,
			element,
			hasPreview,
			sequence: ++this.sequence
		});
		this.entries.set(key, group);
		this.emit(key);
		return () => {
			group.delete(callId);
			if (group.size === 0) this.entries.delete(key);
			this.emit(key);
		};
	}
	isPrimary(key, callId) {
		const group = [...this.entries.get(key)?.values() ?? []];
		const eligible = group.filter((entry) => entry.hasPreview);
		return (eligible.length > 0 ? eligible : group).reduce((latest, entry) => latest === void 0 || entry.sequence > latest.sequence ? entry : latest, void 0)?.callId === callId;
	}
	focusPrimary(key) {
		const group = [...this.entries.get(key)?.values() ?? []];
		const eligible = group.filter((entry) => entry.hasPreview);
		const latest = (eligible.length > 0 ? eligible : group).reduce((current, entry) => current === void 0 || entry.sequence > current.sequence ? entry : current, void 0);
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		latest?.element.scrollIntoView({
			behavior: reducedMotion ? "auto" : "smooth",
			block: "center"
		});
		latest?.element.focus({ preventScroll: true });
	}
	subscribe(key, listener) {
		const group = this.listeners.get(key) ?? /* @__PURE__ */ new Set();
		group.add(listener);
		this.listeners.set(key, group);
		return () => {
			group.delete(listener);
			if (group.size === 0) this.listeners.delete(key);
		};
	}
	emit(key) {
		for (const listener of this.listeners.get(key) ?? []) listener();
	}
};
const artifactCardLedger = new ArtifactCardLedger();
function usePrimaryArtifactCard(key, callId, element, hasPreview) {
	(0, react.useLayoutEffect)(() => element === null ? void 0 : artifactCardLedger.mount(key, callId, element, hasPreview), [
		callId,
		element,
		hasPreview,
		key
	]);
	return (0, react.useSyncExternalStore)((listener) => artifactCardLedger.subscribe(key, listener), () => artifactCardLedger.isPrimary(key, callId), () => false);
}

//#endregion
//#region src/client/locales.ts
const NS = "genui";
const zh = {
	"locale.code": "zh",
	"app.untitled": "未命名应用",
	"app.building": "正在生成应用…",
	"app.open": "打开应用",
	"app.show": "展开应用",
	"app.hide": "收起应用",
	"app.loading": "正在打开应用…",
	"app.loadFailed": "应用暂时没有打开。",
	"app.reload": "重新打开",
	"app.canvasReturn": "回到应用",
	"progress.label": "应用生成进度",
	"progress.create.prepare": "正在准备界面",
	"progress.create.build": "正在构建应用",
	"progress.create.check": "正在完成应用",
	"progress.update.prepare": "正在准备这次修改",
	"progress.update.build": "正在构建候选版本",
	"progress.update.check": "正在完成候选版本",
	"progress.update.safe": "检查完成前，当前可用版本不会被替换。",
	"progress.restore.prepare": "正在确认可恢复版本",
	"progress.restore.apply": "正在恢复应用",
	"action.fullscreen": "全屏查看",
	"action.exitFullscreen": "退出全屏",
	"action.openCanvas": "在右侧打开",
	"action.closeCanvas": "收回到对话",
	"feedback.fullscreenFailed": "无法进入全屏，请重试",
	"feedback.saved": "已保存",
	"permission.title": "需要你的同意",
	"permission.read": "读取信息",
	"permission.write": "执行更改",
	"permission.connect": "连接到",
	"permission.methods": "允许请求",
	"permission.scope": "同意后，这个应用可以在当前任务中继续使用这项能力。用途发生变化时会再次询问。",
	"permission.queued": "确认后还有 {count} 项访问请求。",
	"permission.deny": "暂不允许",
	"permission.allow": "允许当前任务使用",
	"permission.allowing": "正在授权…",
	"permission.failed": "暂时无法完成授权，请重试。",
	"permission.upfrontTitle": "这个应用需要以下权限",
	"permission.upfrontDescription": "在打开前一次确认。允许后，这个版本在当前任务中使用这些能力时不会逐项打断你。",
	"permission.upfrontAllow": "全部允许并打开",
	"access.open": "管理访问权限",
	"access.title": "应用访问权限",
	"access.description": "你可以随时收回这个应用在当前任务中获得的权限。",
	"access.notAllowed": "未允许",
	"access.revoke": "收回权限",
	"access.revoking": "正在收回…",
	"access.close": "完成",
	"access.failed": "暂时无法更新权限，请重试。",
	"access.revoked": "权限已收回",
	"receipt.updated": "应用已更新",
	"receipt.failed": "这次修改没有生效，应用保持原样",
	"receipt.openCurrent": "打开应用",
	"receipt.unavailable": "应用暂时没有打开。你可以在对话里让我再试一次。",
	"design.title": "生成应用的风格",
	"design.description": "让每个任务自行判断，或固定一个默认方向。",
	"design.defaultLabel": "默认视觉方向",
	"design.auto": "自动选择（推荐）",
	"design.autoShort": "自动选择",
	"design.hint": "只影响之后新建的应用；已经生成的应用会保留原来的风格。",
	"design.autoDescription": "按任务自动挑选视觉语言。只影响之后新建的应用。",
	"design.material3Description": "Google Material 3：色调表面、清晰层级、鲜明主色与友好的触控组件。",
	"design.appleDescription": "Apple Human Interface：克制、精确、内容优先，使用熟悉的系统感控件。",
	"design.shadcnDescription": "shadcn/ui：语义色彩变量、利落边框、紧凑表单与完整交互状态。",
	"design.customDescription": "自定义 DESIGN.md。只影响之后新建的应用。",
	"design.import": "导入 DESIGN.md",
	"design.export": "导出当前设计",
	"design.saved": "已保存",
	"design.saving": "正在保存…",
	"design.imported": "已导入并设为默认",
	"design.exported": "已导出",
	"design.failed": "没有保存，请重试。"
};
const en = {
	"locale.code": "en",
	"app.untitled": "Untitled app",
	"app.building": "Building the app…",
	"app.open": "Open app",
	"app.show": "Show app",
	"app.hide": "Hide app",
	"app.loading": "Opening app…",
	"app.loadFailed": "The app did not open.",
	"app.reload": "Open again",
	"app.canvasReturn": "Return to app",
	"progress.label": "App generation progress",
	"progress.create.prepare": "Preparing the interface",
	"progress.create.build": "Building the app",
	"progress.create.check": "Finishing the app",
	"progress.update.prepare": "Preparing this change",
	"progress.update.build": "Building a candidate version",
	"progress.update.check": "Finishing the candidate version",
	"progress.update.safe": "The current working version stays available until these checks pass.",
	"progress.restore.prepare": "Finding the ready version",
	"progress.restore.apply": "Restoring the app",
	"action.fullscreen": "View full screen",
	"action.exitFullscreen": "Exit full screen",
	"action.openCanvas": "Open on the right",
	"action.closeCanvas": "Return to conversation",
	"feedback.fullscreenFailed": "Could not enter full screen. Try again.",
	"feedback.saved": "Saved",
	"permission.title": "Your permission is needed",
	"permission.read": "Read information",
	"permission.write": "Make changes",
	"permission.connect": "Connect to",
	"permission.methods": "Allowed requests",
	"permission.scope": "Once allowed, this app can keep using this capability during the current task. You will be asked again if its purpose changes.",
	"permission.queued": "More access requests are waiting: {count}.",
	"permission.deny": "Not now",
	"permission.allow": "Allow for this task",
	"permission.allowing": "Allowing…",
	"permission.failed": "Permission could not be saved. Try again.",
	"permission.upfrontTitle": "This app needs the following access",
	"permission.upfrontDescription": "Review it once before opening. If allowed, this version can use these capabilities during the current task without interrupting you one by one.",
	"permission.upfrontAllow": "Allow all and open",
	"access.open": "Manage access",
	"access.title": "App access",
	"access.description": "You can remove access this app received during the current task.",
	"access.notAllowed": "Not allowed",
	"access.revoke": "Remove access",
	"access.revoking": "Removing…",
	"access.close": "Done",
	"access.failed": "Access could not be updated. Try again.",
	"access.revoked": "Access removed",
	"receipt.updated": "App updated",
	"receipt.failed": "That change was not applied. The app is unchanged",
	"receipt.openCurrent": "Open app",
	"receipt.unavailable": "The app could not open. You can ask me to try again in the conversation.",
	"design.title": "Generated app design",
	"design.description": "Let each task decide, or keep one default direction.",
	"design.defaultLabel": "Default visual direction",
	"design.auto": "Choose automatically (recommended)",
	"design.autoShort": "Automatic",
	"design.hint": "This affects new apps only. Existing apps keep their current design.",
	"design.autoDescription": "Choose a visual language for each task. This affects new apps only.",
	"design.material3Description": "Google Material 3: tonal surfaces, clear hierarchy, expressive color, and touch-friendly controls.",
	"design.appleDescription": "Apple Human Interface: calm, precise, content-led, and built from familiar system-like controls.",
	"design.shadcnDescription": "shadcn/ui: semantic color tokens, crisp borders, compact forms, and complete interaction states.",
	"design.customDescription": "Custom DESIGN.md. This affects new apps only.",
	"design.import": "Import DESIGN.md",
	"design.export": "Export current design",
	"design.saved": "Saved",
	"design.saving": "Saving…",
	"design.imported": "Imported and set as default",
	"design.exported": "Exported",
	"design.failed": "Could not save. Try again."
};

//#endregion
//#region src/client/permission-queue.ts
function enqueuePermission(queue, request) {
	return queue.some((item) => item.requestId === request.requestId) ? queue : [...queue, request];
}
function settlePermission(queue, permissionId) {
	return {
		answered: queue.filter((item) => item.permission.id === permissionId),
		remaining: queue.filter((item) => item.permission.id !== permissionId)
	};
}

//#endregion
//#region src/client/readiness.ts
function isCurrentFrameMessage(event, frameWindow, artifactId, versionId) {
	if (event.source !== frameWindow || typeof event.data !== "object" || event.data === null) return false;
	const value = event.data;
	return value.source === "dsh-genui" && value.artifactId === artifactId && value.versionId === versionId;
}
function isGenuiReadyMessage(event, frameWindow, artifactId, versionId) {
	return isCurrentFrameMessage(event, frameWindow, artifactId, versionId) && event.data.type === "ready";
}
function isGenuiRuntimeErrorMessage(event, frameWindow, artifactId, versionId) {
	return isCurrentFrameMessage(event, frameWindow, artifactId, versionId) && event.data.type === "runtime-error";
}

//#endregion
//#region src/client/settings-slot.ts
function settingsSlotRegistration() {
	return {
		name: "settings.plugin.item",
		key: "genui-design",
		id: "genui-design",
		order: 30,
		locale: NS
	};
}

//#endregion
//#region src/client/styles.ts
const cardCss = `
.dsh-genui-anchor { position: relative; min-width: 0; }
[data-genui-canvas-host='true'] { box-sizing: border-box; padding-right: var(--dsh-genui-canvas-reserve); }
.dsh-genui-canvas-placeholder { display: flex; width: 100%; min-height: 42px; align-items: center; gap: 9px; border: 1px solid rgba(37,40,44,.12); border-radius: 11px; padding: 6px 9px; background: #faf9f6; color: #252422; cursor: pointer; font: 12px/1.2 ui-sans-serif, sans-serif; text-align: left; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dsh-genui-canvas-placeholder:hover { background: #f2f0eb; }
.dsh-genui-canvas-placeholder:focus-visible { outline: 2px solid #b94e32; outline-offset: 2px; }
.dsh-genui-canvas-placeholder > svg { width: 17px; height: 17px; flex: none; color: #b94e32; }
.dsh-genui-canvas-placeholder strong { min-width: 0; overflow: hidden; flex: 1; color: #252422; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-canvas-placeholder span { color: #b94e32; font-weight: 650; white-space: nowrap; }
.dsh-genui-card {
  --g-border: rgba(37,40,44,.12);
  --g-panel: #faf9f6;
  --g-panel-raised: #fff;
  --g-panel-soft: #f2f0eb;
  --g-ink: #252422;
  --g-muted: #77736d;
  --g-hover: rgba(37,36,34,.065);
  --g-focus: #b94e32;
  --g-success: #287553;
  --g-danger: #a84235;
  color-scheme: light dark;
  container-type: inline-size;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--g-border);
  border-radius: 13px;
  background: var(--g-panel);
  color: var(--g-ink);
  box-shadow: 0 1px 2px rgba(28,25,20,.035), 0 8px 28px rgba(28,25,20,.045);
  font-family: ui-sans-serif, sans-serif;
}
.dsh-genui-card[data-surface='canvas'] { position: fixed; z-index: 80; inset: 0 0 0 auto; display: flex; width: var(--dsh-genui-canvas-width,440px); height: 100dvh; border-width: 0 0 0 1px; border-radius: 0; flex-direction: column; box-shadow: none; animation: dsh-genui-canvas-in 220ms cubic-bezier(.2,.8,.2,1); }
.dsh-genui-card[data-surface='canvas'][data-canvas-layout='full'] { inset: 0; width: 100vw; border: 0; }
.dsh-genui-card[data-canvas-layout='full'] .dsh-genui-head { padding-top: max(4px,env(safe-area-inset-top)); padding-right: max(8px,env(safe-area-inset-right)); padding-left: max(10px,env(safe-area-inset-left)); }
.dsh-genui-card[data-canvas-layout='full'] .dsh-genui-fullscreen { display: none; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-body { height: auto; min-height: 0; flex: 1; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-collapse { display: none; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-head { min-height: 48px; padding-right: 8px; padding-left: 12px; }
@keyframes dsh-genui-canvas-in { from { opacity: .7; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
.dsh-genui-card:focus { outline: none; }
.dsh-genui-card:focus-visible { outline: 2px solid var(--g-focus); outline-offset: 2px; }
.dsh-genui-head { position: relative; z-index: 5; min-height: 42px; display: flex; align-items: center; gap: 8px; padding: 4px 7px 4px 9px; border-bottom: 1px solid var(--g-border); background: var(--g-panel-raised); }
.dsh-genui-card[data-collapsed='true'] .dsh-genui-head { border-bottom-color: transparent; }
.dsh-genui-name { min-width: 0; flex: 1; }
.dsh-genui-title { min-width: 0; overflow: hidden; margin: 0; color: var(--g-ink); font: 650 13px/1.2 ui-sans-serif,sans-serif; text-overflow: ellipsis; text-wrap: balance; white-space: nowrap; }
.dsh-genui-actions { display: flex; flex: none; align-items: center; gap: 4px; }
.dsh-genui-action { display: inline-flex; width: 32px; height: 32px; flex: none; align-items: center; justify-content: center; border: 0; border-radius: 8px; padding: 0; background: transparent; color: var(--g-muted); cursor: pointer; font: 650 11px/1 ui-sans-serif,sans-serif; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dsh-genui-action:hover { background: var(--g-hover); color: var(--g-ink); }
.dsh-genui-action:active { background: color-mix(in srgb,var(--g-ink) 11%,transparent); }
.dsh-genui-action:focus-visible, .dsh-genui-button:focus-visible { outline: 2px solid var(--g-focus); outline-offset: 1px; }
.dsh-genui-action svg, .dsh-genui-button svg { width: 16px; height: 16px; flex: none; stroke-width: 1.8; }
.dsh-genui-open-label { display: none; }
.dsh-genui-button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--g-border); border-radius: 8px; padding: 0 11px; background: var(--g-panel-raised); color: var(--g-ink); cursor: pointer; font: 650 11px/1 ui-sans-serif,sans-serif; touch-action: manipulation; }
.dsh-genui-button:hover { background: var(--g-hover); }
.dsh-genui-button--strong { border-color: transparent; background: var(--g-ink); color: var(--g-panel-raised); }
.dsh-genui-button--strong:hover { background: color-mix(in srgb,var(--g-ink) 88%,transparent); }
.dsh-genui-button:disabled { cursor: wait; opacity: .55; }
.dsh-genui-body { position: relative; display: flex; height: min(420px,50vh); min-height: 260px; overflow: hidden; flex-direction: column; background: Canvas; }
.dsh-genui-body[hidden], .dsh-genui-loading[hidden], .dsh-genui-frame-error[hidden] { display: none; }
.dsh-genui-frame-shell { position: relative; width: 100%; min-height: 0; flex: 1; }
.dsh-genui-frame { display: block; width: 100%; height: 100%; border: 0; background: Canvas; }
.dsh-genui-loading, .dsh-genui-frame-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--g-panel); color: var(--g-muted); font: 500 12px/1.4 ui-sans-serif,sans-serif; text-align: center; }
.dsh-genui-loading { pointer-events: none; }
.dsh-genui-frame-error > div { display: grid; justify-items: center; gap: 10px; }
.dsh-genui-toast { position: absolute; z-index: 60; top: 50px; left: 50%; max-width: calc(100% - 24px); overflow: hidden; border: 1px solid var(--g-border); border-radius: 999px; padding: 8px 11px; background: var(--g-ink); color: var(--g-panel-raised); box-shadow: 0 10px 30px rgba(20,18,14,.22); font: 650 11px/1.25 ui-sans-serif,sans-serif; text-align: center; text-overflow: ellipsis; transform: translateX(-50%); white-space: nowrap; }
.dsh-genui-permission-backdrop { position: absolute; z-index: 70; inset: 42px 0 0; display: grid; overflow: auto; overscroll-behavior: contain; place-items: center; padding: 20px; background: color-mix(in srgb,var(--g-panel) 78%,transparent); backdrop-filter: blur(8px); }
.dsh-genui-permission { display: grid; width: min(440px,100%); grid-template-columns: auto minmax(0,1fr); gap: 12px 14px; border: 1px solid var(--g-border); border-radius: 16px; padding: 18px; background: var(--g-panel-raised); box-shadow: 0 20px 60px rgba(20,18,14,.18); }
.dsh-genui-permission-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; background: color-mix(in srgb,var(--g-focus) 12%,var(--g-panel)); color: var(--g-focus); }
.dsh-genui-permission-mark svg { width: 17px; height: 17px; }
.dsh-genui-permission-copy { min-width: 0; }
.dsh-genui-permission-copy h4 { margin: 2px 0 6px; color: var(--g-ink); font: 700 16px/1.25 ui-sans-serif,sans-serif; overflow-wrap: anywhere; text-wrap: balance; }
.dsh-genui-permission-copy p { margin: 0; color: var(--g-muted); font: 12px/1.5 ui-sans-serif,sans-serif; overflow-wrap: anywhere; text-wrap: pretty; }
.dsh-genui-permission-copy .dsh-genui-permission-kicker { color: var(--g-focus); font-size: 10px; font-weight: 750; letter-spacing: .04em; }
.dsh-genui-permission-facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.dsh-genui-permission-facts span { max-width: 100%; overflow-wrap: anywhere; border: 1px solid var(--g-border); border-radius: 999px; padding: 5px 8px; background: var(--g-panel); color: var(--g-ink); font: 650 10px/1.2 ui-sans-serif,sans-serif; }
.dsh-genui-permission-copy .dsh-genui-permission-scope { font-size: 10px; }
.dsh-genui-permission-copy .dsh-genui-permission-queue { margin-top: 7px; color: var(--g-ink); font-size: 10px; font-weight: 650; }
.dsh-genui-permission-copy .dsh-genui-permission-error { margin-top: 8px; color: var(--g-danger); }
.dsh-genui-permission-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.dsh-genui-access { width: min(480px,100%); border: 1px solid var(--g-border); border-radius: 16px; padding: 18px; background: var(--g-panel-raised); box-shadow: 0 20px 60px rgba(20,18,14,.18); }
.dsh-genui-access-head { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; }
.dsh-genui-access-head h4 { margin: 1px 0 5px; color: var(--g-ink); font: 700 16px/1.25 ui-sans-serif,sans-serif; text-wrap: balance; }
.dsh-genui-access-head p { margin: 0; color: var(--g-muted); font: 12px/1.45 ui-sans-serif,sans-serif; text-wrap: pretty; }
.dsh-genui-access-list { display: grid; gap: 8px; margin: 16px 0; }
.dsh-genui-access-row { display: flex; min-width: 0; align-items: center; gap: 12px; border: 1px solid var(--g-border); border-radius: 11px; padding: 10px; background: var(--g-panel); }
.dsh-genui-access-row > div { display: grid; min-width: 0; flex: 1; gap: 3px; }
.dsh-genui-access-row strong { color: var(--g-ink); font: 650 12px/1.3 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-access-row span { color: var(--g-muted); font: 11px/1.4 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-access-row .dsh-genui-access-facts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.dsh-genui-access-row .dsh-genui-access-facts span { border: 1px solid var(--g-border); border-radius: 999px; padding: 3px 6px; color: var(--g-ink); font-size: 9px; font-weight: 650; }
.dsh-genui-access-row .dsh-genui-button { flex: none; }
.dsh-genui-access-row .dsh-genui-access-state { flex: none; color: var(--g-muted); font-weight: 650; }
.dsh-genui-access > .dsh-genui-permission-error { margin: 0 0 10px; color: var(--g-danger); font: 11px/1.4 ui-sans-serif,sans-serif; }
.dsh-genui-error { padding: 16px; color: var(--g-danger); font: 13px/1.45 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-receipt-shell { --g-border: rgba(37,40,44,.12); --g-panel-raised: #fff; --g-ink: #252422; --g-muted: #77736d; --g-hover: rgba(37,36,34,.065); --g-focus: #b94e32; --g-success: #287553; --g-danger: #a84235; position: relative; color-scheme: light dark; }
.dsh-genui-receipt { display: flex; min-height: 38px; align-items: center; gap: 8px; padding: 4px 7px 4px 10px; border: 1px solid var(--g-border); border-radius: 10px; background: var(--g-panel-raised); color: var(--g-muted); font: 11px/1.25 ui-sans-serif,sans-serif; }
.dsh-genui-receipt svg { width: 14px; height: 14px; flex: none; color: var(--g-success); }
.dsh-genui-receipt[data-failed='true'] svg { color: var(--g-danger); }
.dsh-genui-receipt strong { min-width: 0; overflow: hidden; color: var(--g-ink); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-receipt span { min-width: 0; overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-receipt button { width: auto; padding: 0 8px; }
.dsh-genui-progress { --g-border: rgba(37,40,44,.12); --g-panel: #faf9f6; --g-panel-raised: #fff; --g-ink: #252422; --g-muted: #77736d; --g-focus: #b94e32; display: grid; gap: 12px; overflow: hidden; border: 1px solid var(--g-border); border-radius: 12px; padding: 13px 14px; background: var(--g-panel-raised); color: var(--g-ink); font-family: ui-sans-serif,sans-serif; }
.dsh-genui-progress-head { display: flex; min-width: 0; align-items: center; gap: 10px; }
.dsh-genui-progress-head > div { display: grid; min-width: 0; gap: 2px; }
.dsh-genui-progress-head strong { overflow: hidden; font-size: 13px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-progress-head span { color: var(--g-muted); font-size: 11px; }
.dsh-genui-progress-spinner { width: 18px; height: 18px; flex: none; border: 2px solid color-mix(in srgb,var(--g-focus) 22%,transparent); border-top-color: var(--g-focus); border-radius: 50%; animation: dsh-genui-spin 800ms linear infinite; }
.dsh-genui-progress ol { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.dsh-genui-progress li { position: relative; min-width: 0; border-top: 2px solid var(--g-border); padding-top: 7px; color: var(--g-muted); font-size: 10px; line-height: 1.35; }
.dsh-genui-progress li[data-state='active'] { border-top-color: var(--g-focus); color: var(--g-ink); font-weight: 650; }
.dsh-genui-progress li[data-state='done'] { border-top-color: color-mix(in srgb,var(--g-focus) 45%,var(--g-border)); color: var(--g-muted); }
.dsh-genui-progress > p { margin: -2px 0 0; color: var(--g-muted); font-size: 10px; line-height: 1.4; }
@keyframes dsh-genui-spin { to { transform: rotate(360deg); } }
.dsh-genui-card:fullscreen { display: flex; width: 100vw; height: 100dvh; border: 0; border-radius: 0; flex-direction: column; background: var(--g-panel); }
.dsh-genui-card[data-surface='canvas']:fullscreen { inset: 0; width: 100vw; max-width: none; }
.dsh-genui-card:fullscreen .dsh-genui-head { padding-top: max(3px,env(safe-area-inset-top)); padding-right: max(5px,env(safe-area-inset-right)); padding-left: max(7px,env(safe-area-inset-left)); }
.dsh-genui-card:fullscreen .dsh-genui-body { height: auto; min-height: 0; flex: 1; }
.dsh-genui-card:fullscreen .dsh-genui-collapse { display: none; }
@media (prefers-color-scheme: dark) {
  .dsh-genui-card { --g-border: rgba(255,255,255,.11); --g-panel: #171717; --g-panel-raised: #1d1d1d; --g-panel-soft: #262624; --g-ink: #eeeeec; --g-muted: #9c9a94; --g-hover: rgba(255,255,255,.075); --g-focus: #e17a5f; --g-success: #67c996; --g-danger: #e27b6d; box-shadow: 0 1px 2px rgba(0,0,0,.18),0 8px 28px rgba(0,0,0,.2); }
  .dsh-genui-receipt-shell { --g-border: rgba(255,255,255,.11); --g-panel-raised: #1d1d1d; --g-ink: #eeeeec; --g-muted: #9c9a94; --g-hover: rgba(255,255,255,.075); --g-focus: #e17a5f; --g-success: #67c996; --g-danger: #e27b6d; }
  .dsh-genui-progress { --g-border: rgba(255,255,255,.11); --g-panel: #171717; --g-panel-raised: #1d1d1d; --g-ink: #eeeeec; --g-muted: #9c9a94; --g-focus: #e17a5f; }
  .dsh-genui-canvas-placeholder { border-color: rgba(255,255,255,.11); background: #1d1d1d; color: #eeeeec; }
  .dsh-genui-canvas-placeholder:hover { background: #262624; }
  .dsh-genui-canvas-placeholder > svg, .dsh-genui-canvas-placeholder span { color: #e17a5f; }
  .dsh-genui-canvas-placeholder strong { color: #eeeeec; }
}
@media (prefers-reduced-motion: reduce) { .dsh-genui-card[data-surface='canvas'] { animation: none; } .dsh-genui-progress-spinner { animation: none; } }
@media (max-width: 640px) {
  .dsh-genui-head { min-height: 48px; padding-right: 3px; padding-left: 3px; }
  .dsh-genui-action { width: 44px; height: 44px; }
  .dsh-genui-body { height: min(390px,48dvh); min-height: 240px; }
  .dsh-genui-permission-backdrop { inset: 48px 0 0; align-items: end; padding: 10px; }
  .dsh-genui-permission { width: 100%; border-radius: 18px; padding: 16px; }
  .dsh-genui-access { width: 100%; border-radius: 18px; padding: 16px; }
  .dsh-genui-access-row { align-items: stretch; flex-direction: column; }
  .dsh-genui-access-row .dsh-genui-button { min-height: 40px; }
  .dsh-genui-permission-actions .dsh-genui-button { min-height: 42px; flex: 1; }
}
@container (max-width: 420px) {
  .dsh-genui-card[data-surface='inline'] .dsh-genui-fullscreen { display: none; }
  .dsh-genui-canvas-action { width: auto; gap: 6px; padding: 0 10px; border-radius: 9px; background: var(--g-ink); color: var(--g-panel-raised); }
  .dsh-genui-canvas-action:hover { background: color-mix(in srgb,var(--g-ink) 88%,transparent); color: var(--g-panel-raised); }
  .dsh-genui-open-label { display: inline; }
  .dsh-genui-receipt { align-items: flex-start; flex-wrap: wrap; padding: 8px; }
  .dsh-genui-receipt span { flex-basis: calc(100% - 28px); white-space: normal; }
  .dsh-genui-receipt button { min-height: 40px; margin-left: 22px; }
}
`;

//#endregion
//#region src/client/types.ts
function readMeta(block) {
	if (!("kind" in block) || block.isError) return void 0;
	const raw = block.meta;
	if (typeof raw !== "object" || raw === null) return void 0;
	const value = raw;
	if (value.card !== "genui" || typeof value.artifactId !== "string" || typeof value.title !== "string" || typeof value.versionId !== "string") return void 0;
	return {
		artifactId: value.artifactId,
		title: value.title,
		versionId: value.versionId,
		...typeof value.previewUrl === "string" ? { previewUrl: value.previewUrl } : {}
	};
}

//#endregion
//#region src/client/index.tsx
function IconAction({ label, className = "", children,...props }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: `dsh-genui-action ${className}`,
		"aria-label": label,
		title: label,
		...props,
		children
	});
}
function Receipt({ meta, t, onOpen }) {
	const failed = meta.previewUrl === void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-genui-receipt",
		"data-failed": failed,
		role: failed ? "status" : void 0,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: failed ? "refresh" : "check" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: meta.title }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: failed ? t("receipt.failed") : t("receipt.updated") }),
			failed ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dsh-genui-button",
				onClick: onOpen,
				children: t("receipt.openCurrent")
			})
		]
	});
}
function pendingTitle(argsRaw) {
	try {
		const value = JSON.parse(argsRaw);
		if (typeof value !== "object" || value === null) return void 0;
		const title = value.title;
		return typeof title === "string" && title.trim() !== "" ? title : void 0;
	} catch {
		return;
	}
}
function PendingGenui({ block, t }) {
	const [stage, setStage] = (0, react.useState)(0);
	const updating = block.name === "genui_update";
	const steps = block.name === "genui_rollback" ? [t("progress.restore.prepare"), t("progress.restore.apply")] : updating ? [
		t("progress.update.prepare"),
		t("progress.update.build"),
		t("progress.update.check")
	] : [
		t("progress.create.prepare"),
		t("progress.create.build"),
		t("progress.create.check")
	];
	const title = pendingTitle(block.argsRaw) ?? t("app.untitled");
	(0, react.useEffect)(() => {
		setStage(0);
		const build = window.setTimeout(() => setStage(1), 900);
		const check = window.setTimeout(() => setStage(Math.min(2, steps.length - 1)), 2400);
		return () => {
			window.clearTimeout(build);
			window.clearTimeout(check);
		};
	}, [block.callId, steps.length]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-genui-progress",
		role: "status",
		"aria-live": "polite",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: cardCss }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-genui-progress-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-genui-progress-spinner",
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: steps[stage] })] })]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", {
				"aria-label": t("progress.label"),
				style: { gridTemplateColumns: `repeat(${steps.length},minmax(0,1fr))` },
				children: steps.map((step, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
					"data-state": index < stage ? "done" : index === stage ? "active" : "waiting",
					children: step
				}, step))
			}),
			updating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("progress.update.safe") }) : null
		]
	});
}
function GenuiToolView({ block, callId, sessionId, t }) {
	const meta = readMeta(block);
	const [cardElement, setCardElement] = (0, react.useState)(null);
	const frameRef = (0, react.useRef)(null);
	const noticeTimerRef = (0, react.useRef)();
	const permissionDialogRef = (0, react.useRef)(null);
	const permissionDenyRef = (0, react.useRef)(null);
	const permissionPendingRef = (0, react.useRef)(false);
	const permissionQueueRef = (0, react.useRef)([]);
	const accessDialogRef = (0, react.useRef)(null);
	const accessCloseRef = (0, react.useRef)(null);
	const bodyId = (0, react.useId)();
	const titleId = (0, react.useId)();
	const permissionTitleId = `${titleId}-permission`;
	const permissionDescriptionId = `${titleId}-permission-description`;
	const accessTitleId = `${titleId}-access`;
	const accessDescriptionId = `${titleId}-access-description`;
	const locale = t("locale.code");
	const canvasSessionId = String(sessionId);
	const artifactKey = meta?.artifactId ?? `pending:${callId}`;
	const displayTitle = meta?.title || t("app.untitled");
	const primary = usePrimaryArtifactCard(artifactKey, callId, cardElement, meta?.previewUrl !== void 0);
	const canvasOpen = useCanvasArtifact(canvasSessionId, artifactKey);
	const canvasSurface = useCanvasSurface(canvasOpen, cardElement);
	const previewUrl = meta?.previewUrl === void 0 ? void 0 : previewUrlForLocale(meta, locale);
	const [notice, setNotice] = (0, react.useState)();
	const [fullscreen, setFullscreen] = (0, react.useState)(false);
	const [collapsed, setCollapsed] = (0, react.useState)(false);
	const [frameState, setFrameState] = (0, react.useState)("loading");
	const [frameKey, setFrameKey] = (0, react.useState)(0);
	const [permissionQueue, setPermissionQueue] = (0, react.useState)([]);
	const [permissionPending, setPermissionPending] = (0, react.useState)(false);
	const [permissionError, setPermissionError] = (0, react.useState)();
	const [permissions, setPermissions] = (0, react.useState)();
	const [permissionsLoadedFor, setPermissionsLoadedFor] = (0, react.useState)();
	const [permissionIntroDismissedFor, setPermissionIntroDismissedFor] = (0, react.useState)();
	const [permissionIntroPending, setPermissionIntroPending] = (0, react.useState)(false);
	const [permissionIntroError, setPermissionIntroError] = (0, react.useState)();
	const [accessOpen, setAccessOpen] = (0, react.useState)(false);
	const [accessPending, setAccessPending] = (0, react.useState)();
	const [accessError, setAccessError] = (0, react.useState)();
	const permissionRequest = permissionQueue[0];
	const upfrontPermissions = permissions?.filter((item) => !item.granted) ?? [];
	const permissionsLoaded = meta !== void 0 && permissionsLoadedFor === meta.versionId;
	const permissionIntroOpen = permissionsLoaded && permissionIntroDismissedFor !== meta.versionId && upfrontPermissions.length > 0;
	const frameReadyToOpen = permissionsLoaded && !permissionIntroOpen;
	const announce = (message) => {
		setNotice(message);
		if (noticeTimerRef.current !== void 0) window.clearTimeout(noticeTimerRef.current);
		noticeTimerRef.current = window.setTimeout(() => setNotice(void 0), 4e3);
	};
	(0, react.useEffect)(() => {
		const changed = () => setFullscreen(document.fullscreenElement === cardElement);
		document.addEventListener("fullscreenchange", changed);
		return () => document.removeEventListener("fullscreenchange", changed);
	}, [cardElement]);
	(0, react.useEffect)(() => () => {
		if (noticeTimerRef.current !== void 0) window.clearTimeout(noticeTimerRef.current);
	}, []);
	(0, react.useEffect)(() => () => {
		if (canvasController.isOpen(canvasSessionId, artifactKey)) canvasController.close(canvasSessionId, artifactKey);
	}, [artifactKey, canvasSessionId]);
	(0, react.useEffect)(() => {
		setFrameState("loading");
	}, [previewUrl, meta?.versionId]);
	(0, react.useEffect)(() => {
		if (meta === void 0 || previewUrl === void 0) {
			setPermissions(void 0);
			setPermissionsLoadedFor(meta?.versionId);
			return;
		}
		setPermissionsLoadedFor(void 0);
		let active = true;
		listPermissions(meta, meta.versionId).then((result) => {
			if (active) {
				setPermissions(result.permissions);
				if (result.permissions.every((item) => item.granted)) setPermissionIntroDismissedFor(meta.versionId);
				setPermissionsLoadedFor(meta.versionId);
			}
		}, () => {
			if (active) {
				setPermissions(void 0);
				setPermissionsLoadedFor(meta.versionId);
			}
		});
		return () => {
			active = false;
		};
	}, [
		meta?.artifactId,
		meta?.versionId,
		previewUrl
	]);
	(0, react.useEffect)(() => {
		if (meta === void 0 || previewUrl === void 0 || !frameReadyToOpen) return;
		setFrameState("loading");
		const receive = (event) => {
			if (isGenuiReadyMessage(event, frameRef.current?.contentWindow ?? null, meta.artifactId, meta.versionId)) setFrameState("ready");
			else if (isGenuiRuntimeErrorMessage(event, frameRef.current?.contentWindow ?? null, meta.artifactId, meta.versionId)) setFrameState("failed");
		};
		const timeout = window.setTimeout(() => setFrameState((state) => state === "loading" ? "failed" : state), 8e3);
		window.addEventListener("message", receive);
		frameRef.current?.contentWindow?.postMessage({
			source: "dsh-genui",
			type: "ready-request",
			artifactId: meta.artifactId,
			versionId: meta.versionId
		}, "*");
		return () => {
			window.clearTimeout(timeout);
			window.removeEventListener("message", receive);
		};
	}, [
		frameKey,
		frameReadyToOpen,
		meta?.artifactId,
		meta?.versionId,
		previewUrl
	]);
	(0, react.useEffect)(() => {
		if (meta === void 0) return;
		const receive = (event) => {
			if (event.source !== frameRef.current?.contentWindow || typeof event.data !== "object" || event.data === null) return;
			const value = event.data;
			if (value.source === "dsh-genui" && value.type === "state-changed" && value.artifactId === meta.artifactId && value.versionId === meta.versionId) announce(t("feedback.saved"));
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [meta?.artifactId, meta?.versionId]);
	(0, react.useEffect)(() => {
		if (meta === void 0) return;
		const receive = (event) => {
			if (event.source !== frameRef.current?.contentWindow || typeof event.data !== "object" || event.data === null) return;
			const value = event.data;
			if (value.source !== "dsh-genui" || value.type !== "permission-request" || value.artifactId !== meta.artifactId || value.versionId !== meta.versionId || typeof value.requestId !== "string" || typeof value.permission !== "object" || value.permission === null) return;
			const permission = value.permission;
			if (typeof permission.id !== "string" || typeof permission.label !== "string" || typeof permission.reason !== "string" || permission.kind !== "tool" && permission.kind !== "external" || permission.access !== "read" && permission.access !== "write") return;
			setPermissionError(void 0);
			const request = {
				requestId: value.requestId,
				permission: {
					id: permission.id,
					kind: permission.kind,
					label: permission.label,
					reason: permission.reason,
					access: permission.access,
					...typeof permission.destination === "string" ? { destination: permission.destination } : {},
					...Array.isArray(permission.methods) ? { methods: permission.methods.filter((item) => typeof item === "string") } : {}
				}
			};
			setPermissionQueue((current) => {
				const next = enqueuePermission(current, request);
				permissionQueueRef.current = next;
				return next;
			});
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [meta?.artifactId, meta?.versionId]);
	(0, react.useEffect)(() => {
		permissionQueueRef.current = [];
		setPermissionQueue([]);
		setPermissionError(void 0);
		setPermissionIntroDismissedFor(void 0);
		setPermissionIntroPending(false);
		setPermissionIntroError(void 0);
	}, [meta?.versionId]);
	(0, react.useEffect)(() => {
		permissionPendingRef.current = permissionPending;
	}, [permissionPending]);
	(0, react.useEffect)(() => {
		if (permissionRequest === void 0) return;
		setAccessOpen(false);
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
		const focusFrame = window.requestAnimationFrame(() => permissionDenyRef.current?.focus());
		const keydown = (event) => {
			if (event.key === "Escape" && !permissionPendingRef.current) {
				event.preventDefault();
				const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id);
				settled.answered.forEach((request) => answerPermission(request.requestId, false));
				permissionQueueRef.current = settled.remaining;
				setPermissionQueue(settled.remaining);
				setPermissionError(void 0);
				return;
			}
			if (event.key !== "Tab") return;
			const buttons = [...permissionDialogRef.current?.querySelectorAll("button:not(:disabled)") ?? []];
			if (buttons.length === 0) return;
			const first = buttons[0];
			const last = buttons.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", keydown);
		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("keydown", keydown);
			previousFocus?.focus({ preventScroll: true });
		};
	}, [permissionRequest?.requestId]);
	(0, react.useEffect)(() => {
		if (!accessOpen && !permissionIntroOpen) return;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
		const focusFrame = window.requestAnimationFrame(() => accessCloseRef.current?.focus());
		const keydown = (event) => {
			if (event.key === "Escape" && accessPending === void 0 && !permissionIntroPending) {
				event.preventDefault();
				if (permissionIntroOpen && meta !== void 0) setPermissionIntroDismissedFor(meta.versionId);
				else setAccessOpen(false);
				return;
			}
			if (event.key !== "Tab") return;
			const buttons = [...accessDialogRef.current?.querySelectorAll("button:not(:disabled)") ?? []];
			if (buttons.length === 0) return;
			const first = buttons[0];
			const last = buttons.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", keydown);
		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("keydown", keydown);
			previousFocus?.focus({ preventScroll: true });
		};
	}, [
		accessOpen,
		accessPending,
		meta?.versionId,
		permissionIntroOpen,
		permissionIntroPending
	]);
	if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingGenui, {
		block,
		t
	});
	if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { hidden: true });
	if (!primary) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: setCardElement,
		className: "dsh-genui-receipt-shell",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: cardCss }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Receipt, {
			meta,
			t,
			onOpen: () => artifactCardLedger.focusPrimary(meta.artifactId)
		})]
	});
	const toggleFullscreen = async () => {
		try {
			if (document.fullscreenElement === cardElement) await document.exitFullscreen();
			else {
				setCollapsed(false);
				await cardElement?.requestFullscreen();
			}
		} catch {
			announce(t("feedback.fullscreenFailed"));
		}
	};
	const toggleCanvas = async () => {
		if (canvasOpen) {
			if (document.fullscreenElement === cardElement) await document.exitFullscreen();
			canvasController.close(canvasSessionId, artifactKey);
			const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			window.setTimeout(() => cardElement?.scrollIntoView({
				behavior: reducedMotion ? "auto" : "smooth",
				block: "center"
			}), 0);
		} else {
			setCollapsed(false);
			canvasController.open(canvasSessionId, artifactKey);
		}
	};
	const answerPermission = (requestId, granted) => {
		frameRef.current?.contentWindow?.postMessage({
			source: "dsh-genui",
			type: "permission-result",
			requestId,
			granted
		}, "*");
	};
	const denyPermission = () => {
		if (permissionRequest === void 0 || permissionPending) return;
		const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id);
		settled.answered.forEach((request) => answerPermission(request.requestId, false));
		permissionQueueRef.current = settled.remaining;
		setPermissionQueue(settled.remaining);
		setPermissionError(void 0);
	};
	const allowPermission = async () => {
		if (permissionRequest === void 0 || permissionPending) return;
		setPermissionPending(true);
		setPermissionError(void 0);
		try {
			await grantPermission(meta, meta.versionId, permissionRequest.permission.id);
			setPermissions((current) => current?.map((item) => item.id === permissionRequest.permission.id ? {
				...item,
				granted: true
			} : item));
			const settled = settlePermission(permissionQueueRef.current, permissionRequest.permission.id);
			settled.answered.forEach((request) => answerPermission(request.requestId, true));
			permissionQueueRef.current = settled.remaining;
			setPermissionQueue(settled.remaining);
		} catch {
			setPermissionError(t("permission.failed"));
		} finally {
			setPermissionPending(false);
		}
	};
	const dismissPermissionIntro = () => {
		if (meta === void 0 || permissionIntroPending) return;
		setPermissionIntroDismissedFor(meta.versionId);
		setPermissionIntroError(void 0);
		setFrameState("loading");
	};
	const allowAllUpfrontPermissions = async () => {
		if (meta === void 0 || permissionIntroPending) return;
		setPermissionIntroPending(true);
		setPermissionIntroError(void 0);
		try {
			await grantAllPermissions(meta, meta.versionId);
			setPermissions((current) => current?.map((item) => ({
				...item,
				granted: true
			})));
			setPermissionIntroDismissedFor(meta.versionId);
			setFrameState("loading");
		} catch {
			setPermissionIntroError(t("permission.failed"));
		} finally {
			setPermissionIntroPending(false);
		}
	};
	const openAccess = async () => {
		setAccessOpen(true);
		setAccessError(void 0);
		try {
			setPermissions((await listPermissions(meta, meta.versionId)).permissions);
		} catch {
			setAccessError(t("access.failed"));
		}
	};
	const removeAccess = async (capabilityId) => {
		if (accessPending !== void 0) return;
		setAccessPending(capabilityId);
		setAccessError(void 0);
		try {
			await revokePermission(meta, capabilityId);
			setPermissions((current) => current?.map((item) => item.id === capabilityId ? {
				...item,
				granted: false
			} : item));
			announce(t("access.revoked"));
		} catch {
			setAccessError(t("access.failed"));
		} finally {
			setAccessPending(void 0);
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-genui-anchor",
		"data-canvas-open": canvasOpen || void 0,
		children: [canvasOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-genui-canvas-placeholder",
			onClick: () => {
				toggleCanvas();
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "panel-right" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: displayTitle }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("app.canvasReturn") })
			]
		}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
			ref: setCardElement,
			tabIndex: -1,
			className: "dsh-genui-card",
			"data-collapsed": collapsed,
			"data-surface": canvasOpen ? "canvas" : "inline",
			"data-canvas-layout": canvasOpen ? canvasSurface.mode : void 0,
			"aria-labelledby": titleId,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: cardCss }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "dsh-genui-head",
					children: [
						previewUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconAction, {
							className: "dsh-genui-collapse",
							label: collapsed ? t("app.show") : t("app.hide"),
							"aria-expanded": !collapsed,
							"aria-controls": bodyId,
							onClick: () => setCollapsed((value) => !value),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: collapsed ? "chevron-down" : "chevron-up" })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-genui-name",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								id: titleId,
								className: "dsh-genui-title",
								children: displayTitle
							})
						}),
						previewUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-genui-actions",
							children: [
								permissions?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconAction, {
									label: t("access.open"),
									onClick: () => {
										openAccess();
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "shield" })
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(IconAction, {
									className: "dsh-genui-canvas-action",
									label: canvasOpen ? t("action.closeCanvas") : t("action.openCanvas"),
									onClick: () => {
										toggleCanvas();
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: canvasOpen ? "panel-right-close" : "panel-right" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-genui-open-label",
										children: canvasOpen ? t("action.closeCanvas") : t("app.open")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconAction, {
									className: "dsh-genui-fullscreen",
									label: fullscreen ? t("action.exitFullscreen") : t("action.fullscreen"),
									onClick: toggleFullscreen,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: fullscreen ? "minimize" : "maximize" })
								})
							]
						})
					]
				}),
				notice === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-genui-toast",
					role: "status",
					"aria-live": "polite",
					children: notice
				}),
				!permissionIntroOpen ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-genui-permission-backdrop",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						ref: accessDialogRef,
						className: "dsh-genui-access",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": accessTitleId,
						"aria-describedby": accessDescriptionId,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-genui-access-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-genui-permission-mark",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "shield" })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
									id: accessTitleId,
									children: t("permission.upfrontTitle")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									id: accessDescriptionId,
									children: t("permission.upfrontDescription")
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-access-list",
								children: upfrontPermissions.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-genui-access-row",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.label }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.reason }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-genui-access-facts",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.access === "write" ? t("permission.write") : t("permission.read") }),
												item.destination === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("permission.connect"),
													" ",
													item.destination
												] }),
												item.methods?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("permission.methods"),
													" ",
													item.methods.join(" / ")
												] }) : null
											]
										})
									] })
								}, item.id))
							}),
							permissionIntroError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-genui-permission-error",
								role: "alert",
								children: permissionIntroError
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-genui-permission-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									ref: accessCloseRef,
									type: "button",
									className: "dsh-genui-button",
									disabled: permissionIntroPending,
									onClick: dismissPermissionIntro,
									children: t("permission.deny")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-genui-button dsh-genui-button--strong",
									disabled: permissionIntroPending,
									onClick: () => {
										allowAllUpfrontPermissions();
									},
									children: permissionIntroPending ? t("permission.allowing") : t("permission.upfrontAllow")
								})]
							})
						]
					})
				}),
				permissionRequest === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-genui-permission-backdrop",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						ref: permissionDialogRef,
						className: "dsh-genui-permission",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": permissionTitleId,
						"aria-describedby": permissionDescriptionId,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-permission-mark",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "check" })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-genui-permission-copy",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-genui-permission-kicker",
										children: t("permission.title")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
										id: permissionTitleId,
										children: permissionRequest.permission.label
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										id: permissionDescriptionId,
										children: permissionRequest.permission.reason
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-genui-permission-facts",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: permissionRequest.permission.access === "write" ? t("permission.write") : t("permission.read") }),
											permissionRequest.permission.destination === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												t("permission.connect"),
												" ",
												permissionRequest.permission.destination
											] }),
											permissionRequest.permission.methods?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												t("permission.methods"),
												" ",
												permissionRequest.permission.methods.join(" / ")
											] }) : null
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-genui-permission-scope",
										children: t("permission.scope")
									}),
									permissionQueue.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-genui-permission-queue",
										children: t("permission.queued", { count: permissionQueue.length - 1 })
									}) : null,
									permissionError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-genui-permission-error",
										role: "alert",
										children: permissionError
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-genui-permission-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									ref: permissionDenyRef,
									type: "button",
									className: "dsh-genui-button",
									disabled: permissionPending,
									onClick: denyPermission,
									children: t("permission.deny")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-genui-button dsh-genui-button--strong",
									disabled: permissionPending,
									onClick: () => {
										allowPermission();
									},
									children: permissionPending ? t("permission.allowing") : t("permission.allow")
								})]
							})
						]
					})
				}),
				!accessOpen || permissionRequest !== void 0 || permissionIntroOpen ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-genui-permission-backdrop",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						ref: accessDialogRef,
						className: "dsh-genui-access",
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": accessTitleId,
						"aria-describedby": accessDescriptionId,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-genui-access-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-genui-permission-mark",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "shield" })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
									id: accessTitleId,
									children: t("access.title")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									id: accessDescriptionId,
									children: t("access.description")
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-access-list",
								children: permissions?.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-genui-access-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.label }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.reason }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-genui-access-facts",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.access === "write" ? t("permission.write") : t("permission.read") }),
												item.destination === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("permission.connect"),
													" ",
													item.destination
												] }),
												item.methods?.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("permission.methods"),
													" ",
													item.methods.join(" / ")
												] }) : null
											]
										})
									] }), item.granted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-genui-button",
										disabled: accessPending !== void 0,
										onClick: () => {
											removeAccess(item.id);
										},
										children: accessPending === item.id ? t("access.revoking") : t("access.revoke")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsh-genui-access-state",
										children: t("access.notAllowed")
									})]
								}, item.id))
							}),
							accessError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-genui-permission-error",
								role: "alert",
								children: accessError
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-permission-actions",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									ref: accessCloseRef,
									type: "button",
									className: "dsh-genui-button dsh-genui-button--strong",
									disabled: accessPending !== void 0,
									onClick: () => setAccessOpen(false),
									children: t("access.close")
								})
							})
						]
					})
				}),
				previewUrl === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-genui-error",
					role: "status",
					children: t("receipt.unavailable")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					id: bodyId,
					className: "dsh-genui-body",
					hidden: collapsed,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-genui-frame-shell",
						children: [
							frameReadyToOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
								ref: frameRef,
								className: "dsh-genui-frame",
								title: displayTitle,
								src: previewUrl,
								sandbox: "allow-scripts allow-forms allow-modals allow-downloads",
								referrerPolicy: "no-referrer",
								onLoad: () => frameRef.current?.contentWindow?.postMessage({
									source: "dsh-genui",
									type: "ready-request",
									artifactId: meta.artifactId,
									versionId: meta.versionId
								}, "*"),
								onError: () => setFrameState("failed")
							}, frameKey) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-loading",
								hidden: frameState !== "loading",
								role: "status",
								"aria-live": "polite",
								children: t("app.loading")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-genui-frame-error",
								hidden: frameState !== "failed",
								role: "alert",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("app.loadFailed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-genui-button",
									onClick: () => {
										setFrameState("loading");
										setFrameKey((value) => value + 1);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellIcon, { name: "refresh" }), t("app.reload")]
								})] })
							})
						]
					})
				})
			]
		})]
	});
}
const inject = ["slots", "locale"];
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "genui: dictionaries");
	const BoundGenuiToolView = (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenuiToolView, { ...props });
	const HiddenGenuiToolView = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { hidden: true });
	ctx.slots.inject("tool.call.toolview", function* () {
		for (const key of [
			"genui_create",
			"genui_update",
			"genui_rollback"
		]) yield ctx.slots.register({
			name: "tool.call.toolview",
			key,
			locale: NS
		}, BoundGenuiToolView);
		for (const key of [
			"genui_design_list",
			"genui_design_import",
			"genui_design_export",
			"genui_inspect",
			"genui_state_read"
		]) yield ctx.slots.register({
			name: "tool.call.toolview",
			key
		}, HiddenGenuiToolView);
	});
	ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({ ...settingsSlotRegistration() }, DesignSettingsCard));
}

//#endregion
exports.GenuiToolView = GenuiToolView;
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map