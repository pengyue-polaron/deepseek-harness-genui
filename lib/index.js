import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
import { basename, dirname, extname, isAbsolute, normalize, posix, resolve, sep } from "node:path";
import { SessionId } from "@deepseek-ai/dsh-session";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { CallId } from "@deepseek-ai/dsh-llm";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { build } from "esbuild";

//#region src/config.ts
const Config = z.object({
	artifactRoot: z.string().default(".dsh/genui"),
	routePrefix: z.string().default("/genui"),
	maxSourceBytes: z.natural().min(16384).max(16 * 1024 * 1024).default(1024 * 1024)
});
function resolveConfig(config = {}) {
	const routePrefix = config.routePrefix ?? "/genui";
	if (!/^\/[a-z0-9/_-]*[a-z0-9_-]$/i.test(routePrefix) || routePrefix.includes("//")) throw new Error("routePrefix must be an absolute path without a trailing slash");
	return {
		artifactRoot: config.artifactRoot ?? ".dsh/genui",
		routePrefix,
		maxSourceBytes: config.maxSourceBytes ?? 1024 * 1024
	};
}

//#endregion
//#region src/artifacts/paths.ts
const SOURCE_PREFIXES = ["src/", "public/"];
const ROOT_FILES = new Set(["artifact.manifest.json", "DESIGN.md"]);
function assertArtifactId(value) {
	if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value)) throw new Error("artifact id must be 3-64 lowercase letters, digits, or hyphens");
	return value;
}
function normalizeSourcePath(value) {
	if (value.length === 0 || value.includes("\\") || isAbsolute(value)) throw new Error(`invalid source path: ${value}`);
	const candidate = posix.normalize(value);
	if (candidate === ".." || candidate.startsWith("../") || candidate.includes("/../")) throw new Error(`source path escapes artifact: ${value}`);
	if (!ROOT_FILES.has(candidate) && !SOURCE_PREFIXES.some((prefix) => candidate.startsWith(prefix))) throw new Error(`source path must be under src/ or public/: ${value}`);
	return candidate;
}
function safeJoin(root, ...segments) {
	const resolvedRoot = resolve(root);
	const target = resolve(resolvedRoot, ...segments);
	if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) throw new Error("resolved path escapes artifact root");
	return normalize(target);
}

//#endregion
//#region src/lifecycle.ts
const TASK_TTL_MS = 10080 * 60 * 1e3;
const VERIFICATION_TOKEN_TTL_MS = 300 * 1e3;
const MAX_VERSIONS_PER_ARTIFACT = 20;

//#endregion
//#region src/artifacts/registry.ts
const RECORD_FILE = "artifact.json";
async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}
async function atomicJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384
	});
	await rename(temporary, path);
}
function sourceBytes(files) {
	return files.reduce((total, file) => total + Buffer.byteLength(file.path) + Buffer.byteLength(file.content), 0);
}
function normalizeFiles(files, maxSourceBytes) {
	const byPath = /* @__PURE__ */ new Map();
	for (const file of files) {
		const path = normalizeSourcePath(file.path);
		if (byPath.has(path)) throw new Error(`duplicate source path: ${path}`);
		byPath.set(path, {
			path,
			content: file.content
		});
	}
	const normalized = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
	if (!normalized.some((file) => file.path === "src/main.tsx")) throw new Error("src/main.tsx is required");
	if (sourceBytes(normalized) > maxSourceBytes) throw new Error(`artifact source exceeds ${maxSourceBytes} bytes`);
	return normalized;
}
function requirementId() {
	return `req-${randomUUID().slice(0, 8)}`;
}
const HTTP_METHODS = new Set([
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE"
]);
function normalizeCapabilities(capabilities) {
	const byId = /* @__PURE__ */ new Map();
	for (const capability of capabilities) {
		if (!/^[a-z][a-z0-9-]{1,63}$/.test(capability.id)) throw new Error(`invalid capability id: ${capability.id}`);
		if (byId.has(capability.id)) throw new Error(`duplicate capability id: ${capability.id}`);
		const label = capability.label.trim();
		const reason = capability.reason.trim();
		if (label.length < 2 || label.length > 80) throw new Error(`invalid capability label: ${capability.id}`);
		if (reason.length < 4 || reason.length > 240) throw new Error(`invalid capability reason: ${capability.id}`);
		if (capability.access !== "read" && capability.access !== "write") throw new Error(`invalid capability access: ${capability.id}`);
		if (capability.kind === "tool") {
			if (capability.tool.trim() === "" || capability.tool.startsWith("genui_")) throw new Error(`invalid tool capability: ${capability.id}`);
			byId.set(capability.id, {
				...capability,
				label,
				reason,
				tool: capability.tool.trim()
			});
			continue;
		}
		const target = new URL(capability.urlPrefix);
		if (target.protocol !== "https:" || target.username !== "" || target.password !== "" || target.hash !== "") throw new Error(`external capability must use a credential-free HTTPS URL: ${capability.id}`);
		const methods = [...new Set(capability.methods.map((method) => method.toUpperCase()))];
		if (methods.length === 0 || methods.some((method) => !HTTP_METHODS.has(method))) throw new Error(`invalid external methods: ${capability.id}`);
		byId.set(capability.id, {
			...capability,
			label,
			reason,
			urlPrefix: target.toString(),
			methods
		});
	}
	return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
var ArtifactRegistry = class {
	root;
	mutationQueues = /* @__PURE__ */ new Map();
	constructor(root, maxSourceBytes) {
		this.maxSourceBytes = maxSourceBytes;
		this.root = resolve(root);
	}
	async init() {
		await mkdir(this.root, {
			recursive: true,
			mode: 448
		});
		const entries = await readdir(this.root, { withFileTypes: true });
		await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
			try {
				const id = assertArtifactId(entry.name);
				const record = await readJson(this.recordPath(id));
				if (Date.parse(record.updatedAt) + TASK_TTL_MS <= Date.now()) await rm(safeJoin(this.root, id), {
					recursive: true,
					force: true
				});
			} catch (error) {
				if (error.code !== "ENOENT" && !(error instanceof Error && error.message.startsWith("artifact id must be"))) throw error;
			}
		}));
	}
	recordPath(id) {
		return safeJoin(this.root, assertArtifactId(id), RECORD_FILE);
	}
	versionPath(id, versionId) {
		if (!/^v-[a-f0-9-]{36}$/.test(versionId)) throw new Error("invalid version id");
		return safeJoin(this.root, assertArtifactId(id), "versions", versionId, "version.json");
	}
	distPath(id, versionId) {
		return safeJoin(dirname(this.versionPath(id, versionId)), "dist");
	}
	async get(id) {
		return readJson(this.recordPath(id));
	}
	async getVersion(id, versionId) {
		const record = await this.get(id);
		const selected = versionId ?? record.currentVersionId ?? record.latestVersionId;
		return readJson(this.versionPath(id, selected));
	}
	async create(input) {
		const id = assertArtifactId(input.id);
		return this.withMutationLock(id, async () => {
			try {
				await this.get(id);
				throw new Error(`artifact already exists: ${id}`);
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("artifact already exists:")) throw error;
				if (error.code !== "ENOENT") throw error;
			}
			const versionId = `v-${randomUUID()}`;
			const now = (/* @__PURE__ */ new Date()).toISOString();
			const requirements = input.requirements.map((text) => ({
				id: requirementId(),
				text,
				status: "active",
				introducedIn: versionId
			}));
			const version = this.makeCandidate(id, versionId, void 0, input.summary, input.files, requirements, input.capabilities, now);
			const record = {
				id,
				title: input.title,
				createdAt: now,
				updatedAt: now,
				latestVersionId: versionId,
				versions: [versionId],
				states: {},
				grants: {}
			};
			await atomicJson(this.versionPath(id, versionId), version);
			await this.saveRecord(record);
			return version;
		});
	}
	async update(input) {
		return this.withMutationLock(input.id, async () => {
			const record = await this.get(input.id);
			const expectedBaseVersionId = record.currentVersionId ?? record.latestVersionId;
			if (expectedBaseVersionId !== input.baseVersionId) throw new Error(`base version is stale; expected ${expectedBaseVersionId}`);
			const base = await this.getVersion(input.id, input.baseVersionId);
			const files = new Map(base.files.map((file) => [file.path, file]));
			for (const patch of input.patches) {
				const path = normalizeSourcePath(patch.path);
				if (patch.delete === true) files.delete(path);
				else if (patch.content !== void 0) files.set(path, {
					path,
					content: patch.content
				});
				else throw new Error(`patch must provide content or delete: ${path}`);
			}
			const versionId = `v-${randomUUID()}`;
			const superseded = new Set(input.supersedeRequirements ?? []);
			const requirements = base.requirements.map((requirement) => superseded.has(requirement.id) ? {
				...requirement,
				status: "superseded"
			} : requirement);
			for (const text of input.addRequirements ?? []) requirements.push({
				id: requirementId(),
				text,
				status: "active",
				introducedIn: versionId
			});
			const now = (/* @__PURE__ */ new Date()).toISOString();
			const version = this.makeCandidate(input.id, versionId, base.id, input.summary, [...files.values()], requirements, input.capabilities ?? base.capabilities, now);
			record.updatedAt = now;
			record.latestVersionId = versionId;
			record.versions.push(versionId);
			await atomicJson(this.versionPath(input.id, versionId), version);
			await this.saveRecord(record);
			return version;
		});
	}
	async settle(id, versionId, evidence) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const version = await this.getVersion(id, versionId);
			if (version.status !== "candidate") throw new Error(`version is already settled: ${versionId}`);
			version.evidence = evidence;
			version.status = evidence.build === "passed" && evidence.browser !== "failed" ? "ready" : "failed";
			if (version.status === "ready") record.currentVersionId = versionId;
			record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			await atomicJson(this.versionPath(id, versionId), version);
			await this.saveRecord(record);
			return version;
		});
	}
	async rollback(id, versionId) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			if ((await this.getVersion(id, versionId)).status !== "ready") throw new Error("rollback target must be a ready version");
			record.currentVersionId = versionId;
			record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			await this.saveRecord(record);
			return record;
		});
	}
	async readState(id, sessionId) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const state = record.states[sessionId];
			if (state === void 0) return void 0;
			if (Date.parse(state.expiresAt) > Date.now()) return structuredClone(state);
			delete record.states[sessionId];
			await this.saveRecord(record);
		});
	}
	async updateState(id, sessionId, updater) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const now = /* @__PURE__ */ new Date();
			const current = record.states[sessionId];
			const values = current === void 0 || Date.parse(current.expiresAt) <= now.valueOf() ? {} : current.values;
			record.states[sessionId] = {
				values: updater(structuredClone(values)),
				updatedAt: now.toISOString(),
				expiresAt: new Date(now.valueOf() + TASK_TTL_MS).toISOString()
			};
			record.updatedAt = now.toISOString();
			await this.saveRecord(record);
			return record;
		});
	}
	async grantCapability(id, sessionId, capabilityId, grant) {
		return this.grantCapabilities(id, sessionId, { [capabilityId]: grant });
	}
	async grantCapabilities(id, sessionId, incoming) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const grants = record.grants[sessionId] ?? {};
			for (const [capabilityId, grant] of Object.entries(incoming)) grants[capabilityId] = grant;
			record.grants[sessionId] = grants;
			record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			await this.saveRecord(record);
			return record;
		});
	}
	async readGrants(id, sessionId) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const grants = record.grants[sessionId];
			if (grants === void 0) return {};
			const active = Object.fromEntries(Object.entries(grants).filter(([, grant]) => Date.parse(grant.expiresAt) > Date.now()));
			if (Object.keys(active).length !== Object.keys(grants).length) {
				if (Object.keys(active).length === 0) delete record.grants[sessionId];
				else record.grants[sessionId] = active;
				await this.saveRecord(record);
			}
			return structuredClone(active);
		});
	}
	async revokeCapability(id, sessionId, capabilityId) {
		return this.withMutationLock(id, async () => {
			const record = await this.get(id);
			const grants = record.grants[sessionId];
			if (grants === void 0 || grants[capabilityId] === void 0) return false;
			delete grants[capabilityId];
			if (Object.keys(grants).length === 0) delete record.grants[sessionId];
			record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			await this.saveRecord(record);
			return true;
		});
	}
	async saveRecord(record) {
		const protectedIds = new Set([record.currentVersionId, record.latestVersionId].filter((value) => value !== void 0));
		const newest = [...record.versions].reverse();
		const retained = new Set(protectedIds);
		for (const versionId of newest) {
			if (retained.size >= MAX_VERSIONS_PER_ARTIFACT) break;
			retained.add(versionId);
		}
		const removed = record.versions.filter((versionId) => !retained.has(versionId));
		if (removed.length > 0) record.versions = record.versions.filter((versionId) => retained.has(versionId));
		await atomicJson(this.recordPath(record.id), record);
		await Promise.all(removed.map((versionId) => rm(dirname(this.versionPath(record.id, versionId)), {
			recursive: true,
			force: true
		})));
	}
	async withMutationLock(id, operation) {
		const previous = this.mutationQueues.get(id) ?? Promise.resolve();
		let release = () => {};
		const current = new Promise((resolve$1) => {
			release = resolve$1;
		});
		const queued = previous.then(() => current);
		this.mutationQueues.set(id, queued);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.mutationQueues.get(id) === queued) this.mutationQueues.delete(id);
		}
	}
	makeCandidate(artifactId, id, parentVersionId, summary, files, requirements, capabilities, createdAt) {
		return {
			id,
			artifactId,
			...parentVersionId === void 0 ? {} : { parentVersionId },
			createdAt,
			summary,
			files: normalizeFiles(files, this.maxSourceBytes),
			requirements,
			capabilities: normalizeCapabilities(capabilities),
			status: "candidate",
			evidence: {
				checkedAt: createdAt,
				build: "failed",
				browser: "not-run",
				diagnostics: [],
				notes: []
			}
		};
	}
};

//#endregion
//#region src/designs/presets.ts
const DESIGN_PRESETS = [
	{
		id: "material-3",
		content: `# Material 3

## Visual language
Use Google's Material 3 design language: expressive but systematic, with tonal color, clear hierarchy, purposeful elevation, and controls that feel direct and touch-friendly. This file controls appearance, not page structure.

## Color
- Define semantic light and dark roles for background, surface, surface-container, outline, primary, secondary, tertiary, success, warning, and error.
- Build the interface from tonal surfaces rather than stacking shadows. Reserve the strongest primary color for the main action and current selection.
- Keep text and controls at WCAG AA contrast. Never rely on color alone for state.

## Typography
- Use Roboto when available, then a clean system sans-serif fallback.
- Use a deliberate type scale with distinct display, headline, title, body, label, and numeric roles.
- Prefer medium weight and size changes for hierarchy. Keep body copy at 14–16px with comfortable line height.

## Shape and elevation
- Use a coherent shape scale: 8px for small controls, 12–16px for fields and cards, and 24–28px only for prominent containers.
- Pills are reserved for filters, compact status, and segmented choices.
- Use tonal elevation first. Add soft shadows only when a surface must visibly float above another.

## Layout rhythm
- Use an 8px spacing grid with 4px for tight internal adjustments.
- Keep touch targets at least 44px. Let layouts reflow instead of shrinking controls on narrow screens.
- Use whitespace and surface tone to group content; do not wrap every block in a card.

## Components
- Buttons, fields, sliders, switches, chips, dialogs, and navigation should share the same color, state, shape, and focus conventions.
- Give every interactive control clear hover, pressed, selected, disabled, and keyboard-focus states.
- Keep labels visible and place validation or recovery text next to the affected control.

## Motion
- Use Material-style emphasized easing for meaningful changes in selection, expansion, and shared position.
- Keep transitions brief, interruptible, and limited to transform and opacity when possible.
- Respect prefers-reduced-motion and keep the final state fully understandable without animation.
`
	},
	{
		id: "apple-human-interface",
		content: `# Apple Human Interface

## Visual language
Use an Apple Human Interface–inspired visual language: calm, precise, content-led, and familiar. Controls should feel native and immediately understandable. This file controls appearance, not page structure.

## Color and materials
- Use semantic system-like colors that adapt cleanly to light and dark mode.
- Build hierarchy with grouped backgrounds, separators, and restrained translucent material. Do not apply glass, blur, or gradients to every surface.
- Keep body text, secondary text, separators, selection, success, warning, and destructive states distinct at WCAG AA contrast.

## Typography
- Use -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", and a system sans-serif fallback.
- Use larger display text sparingly. Most interface text should use 13–17px sizes with compact, readable line height.
- Use weight, alignment, and whitespace before adding color. Use tabular numerals for changing or comparable values.

## Shape and depth
- Use continuous-feeling rounded rectangles: 8–10px for controls and 12–16px for grouped surfaces.
- Prefer hairline separators and subtle material changes over visible card borders.
- Shadows are soft and rare, reserved for menus, sheets, and temporary floating layers.

## Layout rhythm
- Keep the content hierarchy obvious with generous outer margins and compact internal spacing.
- Align labels, values, and controls precisely. Preserve breathing room around the primary content.
- Keep pointer and touch targets at least 44px and account for safe-area insets on full-screen layouts.

## Components
- Use familiar labels and symbols. Icon-only controls require accessible names and should not replace a clearer text action.
- Primary actions are visually clear without becoming oversized. Destructive actions stay explicit and separated from routine actions.
- Use sheets, popovers, and dialogs only for temporary decisions; keep the underlying context visible when useful.

## Motion
- Use quick, natural transitions that reinforce continuity and direct manipulation.
- Avoid decorative looping animation and exaggerated bounce.
- Respect prefers-reduced-motion and keep every action usable without motion.
`
	},
	{
		id: "shadcn-ui",
		content: `# shadcn/ui

## Visual language
Use the crisp, neutral visual language associated with shadcn/ui: semantic tokens, strong component states, thin borders, restrained radius, and excellent form ergonomics. Recreate the visual principles with ordinary CSS; do not assume Tailwind or shadcn components are installed. This file controls appearance, not page structure.

## Tokens and color
- Define light and dark semantic tokens for background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, and ring.
- Use background/foreground pairs so text and icons always match their surface.
- Start from a neutral, zinc, stone, or slate base and add one purposeful brand accent. Keep charts and status colors distinct and accessible.

## Typography
- Use a modern system sans-serif such as Inter or Geist when available, then a system fallback.
- Keep interface text compact: 12px labels, 14–16px body, and 20–30px section headings.
- Use medium and semibold weights for control hierarchy and tabular numerals for aligned values.

## Shape and borders
- Use a shared radius token around 10px, deriving smaller radii for fields and larger radii for dialogs.
- Use 1px borders and visible focus rings. Prefer borders and surface contrast over heavy shadows.
- Do not put every text block inside a card; a card must express a real group or interaction boundary.

## Layout rhythm
- Use a disciplined 4px spacing scale and responsive grid or flex layouts.
- Keep forms compact but never reduce touch targets below 44px on mobile.
- Place labels, descriptions, errors, and actions consistently so users can scan repeated controls.

## Components
- Give buttons, inputs, selects, tabs, tables, dialogs, popovers, tooltips, and toasts consistent hover, active, disabled, and focus-visible states.
- Use explicit labels and concise helper text. Keep errors next to their field and preserve user input after failure.
- Tables and data rows use aligned columns, quiet dividers, and responsive alternatives rather than horizontal overflow.

## Motion
- Use 120–200ms opacity and transform transitions for popovers, dialogs, selection, and disclosure.
- Never use transition: all. Keep motion interruptible and honor prefers-reduced-motion.
`
	}
];

//#endregion
//#region src/designs/store.ts
const LEGACY_DESIGN_ALIASES = {
	"editorial-workbench": "shadcn-ui",
	"field-atlas": "material-3",
	"kinetic-signal": "apple-human-interface",
	"ledger-grid": "shadcn-ui",
	"notion": "shadcn-ui"
};
function designId(value) {
	if (!/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("design id must be 3-64 lowercase letters, digits, or hyphens and start with a letter");
	return value;
}
function titleOf(content, id) {
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	return heading && heading.length <= 120 ? heading : id;
}
var DesignStore = class {
	root;
	selectedDefault;
	constructor(root) {
		this.root = resolve(root);
	}
	async init() {
		await mkdir(this.root, {
			recursive: true,
			mode: 448
		});
		await Promise.all(DESIGN_PRESETS.map(async (preset) => {
			try {
				await writeFile(this.path(preset.id), preset.content, {
					encoding: "utf8",
					mode: 384,
					flag: "wx"
				});
			} catch (error) {
				if (error.code !== "EEXIST") throw error;
			}
		}));
		try {
			const parsed = JSON.parse(await readFile(this.settingsPath(), "utf8"));
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("design settings must be an object");
			const value = parsed.defaultDesignId;
			if (value !== null && typeof value !== "string") throw new Error("defaultDesignId must be a design id or null");
			if (typeof value === "string") {
				const migrated = LEGACY_DESIGN_ALIASES[value] ?? value;
				await this.get(migrated);
				this.selectedDefault = migrated;
				if (migrated !== value) await this.persistDefault(migrated);
			}
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	defaultId() {
		return this.selectedDefault;
	}
	isBuiltin(id) {
		return DESIGN_PRESETS.some((preset) => preset.id === id);
	}
	async setDefault(id) {
		const safeId = id === void 0 ? void 0 : (await this.get(id)).id;
		await this.persistDefault(safeId);
		this.selectedDefault = safeId;
	}
	async list() {
		const entries = await readdir(this.root, { withFileTypes: true });
		const designs = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && LEGACY_DESIGN_ALIASES[basename(entry.name, ".md")] === void 0).map(async (entry) => {
			const id = basename(entry.name, ".md");
			return {
				id,
				title: titleOf(await readFile(this.path(id), "utf8"), id)
			};
		}));
		const builtinOrder = new Map(DESIGN_PRESETS.map((preset, index) => [preset.id, index]));
		return designs.sort((a, b) => {
			const aOrder = builtinOrder.get(a.id);
			const bOrder = builtinOrder.get(b.id);
			if (aOrder !== void 0 || bOrder !== void 0) return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
			return a.id.localeCompare(b.id);
		});
	}
	async get(id) {
		const safeId = designId(id);
		const content = await readFile(this.path(safeId), "utf8");
		return {
			id: safeId,
			title: titleOf(content, safeId),
			content
		};
	}
	async put(id, content) {
		const safeId = designId(id);
		if (!content.trim().startsWith("# ")) throw new Error("DESIGN.md must start with a level-one heading");
		if (Buffer.byteLength(content) > 128 * 1024) throw new Error("DESIGN.md exceeds 128 KiB");
		const path = this.path(safeId);
		const temporary = `${path}.${randomUUID()}.tmp`;
		await writeFile(temporary, content, {
			encoding: "utf8",
			mode: 384
		});
		await rename(temporary, path);
		return {
			id: safeId,
			title: titleOf(content, safeId),
			content
		};
	}
	path(id) {
		return resolve(this.root, `${designId(id)}.md`);
	}
	settingsPath() {
		return resolve(this.root, "settings.json");
	}
	async persistDefault(id) {
		const path = this.settingsPath();
		const temporary = `${path}.${randomUUID()}.tmp`;
		await writeFile(temporary, `${JSON.stringify({ defaultDesignId: id ?? null }, null, 2)}\n`, {
			encoding: "utf8",
			mode: 384
		});
		await rename(temporary, path);
	}
};

//#endregion
//#region src/runtime/capabilities.ts
async function persistentSecret(path) {
	try {
		return await readFile(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const secret = randomBytes(32);
	try {
		const handle = await open(path, "wx", 384);
		try {
			await handle.writeFile(secret);
		} finally {
			await handle.close();
		}
		return secret;
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		return readFile(path);
	}
}
function encode(payload) {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}
function decode(value) {
	try {
		const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
		if (typeof parsed !== "object" || parsed === null) return void 0;
		const payload = parsed;
		if (payload.version !== 1 || typeof payload.artifactId !== "string" || typeof payload.sessionId !== "string" || payload.mode !== "interactive" && payload.mode !== "verification" || typeof payload.nonce !== "string" || typeof payload.expiresAt !== "number") return void 0;
		return payload;
	} catch {
		return;
	}
}
var CapabilityStore = class CapabilityStore {
	agents = /* @__PURE__ */ new Map();
	revoked = /* @__PURE__ */ new Set();
	interactiveTokens = /* @__PURE__ */ new Map();
	constructor(resolveAgent, secret = randomBytes(32)) {
		this.resolveAgent = resolveAgent;
		this.secret = secret;
	}
	static async persistent(path, resolveAgent) {
		return new CapabilityStore(resolveAgent, await persistentSecret(path));
	}
	issue(artifactId, agent, mode = "interactive") {
		const sessionId = String(agent.id);
		this.agents.set(sessionId, agent);
		const tokenKey = `${artifactId}\0${sessionId}`;
		const current = this.interactiveTokens.get(tokenKey);
		if (mode === "interactive" && current !== void 0 && current.expiresAt > Date.now()) return current.token;
		const expiresAt = Date.now() + (mode === "verification" ? VERIFICATION_TOKEN_TTL_MS : TASK_TTL_MS);
		const payload = encode({
			version: 1,
			artifactId,
			sessionId,
			mode,
			nonce: mode === "interactive" ? "task" : randomBytes(16).toString("base64url"),
			expiresAt
		});
		const token = `${payload}.${this.sign(payload)}`;
		if (mode === "interactive") this.interactiveTokens.set(tokenKey, {
			token,
			expiresAt
		});
		return token;
	}
	resolve(token, artifactId) {
		if (this.revoked.has(token)) return void 0;
		const parts = token.split(".");
		if (parts.length !== 2) return void 0;
		const [encoded = "", signature = ""] = parts;
		const expected = Buffer.from(this.sign(encoded), "base64url");
		const received = Buffer.from(signature, "base64url");
		if (expected.length !== received.length || !timingSafeEqual(expected, received)) return void 0;
		const payload = decode(encoded);
		if (payload === void 0 || payload.artifactId !== artifactId || payload.expiresAt <= Date.now()) return void 0;
		const agent = this.agents.get(payload.sessionId) ?? this.resolveAgent?.(payload.sessionId);
		if (agent === void 0) return void 0;
		return {
			artifactId: payload.artifactId,
			sessionId: payload.sessionId,
			agent,
			mode: payload.mode
		};
	}
	revoke(token) {
		this.revoked.add(token);
	}
	clear() {
		this.agents.clear();
		this.revoked.clear();
		this.interactiveTokens.clear();
	}
	sign(payload) {
		return createHmac("sha256", this.secret).update(payload).digest("base64url");
	}
};

//#endregion
//#region src/runtime/discovery-budget.ts
const MAX_DISCOVERY_CALLS_PER_SOURCE = 2;
const MAX_READ_CALLS_PER_SOURCE = 4;
const MAX_READ_CALLS_PER_TURN = 6;
const DISCOVERY_VERBS = /(?:^|_)(?:browse|discover|find|list|lookup|query|search|whoami)(?:_|$)/i;
const MUTATION_VERBS = /(?:^|_)(?:add|approve|cancel|create|delete|execute|merge|move|post|put|remove|run|send|set|start|stop|trigger|update|upload|write)(?:_|$)/i;
function mcpCall(name$1, args) {
	const match = /^mcp__(.+?)__(.+)$/.exec(name$1);
	if (match === null) return void 0;
	const source = match[1];
	const operation = match[2];
	if (MUTATION_VERBS.test(operation)) return void 0;
	const fsCommand = operation === "hf_fs" && typeof args === "object" && args !== null && "cmd" in args ? String(args.cmd ?? "") : "";
	return {
		source,
		discovery: DISCOVERY_VERBS.test(operation) || /^(?:ls|search)$/.test(fsCommand)
	};
}
function connectedRead(exec) {
	if (String(exec.callId).startsWith("genui-") || exec.name.startsWith("genui_")) return void 0;
	const mcp = mcpCall(exec.name, exec.arguments);
	if (mcp !== void 0) return mcp;
	if (exec.name === "web_search" || exec.name === "web_fetch") return {
		source: "web",
		discovery: true
	};
}
function denial(source, limit) {
	return `You reached ${limit === "discovery" ? `the discovery limit for ${source}` : limit === "source" ? `the read limit for ${source}` : "the connected-source read limit for this turn"}. Do not try another query or connected read to work around the limit. Use the successful evidence already returned, state any remaining uncertainty briefly, then answer or create the useful interactive surface now.`;
}
var DiscoveryBudget = class {
	usage = /* @__PURE__ */ new WeakMap();
	reset(agent) {
		this.usage.delete(agent);
	}
	check(exec) {
		if (exec.agent === void 0) return void 0;
		const call = connectedRead(exec);
		if (call === void 0) return void 0;
		const turn = this.usage.get(exec.agent) ?? {
			reads: 0,
			sources: /* @__PURE__ */ new Map()
		};
		const source = turn.sources.get(call.source) ?? {
			discovery: 0,
			reads: 0
		};
		if (call.discovery && source.discovery >= MAX_DISCOVERY_CALLS_PER_SOURCE) return denial(call.source, "discovery");
		if (source.reads >= MAX_READ_CALLS_PER_SOURCE) return denial(call.source, "source");
		if (turn.reads >= MAX_READ_CALLS_PER_TURN) return denial(call.source, "turn");
		source.reads += 1;
		if (call.discovery) source.discovery += 1;
		turn.reads += 1;
		turn.sources.set(call.source, source);
		this.usage.set(exec.agent, turn);
	}
};
function registerDiscoveryBudget(ctx) {
	const budget = new DiscoveryBudget();
	ctx.on("tools/pre-execute", async (exec, next) => {
		const reason = budget.check(exec);
		return reason === void 0 ? next() : {
			kind: "deny",
			reason
		};
	});
	ctx.on("agent/pre-step", ({ agent, messages }, next) => {
		if (messages.some((message) => message.source.kind === "user")) budget.reset(agent);
		return next();
	});
}

//#endregion
//#region src/settings-namespace.ts
/** Host settings namespace used to dispatch the GenUI design card. */
const DESIGN_SETTINGS_NAMESPACE = "genui-design";

//#endregion
//#region src/runtime/settings-namespace.ts
const DesignSettingsMarker = z.object({});
/**
* Advertise the design card to keyed-slot settings hosts.
*
* DSH 0.1.0-rc.7+ renders `settings.plugin.item` only for namespaces returned
* by the Host settings service. Design data itself remains owned by DesignStore
* and the capability-scoped management endpoint; this empty namespace is the
* composition marker that makes the custom card eligible for dispatch. The
* injection stays optional so older compositions without a settings provider
* continue to load and use the legacy list slot.
*/
function registerDesignSettingsNamespace(ctx) {
	return ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(settingsNamespace(DESIGN_SETTINGS_NAMESPACE), DesignSettingsMarker);
	});
}

//#endregion
//#region src/runtime/external.ts
const MAX_RESPONSE_BYTES = 1024 * 1024;
const SAFE_REQUEST_HEADERS = new Set(["accept", "content-type"]);
const SAFE_RESPONSE_HEADERS = [
	"content-type",
	"etag",
	"last-modified",
	"cache-control",
	"retry-after",
	"x-ratelimit-limit",
	"x-ratelimit-remaining",
	"x-ratelimit-reset",
	"x-ratelimit-resource",
	"x-ratelimit-used"
];
const EXTERNAL_USER_AGENT = "dsh-plugin-genui";
function isPrivateAddress(address) {
	const normalized = address.toLowerCase();
	if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
	if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
	if (isIP(address) !== 4) return false;
	const [a = 0, b = 0] = address.split(".").map(Number);
	return a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168) || a === 198 && (b === 18 || b === 19);
}
async function publicAddress(hostname) {
	if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isIP(hostname) !== 0) throw new Error("external requests require a public HTTPS hostname");
	const addresses = await lookup(hostname, {
		all: true,
		verbatim: true
	});
	if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("external hostname does not resolve exclusively to public addresses");
	const selected = addresses[0];
	if (selected === void 0 || selected.family !== 4 && selected.family !== 6) throw new Error("external hostname could not be resolved");
	return {
		address: selected.address,
		family: selected.family
	};
}
function buildExternalHeaders(input) {
	const headers = {
		accept: "application/json, text/plain;q=0.9, */*;q=0.5",
		"user-agent": EXTERNAL_USER_AGENT
	};
	for (const [name$1, value] of Object.entries(input.headers ?? {})) {
		const normalized = name$1.toLowerCase();
		if (!SAFE_REQUEST_HEADERS.has(normalized) || typeof value !== "string") continue;
		headers[normalized] = value;
	}
	return headers;
}
async function requestExternal(input, signal) {
	const url = new URL(input.url);
	if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") throw new Error("external requests require a credential-free HTTPS URL");
	const resolved = await publicAddress(url.hostname);
	const headers = buildExternalHeaders(input);
	let payload;
	if (input.body !== void 0) {
		if (typeof input.body === "string") payload = input.body;
		else {
			payload = JSON.stringify(input.body);
			headers["content-type"] ??= "application/json";
		}
		if (Buffer.byteLength(payload) > 256 * 1024) throw new Error("external request body is too large");
		headers["content-length"] = String(Buffer.byteLength(payload));
	}
	return new Promise((resolve$1, reject) => {
		const req = request({
			protocol: "https:",
			hostname: resolved.address,
			family: resolved.family,
			port: url.port || 443,
			servername: url.hostname,
			path: `${url.pathname}${url.search}`,
			method: input.method,
			headers: {
				host: url.host,
				...headers
			},
			signal
		}, (response) => {
			const chunks = [];
			let size = 0;
			response.on("data", (chunk) => {
				const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				size += buffer.length;
				if (size > MAX_RESPONSE_BYTES) {
					req.destroy(/* @__PURE__ */ new Error("external response is too large"));
					return;
				}
				chunks.push(buffer);
			});
			response.on("end", () => {
				const text = Buffer.concat(chunks).toString("utf8");
				const responseHeaders = {};
				for (const name$1 of SAFE_RESPONSE_HEADERS) {
					const value = response.headers[name$1];
					if (typeof value === "string") responseHeaders[name$1] = value;
				}
				resolve$1({
					status: response.statusCode ?? 502,
					headers: responseHeaders,
					body: text
				});
			});
		});
		req.on("error", reject);
		if (payload !== void 0) req.write(payload);
		req.end();
	});
}

//#endregion
//#region src/runtime/permissions.ts
function capabilityFingerprint(capability) {
	return createHash("sha256").update(JSON.stringify(capability)).digest("base64url");
}
function permissionView(capability) {
	return {
		id: capability.id,
		kind: capability.kind,
		label: capability.label,
		reason: capability.reason,
		access: capability.access,
		...capability.kind === "external" ? {
			destination: new URL(capability.urlPrefix).host,
			methods: capability.methods
		} : {}
	};
}
function capabilityById(version, id) {
	return version.capabilities.find((capability) => capability.id === id);
}
function toolCapability(version, name$1) {
	return version.capabilities.find((capability) => capability.kind === "tool" && capability.tool === name$1);
}
function externalCapability(version, url, method) {
	return version.capabilities.find((capability) => {
		if (capability.kind !== "external" || !capability.methods.includes(method)) return false;
		const prefix = new URL(capability.urlPrefix);
		return url.origin === prefix.origin && url.href.startsWith(prefix.href);
	});
}
function isGranted(record, sessionId, capability) {
	const grant = record.grants[sessionId]?.[capability.id];
	return grant?.fingerprint === capabilityFingerprint(capability) && Date.parse(grant.expiresAt) > Date.now();
}

//#endregion
//#region src/runtime/standalone.ts
const ARTIFACT_RUNTIME_VERSION = "0.13.1";
const STANDALONE_RUNTIME = String.raw`
const root = document.body
const frame = document.getElementById('app')
const dialog = document.getElementById('permission')
const permissionTitle = document.getElementById('permission-title')
const permissionReason = document.getElementById('permission-reason')
const permissionAccess = document.getElementById('permission-access')
const permissionDestination = document.getElementById('permission-destination')
const permissionMethods = document.getElementById('permission-methods')
const permissionQueue = document.getElementById('permission-queue')
const permissionList = document.getElementById('permission-list')
const permissionScope = document.getElementById('permission-scope')
const permissionError = document.getElementById('permission-error')
const notice = document.getElementById('notice')
const errorView = document.getElementById('error')
const deny = document.getElementById('deny')
const allow = document.getElementById('allow')
const token = new URLSearchParams(location.hash.slice(1)).get('token')

if (!token) {
  errorView.hidden = false
} else {
  const prefix = root.dataset.routePrefix
  const artifactId = root.dataset.artifactId
  const versionId = root.dataset.versionId
  const language = root.dataset.language
  const copy = language === 'zh'
    ? { read: '读取信息', write: '执行更改', connect: '连接到', methods: '允许请求', queued: '确认后还有 {count} 项访问请求。', failed: '暂时无法完成授权，请重试。', runtimeFailed: '这个应用没有正常打开。请回到任务中让我修复。', allow: '允许当前任务使用', initialTitle: '这个应用需要以下权限', initialReason: '在打开前一次确认。允许后，这个版本在当前任务中使用这些能力时不会逐项打断你。', initialAllow: '全部允许并打开' }
    : { read: 'Read information', write: 'Make changes', connect: 'Connect to', methods: 'Allowed requests', queued: 'More access requests are waiting: {count}.', failed: 'Permission could not be saved. Try again.', runtimeFailed: 'This app did not open correctly. Return to the task and ask me to repair it.', allow: 'Allow for this task', initialTitle: 'This app needs the following access', initialReason: 'Review it once before opening. If allowed, this version can use these capabilities during the current task without interrupting you one by one.', initialAllow: 'Allow all and open' }

  let pending = []
  let initialPermissions = []
  let frameStarted = false
  let noticeTimer
  const startFrame = () => {
    if (frameStarted) return
    frameStarted = true
    frame.src = prefix + '/preview/' + encodeURIComponent(artifactId) + '/' + encodeURIComponent(versionId)
      + '?lang=' + encodeURIComponent(language) + '#token=' + encodeURIComponent(token)
  }
  const showFact = (element, value) => {
    element.hidden = !value
    element.textContent = value || ''
  }
  const showPending = () => {
    const current = pending[0]
    if (!current) {
      if (dialog.open) dialog.close()
      return
    }
    initialPermissions = []
    allow.textContent = copy.allow
    permissionList.hidden = true
    permissionList.replaceChildren()
    permissionScope.hidden = false
    permissionTitle.textContent = current.permission.label
    permissionReason.textContent = current.permission.reason
    permissionError.hidden = true
    showFact(permissionAccess, current.permission.access === 'write' ? copy.write : copy.read)
    showFact(permissionDestination, typeof current.permission.destination === 'string'
      ? copy.connect + ' ' + current.permission.destination : '')
    showFact(permissionMethods, Array.isArray(current.permission.methods) && current.permission.methods.length
      ? copy.methods + ' ' + current.permission.methods.filter(method => typeof method === 'string').join(' / ') : '')
    showFact(permissionQueue, pending.length > 1 ? copy.queued.replace('{count}', String(pending.length - 1)) : '')
    if (!dialog.open) dialog.showModal()
  }
  const showInitial = (permissions) => {
    initialPermissions = permissions
    allow.textContent = copy.initialAllow
    permissionTitle.textContent = copy.initialTitle
    permissionReason.textContent = copy.initialReason
    permissionError.hidden = true
    showFact(permissionAccess, '')
    showFact(permissionDestination, '')
    showFact(permissionMethods, '')
    showFact(permissionQueue, '')
    permissionScope.hidden = true
    permissionList.replaceChildren(...permissions.map(permission => {
      const item = document.createElement('div')
      const title = document.createElement('strong')
      const reason = document.createElement('span')
      const facts = document.createElement('div')
      title.textContent = permission.label
      reason.textContent = permission.reason
      facts.className = 'permission-list-facts'
      const values = [
        permission.access === 'write' ? copy.write : copy.read,
        typeof permission.destination === 'string' ? copy.connect + ' ' + permission.destination : '',
        Array.isArray(permission.methods) && permission.methods.length
          ? copy.methods + ' ' + permission.methods.filter(method => typeof method === 'string').join(' / ')
          : '',
      ]
      facts.replaceChildren(...values.filter(Boolean).map(value => {
        const fact = document.createElement('span')
        fact.textContent = value
        return fact
      }))
      item.append(title, reason, facts)
      return item
    }))
    permissionList.hidden = false
    if (!dialog.open) dialog.showModal()
  }
  const dismissInitial = () => {
    initialPermissions = []
    if (dialog.open) dialog.close()
    startFrame()
  }
  const answer = (granted, capabilityId = pending[0]?.permission.id) => {
    if (!capabilityId) return
    const answered = pending.filter(request => request.permission.id === capabilityId)
    pending = pending.filter(request => request.permission.id !== capabilityId)
    answered.forEach(request => frame.contentWindow?.postMessage({
      source: 'dsh-genui', type: 'permission-result', requestId: request.requestId, granted,
    }, '*'))
    showPending()
  }
  const announceSaved = () => {
    notice.hidden = false
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.hidden = true }, 2000)
  }

  deny.addEventListener('click', () => initialPermissions.length ? dismissInitial() : answer(false))
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    if (!allow.disabled) {
      if (initialPermissions.length) dismissInitial()
      else answer(false)
    }
  })
  allow.addEventListener('click', async () => {
    if (initialPermissions.length) {
      allow.disabled = true
      deny.disabled = true
      permissionError.hidden = true
      try {
        const response = await fetch(prefix + '/api/' + encodeURIComponent(artifactId) + '/permission/grant-all', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({ version_id: versionId }),
        })
        if (response.ok) dismissInitial()
        else {
          permissionError.textContent = copy.failed
          permissionError.hidden = false
        }
      } catch {
        permissionError.textContent = copy.failed
        permissionError.hidden = false
      } finally {
        allow.disabled = false
        deny.disabled = false
      }
      return
    }
    const current = pending[0]
    if (!current) return
    allow.disabled = true
    deny.disabled = true
    permissionError.hidden = true
    try {
      const response = await fetch(prefix + '/api/' + encodeURIComponent(artifactId) + '/permission/grant', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ version_id: versionId, capability_id: current.permission.id }),
      })
      if (response.ok) answer(true, current.permission.id)
      else {
        permissionError.textContent = copy.failed
        permissionError.hidden = false
      }
    } catch {
      permissionError.textContent = copy.failed
      permissionError.hidden = false
    } finally {
      allow.disabled = false
      deny.disabled = false
    }
  })

  addEventListener('message', (event) => {
    const value = event.data
    if (event.source !== frame.contentWindow || value?.source !== 'dsh-genui'
      || value.artifactId !== artifactId || value.versionId !== versionId) return
    if (value.type === 'runtime-error') {
      frame.hidden = true
      errorView.textContent = copy.runtimeFailed
      errorView.hidden = false
      return
    }
    if (value.type === 'state-changed') {
      announceSaved()
      return
    }
    if (value.type !== 'permission-request' || typeof value.requestId !== 'string'
      || typeof value.permission?.id !== 'string' || typeof value.permission?.label !== 'string'
      || typeof value.permission?.reason !== 'string'
      || (value.permission?.kind !== 'tool' && value.permission?.kind !== 'external')
      || (value.permission?.access !== 'read' && value.permission?.access !== 'write')) return
    if (pending.some(request => request.requestId === value.requestId)) return
    pending.push(value)
    showPending()
  })

  fetch(prefix + '/api/' + encodeURIComponent(artifactId) + '/permission/list', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ version_id: versionId }),
  }).then(async response => {
    if (!response.ok) throw new Error('permission list failed')
    const value = await response.json()
    const permissions = Array.isArray(value.permissions) ? value.permissions.filter(permission => !permission.granted) : []
    if (permissions.length) showInitial(permissions)
    else startFrame()
  }).catch(startFrame)
}
`;
function escapeHtml(value) {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[character] ?? character);
}
function standaloneHtml(routePrefix, artifactId, versionId, title, language) {
	const copy = language === "zh" ? {
		error: "这个页面链接无效。请回到任务中重新打开。",
		saved: "已保存",
		kicker: "需要你的同意",
		scope: "同意后，这个应用可以在当前任务中继续使用这项能力。用途发生变化时会再次询问。",
		deny: "暂不允许",
		allow: "允许当前任务使用"
	} : {
		error: "This link is not valid. Open it again from the task.",
		saved: "Saved",
		kicker: "Your permission is needed",
		scope: "Once allowed, this app can keep using this capability during the current task. You will be asked again if its purpose changes.",
		deny: "Not now",
		allow: "Allow for this task"
	};
	return `<!doctype html>
  <html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171717"><title>${escapeHtml(title)}</title><style>
  html,body,#app{width:100%;height:100%;margin:0;border:0}body{overflow:hidden;background:#faf9f6;color:#242424;font-family:ui-sans-serif,system-ui,sans-serif}[hidden]{display:none!important}#error{display:grid;place-items:center;min-height:100%;padding:24px;text-align:center}.notice{position:fixed;z-index:2;top:12px;left:50%;transform:translateX(-50%);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:7px 11px;background:Canvas;color:CanvasText;box-shadow:0 8px 24px #0002;font-size:12px;font-weight:650;pointer-events:none}dialog{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:18px;padding:22px;box-shadow:0 24px 80px #0003;background:Canvas;color:CanvasText;overscroll-behavior:contain}dialog::backdrop{background:#0008;backdrop-filter:blur(6px)}.kicker{margin:0 0 5px;color:#b94e32;font-size:11px;font-weight:750;letter-spacing:.04em}h1{font-size:19px;line-height:1.25;margin:0 0 8px;text-wrap:balance}.reason,.scope{line-height:1.5;margin:0;color:color-mix(in srgb,currentColor 68%,transparent);overflow-wrap:anywhere}.facts{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.facts span{max-width:100%;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:6px 9px;font-size:11px;font-weight:650;overflow-wrap:anywhere}.permission-list{display:grid;gap:7px;margin:14px 0}.permission-list>div{display:grid;gap:3px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:11px;padding:10px}.permission-list strong{font-size:12px}.permission-list>div>span{color:color-mix(in srgb,currentColor 68%,transparent);font-size:11px;line-height:1.4}.permission-list-facts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.permission-list-facts span{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:999px;padding:3px 6px;font-size:9px;font-weight:650}.scope{font-size:11px}.queue{margin:8px 0 0;font-size:11px;font-weight:650}.error{margin:10px 0 0;color:#a84235;font-size:12px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}button{min-height:40px;font:650 12px/1 ui-sans-serif,system-ui,sans-serif;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:transparent;color:inherit;cursor:pointer;touch-action:manipulation}button:hover{background:color-mix(in srgb,currentColor 7%,transparent)}button:focus-visible{outline:2px solid #b94e32;outline-offset:2px}button:last-child{background:#242424;color:#fff;border-color:#242424}button:disabled{cursor:wait;opacity:.5}@media(prefers-color-scheme:dark){body{background:#171717;color:#f5f5f5}.kicker{color:#e17a5f}.error{color:#e27b6d}button:last-child{background:#f5f5f5;color:#171717;border-color:#f5f5f5}}@media(max-width:520px){.notice{top:auto;bottom:12px}dialog{padding:18px}.actions button{flex:1}}
</style></head><body data-route-prefix="${routePrefix}" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-language="${language}"><iframe id="app" title="${escapeHtml(title)}" sandbox="allow-scripts allow-forms allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe><main id="error" hidden>${copy.error}</main><div id="notice" class="notice" role="status" aria-live="polite" hidden>${copy.saved}</div><dialog id="permission" aria-labelledby="permission-title" aria-describedby="permission-reason permission-scope"><p class="kicker">${copy.kicker}</p><h1 id="permission-title"></h1><p class="reason" id="permission-reason"></p><div class="facts"><span id="permission-access"></span><span id="permission-destination" hidden></span><span id="permission-methods" hidden></span></div><div id="permission-list" class="permission-list" hidden></div><p class="scope" id="permission-scope">${copy.scope}</p><p id="permission-queue" class="queue" hidden></p><p class="error" id="permission-error" role="alert" hidden></p><div class="actions"><button id="deny" type="button">${copy.deny}</button><button id="allow" type="button">${copy.allow}</button></div></dialog><script type="module" src="${routePrefix}/standalone.js?runtime=${ARTIFACT_RUNTIME_VERSION}"><\/script></body></html>`;
}

//#endregion
//#region src/runtime/server.ts
const CSP = [
	"default-src 'none'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-src 'self'",
	"object-src 'none'",
	"base-uri 'none'",
	"frame-ancestors 'self'"
].join("; ");
const MIME = {
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp"
};
function json(res, status, value, req) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		...req?.headers.origin === "null" ? {
			"access-control-allow-origin": "null",
			vary: "Origin"
		} : {}
	});
	res.end(JSON.stringify(value));
}
async function body(req, limit = 256 * 1024) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > limit) throw new Error("request body is too large");
		chunks.push(buffer);
	}
	const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("request body must be an object");
	return parsed;
}
function bearer(req) {
	const value = req.headers.authorization;
	return value?.startsWith("Bearer ") ? value.slice(7) : void 0;
}
function acceptsManagementRequest(req) {
	return req.headers["sec-fetch-site"] !== "cross-site";
}
async function designSettings(designs) {
	return {
		default_design_id: designs.defaultId() ?? null,
		designs: (await designs.list()).map((design) => ({
			...design,
			builtin: designs.isBuiltin(design.id)
		}))
	};
}
function html(routePrefix, artifactId, versionId, hasCss, language) {
	return `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#faf9f6" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">${hasCss ? `<link rel="stylesheet" href="${routePrefix}/assets/${artifactId}/${versionId}/app.css?runtime=${ARTIFACT_RUNTIME_VERSION}">` : ""}</head>
<body><div id="root" data-artifact-id="${artifactId}" data-version-id="${versionId}" data-api-base="${routePrefix}/api/${artifactId}"></div><script type="module" src="${routePrefix}/assets/${artifactId}/${versionId}/app.js?runtime=${ARTIFACT_RUNTIME_VERSION}"><\/script></body></html>`;
}
function createHttpRuntime(ctx, registry, designs, capabilities, routePrefix) {
	return { async handler(req, res) {
		try {
			const url = new URL(req.url ?? "/", "http://localhost");
			if (req.method === "GET" && url.pathname === "/.well-known/dsh-genui") {
				if (!acceptsManagementRequest(req)) return json(res, 403, { error: "cross-site management requests are not allowed" });
				json(res, 200, { route_prefix: routePrefix });
				return;
			}
			const relative = url.pathname.slice(routePrefix.length).split("/").filter(Boolean).map(decodeURIComponent);
			if (req.method === "GET" && relative.length === 1 && relative[0] === "standalone.js") {
				res.writeHead(200, {
					"content-type": "text/javascript; charset=utf-8",
					"content-security-policy": CSP,
					"cache-control": "private, max-age=31536000, immutable",
					"x-content-type-options": "nosniff"
				});
				res.end(STANDALONE_RUNTIME);
				return;
			}
			if (req.method === "GET" && relative[0] === "app" && relative.length === 2) {
				const artifactId = relative[1] ?? "";
				const language = url.searchParams.get("lang");
				if (language !== "en" && language !== "zh") return json(res, 400, { error: "app language must be en or zh" });
				const artifact = await registry.get(artifactId);
				if (artifact.currentVersionId === void 0) return json(res, 409, { error: "app has no ready version" });
				const version = await registry.getVersion(artifactId, artifact.currentVersionId);
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"content-security-policy": CSP,
					"cache-control": "no-store",
					"x-content-type-options": "nosniff",
					"referrer-policy": "no-referrer"
				});
				res.end(standaloneHtml(routePrefix, artifactId, version.id, artifact.title, language));
				return;
			}
			if (relative[0] === "manage") {
				if (!acceptsManagementRequest(req)) return json(res, 403, { error: "cross-site management requests are not allowed" });
				if (req.method === "GET" && relative.length === 2 && relative[1] === "designs") {
					json(res, 200, await designSettings(designs));
					return;
				}
				if (req.method === "GET" && relative.length === 3 && relative[1] === "designs") {
					const design = await designs.get(relative[2] ?? "");
					if (url.searchParams.get("download") === "1") {
						res.writeHead(200, {
							"content-type": "text/markdown; charset=utf-8",
							"content-disposition": "attachment; filename=\"DESIGN.md\"",
							"cache-control": "no-store",
							"x-content-type-options": "nosniff"
						});
						res.end(design.content);
						return;
					}
					json(res, 200, {
						design_id: design.id,
						title: design.title,
						filename: "DESIGN.md",
						content: design.content
					});
					return;
				}
				if (req.method === "POST" && relative.length === 3 && relative[1] === "designs" && relative[2] === "default") {
					const input = await body(req);
					if (input.design_id !== null && typeof input.design_id !== "string") throw new Error("design_id must be a design id or null");
					await designs.setDefault(typeof input.design_id === "string" ? input.design_id : void 0);
					json(res, 200, await designSettings(designs));
					return;
				}
				if (req.method === "POST" && relative.length === 3 && relative[1] === "designs" && relative[2] === "import") {
					const input = await body(req, 128 * 1024);
					if (typeof input.design_id !== "string" || typeof input.content !== "string") throw new Error("design_id and content are required");
					const design = await designs.put(input.design_id, input.content);
					await designs.setDefault(design.id);
					json(res, 200, await designSettings(designs));
					return;
				}
				return json(res, 404, { error: "unknown GenUI management action" });
			}
			if (req.method === "GET" && relative[0] === "preview" && relative.length === 3) {
				const [, artifactId = "", versionId = ""] = relative;
				const language = url.searchParams.get("lang");
				if (language !== "en" && language !== "zh") return json(res, 400, { error: "preview language must be en or zh" });
				if ((await registry.getVersion(artifactId, versionId)).status === "failed") return json(res, 409, { error: "artifact version failed validation" });
				const hasCss = await stat(safeJoin(registry.distPath(artifactId, versionId), "app.css")).then(() => true, () => false);
				res.writeHead(200, {
					"content-type": "text/html; charset=utf-8",
					"content-security-policy": CSP,
					"cache-control": "no-store",
					"x-content-type-options": "nosniff",
					"referrer-policy": "no-referrer"
				});
				res.end(html(routePrefix, artifactId, versionId, hasCss, language));
				return;
			}
			if (req.method === "GET" && relative[0] === "assets" && relative.length >= 4) {
				const [, artifactId = "", versionId = "", ...assetParts] = relative;
				await registry.getVersion(artifactId, versionId);
				const assetPath = safeJoin(registry.distPath(artifactId, versionId), ...assetParts);
				const content = await readFile(assetPath);
				res.writeHead(200, {
					"content-type": MIME[extname(assetPath)] ?? "application/octet-stream",
					"content-security-policy": CSP,
					"cache-control": "private, max-age=31536000, immutable",
					"x-content-type-options": "nosniff",
					...req.headers.origin === "null" ? {
						"access-control-allow-origin": "null",
						vary: "Origin"
					} : {}
				});
				res.end(content);
				return;
			}
			if (req.method === "OPTIONS" && relative[0] === "api" && relative.length >= 3) {
				if (req.headers.origin !== "null") return json(res, 403, { error: "artifact API preflight requires a sandboxed origin" });
				res.writeHead(204, {
					"access-control-allow-origin": "null",
					"access-control-allow-methods": "POST",
					"access-control-allow-headers": "authorization, content-type",
					"access-control-max-age": "600",
					vary: "Origin"
				});
				res.end();
				return;
			}
			if (req.method === "POST" && relative[0] === "api" && relative.length >= 3) {
				const [, artifactId = "", ...actionParts] = relative;
				const capability = capabilities.resolve(bearer(req) ?? "", artifactId);
				if (capability === void 0) return json(res, 401, { error: "invalid or expired artifact capability" }, req);
				const input = await body(req);
				const action = actionParts.join("/");
				if (action === "state/read") {
					if (typeof input.key !== "string" || input.key.length > 128) throw new Error("invalid state key");
					if (capability.mode === "verification") return json(res, 200, { found: false }, req);
					const state = await registry.readState(artifactId, capability.sessionId);
					const found = state !== void 0 && Object.hasOwn(state.values, input.key);
					json(res, 200, {
						found,
						...found ? { value: state.values[input.key] } : {}
					}, req);
					return;
				}
				if (action === "state/write") {
					if (typeof input.key !== "string" || input.key.length > 128) throw new Error("invalid state key");
					const serialized = JSON.stringify(input.value);
					if (serialized === void 0 || Buffer.byteLength(serialized) > 64 * 1024) throw new Error("state value must be JSON under 64 KiB");
					if (capability.mode === "verification") {
						json(res, 200, {
							ok: true,
							persisted: false
						}, req);
						return;
					}
					await registry.updateState(artifactId, capability.sessionId, (state) => ({
						...state,
						[input.key]: input.value
					}));
					json(res, 200, {
						ok: true,
						persisted: true
					}, req);
					return;
				}
				if (action === "permission/grant") {
					if (capability.mode === "verification") return json(res, 403, { error: "permissions cannot be granted during verification" }, req);
					if (typeof input.version_id !== "string" || typeof input.capability_id !== "string") throw new Error("version_id and capability_id are required");
					const requested = capabilityById(await registry.getVersion(artifactId, input.version_id), input.capability_id);
					if (requested === void 0) return json(res, 404, { error: "requested permission no longer exists" }, req);
					await registry.grantCapability(artifactId, capability.sessionId, requested.id, {
						fingerprint: capabilityFingerprint(requested),
						grantedAt: (/* @__PURE__ */ new Date()).toISOString(),
						expiresAt: new Date(Date.now() + TASK_TTL_MS).toISOString()
					});
					json(res, 200, {
						granted: true,
						permission: permissionView(requested)
					}, req);
					return;
				}
				if (action === "permission/grant-all") {
					if (capability.mode === "verification") return json(res, 403, { error: "permissions cannot be granted during verification" }, req);
					if (typeof input.version_id !== "string") throw new Error("version_id is required");
					const version = await registry.getVersion(artifactId, input.version_id);
					const grantedAt = /* @__PURE__ */ new Date();
					const expiresAt = new Date(grantedAt.valueOf() + TASK_TTL_MS).toISOString();
					await registry.grantCapabilities(artifactId, capability.sessionId, Object.fromEntries(version.capabilities.map((item) => [item.id, {
						fingerprint: capabilityFingerprint(item),
						grantedAt: grantedAt.toISOString(),
						expiresAt
					}])));
					json(res, 200, {
						granted: true,
						permissions: version.capabilities.map(permissionView)
					}, req);
					return;
				}
				if (action === "permission/list") {
					if (typeof input.version_id !== "string") throw new Error("version_id is required");
					const version = await registry.getVersion(artifactId, input.version_id);
					const grants = capability.mode === "verification" ? {} : await registry.readGrants(artifactId, capability.sessionId);
					json(res, 200, { permissions: version.capabilities.map((item) => ({
						...permissionView(item),
						granted: grants[item.id]?.fingerprint === capabilityFingerprint(item)
					})) }, req);
					return;
				}
				if (action === "permission/revoke") {
					if (capability.mode === "verification") return json(res, 403, { error: "permissions cannot be changed during verification" }, req);
					if (typeof input.capability_id !== "string") throw new Error("capability_id is required");
					json(res, 200, { revoked: await registry.revokeCapability(artifactId, capability.sessionId, input.capability_id) }, req);
					return;
				}
				if (action === "tool") {
					if (typeof input.version_id !== "string" || typeof input.name !== "string" || input.name.startsWith("genui_")) throw new Error("invalid connected action");
					const requested = toolCapability(await registry.getVersion(artifactId, input.version_id), input.name);
					if (requested === void 0) return json(res, 403, {
						code: "capability_not_declared",
						error: "this app did not declare the connected action"
					}, req);
					if (capability.mode === "verification") return json(res, 200, {
						content: [],
						structuredContent: null,
						verification: true
					}, req);
					if (!isGranted(await registry.get(artifactId), capability.sessionId, requested)) return json(res, 403, {
						code: "approval_required",
						permission: permissionView(requested)
					}, req);
					const result = await ctx.tools.execute({
						callId: CallId(`genui-${Date.now()}-${Math.random().toString(36).slice(2)}`),
						name: input.name,
						arguments: input.arguments ?? {},
						agent: capability.agent,
						signal: AbortSignal.timeout(6e4)
					});
					if (result.isError) return json(res, 502, {
						error: result.error.message,
						code: result.error.info?.code
					}, req);
					json(res, 200, result.value, req);
					return;
				}
				if (action === "external") {
					if (typeof input.version_id !== "string" || typeof input.url !== "string") throw new Error("version_id and url are required");
					const method = typeof input.method === "string" ? input.method.toUpperCase() : "GET";
					const target = new URL(input.url);
					const requested = externalCapability(await registry.getVersion(artifactId, input.version_id), target, method);
					if (requested === void 0) return json(res, 403, {
						code: "capability_not_declared",
						error: "this app did not declare access to that service"
					}, req);
					if (capability.mode === "verification") return json(res, 200, {
						status: 204,
						headers: {},
						body: "null",
						verification: true
					}, req);
					if (!isGranted(await registry.get(artifactId), capability.sessionId, requested)) return json(res, 403, {
						code: "approval_required",
						permission: permissionView(requested)
					}, req);
					json(res, 200, await requestExternal({
						url: target.toString(),
						method,
						...typeof input.headers === "object" && input.headers !== null && !Array.isArray(input.headers) ? { headers: input.headers } : {},
						...input.body === void 0 ? {} : { body: input.body }
					}, AbortSignal.timeout(3e4)), req);
					return;
				}
				return json(res, 404, { error: "unknown GenUI API action" }, req);
			}
			json(res, 404, { error: "not found" });
		} catch (error) {
			if (error.code === "ENOENT") return json(res, 404, { error: "artifact resource not found" });
			json(res, 400, { error: error instanceof Error ? error.message : String(error) }, req);
		}
	} };
}

//#endregion
//#region src/artifacts/builder.ts
const ALLOWED_IMPORTS = new Set([
	"react",
	"react-dom",
	"react-dom/client",
	"lucide-react",
	"recharts",
	"date-fns",
	"zustand",
	"framer-motion",
	"@dsh-genui/sdk"
]);
const DEPENDENCY_ROOT = dirname(createRequire(import.meta.url).resolve("react/package.json"));
const SDK_SOURCE = String.raw`
import { useCallback, useEffect, useState } from 'react'

const permissionWaiters = new Map()
const inFlightRequests = new Map()

addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.source !== 'dsh-genui' || event.data?.type !== 'permission-result') return
  const waiter = permissionWaiters.get(event.data.requestId)
  if (!waiter) return
  permissionWaiters.delete(event.data.requestId)
  waiter(Boolean(event.data.granted))
})

const runtime = () => {
  const root = document.getElementById('root')
  const artifactId = root?.dataset.artifactId
  const versionId = root?.dataset.versionId
  const apiBase = root?.dataset.apiBase
  if (!artifactId || !versionId || !apiBase) throw new Error('GenUI runtime metadata is missing')
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  if (!token) throw new Error('GenUI capability token is missing')
  return { artifactId, versionId, apiBase, token }
}

const askPermission = (permission) => new Promise((resolve) => {
  const { artifactId, versionId } = runtime()
  const requestId = crypto.randomUUID()
  permissionWaiters.set(requestId, resolve)
  parent.postMessage({ source: 'dsh-genui', type: 'permission-request', requestId, artifactId, versionId, permission }, '*')
})

const sendRequest = async (action, body, mayAsk) => {
  const { apiBase, token, versionId } = runtime()
  const response = await fetch(apiBase + '/' + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...body, version_id: versionId }),
  })
  const value = await response.json()
  if (!response.ok && mayAsk && value.code === 'approval_required' && value.permission) {
    const granted = await askPermission(value.permission)
    if (!granted) throw new Error('Permission was not granted')
    return sendRequest(action, body, false)
  }
  if (!response.ok) throw new Error(value.error || ('GenUI request failed: ' + response.status))
  return value
}

const request = (action, body) => {
  const key = action + ':' + JSON.stringify(body)
  const current = inFlightRequests.get(key)
  if (current) return current
  const pending = sendRequest(action, body, true)
  inFlightRequests.set(key, pending)
  void pending.then(
    () => { setTimeout(() => inFlightRequests.delete(key), 250) },
    () => { inFlightRequests.delete(key) },
  )
  return pending
}

export const artifactContext = () => {
  const { artifactId, versionId } = runtime()
  return { artifactId, versionId }
}

export const callTool = (name, args) => request('tool', { name, arguments: args })

export const requestExternal = (url, options = {}) => request('external', {
  url,
  method: options.method || 'GET',
  headers: options.headers || {},
  ...(options.body === undefined ? {} : { body: options.body }),
})

const notifyStateChanged = (key) => {
  const { artifactId, versionId } = runtime()
  parent.postMessage({ source: 'dsh-genui', type: 'state-changed', artifactId, versionId, key }, '*')
}

export const reportResult = async (value) => {
  const answer = await request('state/write', { key: '__result', value })
  notifyStateChanged('__result')
  return answer
}

export function watchTool(name, args, listener, options = {}) {
  let stopped = false
  let timer
  const intervalMs = Math.max(5000, Math.min(60000, options.intervalMs || 5000))
  const refresh = async () => {
    try {
      const value = await callTool(name, args)
      if (!stopped) listener(value)
    } catch (cause) {
      if (!stopped) options.onError?.(cause)
    } finally {
      if (!stopped) timer = setTimeout(refresh, intervalMs)
    }
  }
  void refresh()
  return () => { stopped = true; if (timer) clearTimeout(timer) }
}

export function useArtifactState(key, initialValue) {
  const [value, setValue] = useState(initialValue)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    request('state/read', { key }).then((answer) => {
      if (!active) return
      if (answer.found) setValue(answer.value)
      setReady(true)
    }).catch((cause) => {
      if (!active) return
      setError(cause instanceof Error ? cause : new Error(String(cause)))
      setReady(true)
    })
    return () => { active = false }
  }, [key])

  const update = useCallback((next) => {
    setValue((previous) => {
      const resolved = typeof next === 'function' ? next(previous) : next
      request('state/write', { key, value: resolved }).then(() => notifyStateChanged(key))
        .catch((cause) => { setError(cause instanceof Error ? cause : new Error(String(cause))) })
      return resolved
    })
  }, [key])

  return [value, update, { ready, error }]
}
`;
function loaderFor(path) {
	switch (extname(path)) {
		case ".tsx": return "tsx";
		case ".ts": return "ts";
		case ".jsx": return "jsx";
		case ".js": return "js";
		case ".css": return "css";
		case ".json": return "json";
		case ".svg": return "dataurl";
		case ".png":
		case ".jpg":
		case ".jpeg":
		case ".webp": return "dataurl";
		default: return "text";
	}
}
function diagnostics(messages, severity) {
	return messages.map((message) => ({
		severity,
		text: message.text,
		...message.location?.file === void 0 ? {} : { file: message.location.file },
		...message.location?.line === void 0 ? {} : { line: message.location.line },
		...message.location?.column === void 0 ? {} : { column: message.location.column }
	}));
}
function sourcePlugin(version) {
	const files = new Map(version.files.map((file) => [file.path, file.content]));
	const resolveRelative = (specifier, importer) => {
		const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
		return [
			base,
			`${base}.tsx`,
			`${base}.ts`,
			`${base}.jsx`,
			`${base}.js`,
			`${base}.css`,
			`${base}.json`,
			posix.join(base, "index.tsx"),
			posix.join(base, "index.ts"),
			posix.join(base, "index.jsx"),
			posix.join(base, "index.js")
		].find((candidate) => files.has(candidate));
	};
	return {
		name: "dsh-genui-source",
		setup(context) {
			context.onResolve({ filter: /^src\/main\.tsx$/ }, (args) => args.kind === "entry-point" ? {
				path: args.path,
				namespace: "genui-source"
			} : void 0);
			context.onResolve({ filter: /^@dsh-genui\/sdk$/ }, () => ({
				path: "@dsh-genui/sdk",
				namespace: "genui-sdk"
			}));
			context.onLoad({
				filter: /.*/,
				namespace: "genui-sdk"
			}, () => ({
				contents: SDK_SOURCE,
				loader: "js",
				resolveDir: DEPENDENCY_ROOT
			}));
			context.onResolve({
				filter: /.*/,
				namespace: "genui-source"
			}, (args) => {
				if (args.path.startsWith("data:")) return {
					path: args.path,
					external: true
				};
				if (args.path.startsWith(".") || args.path.startsWith("/")) {
					const resolved = resolveRelative(args.path, args.importer);
					return resolved === void 0 ? { errors: [{ text: `Cannot resolve generated source import ${args.path} from ${args.importer}` }] } : {
						path: resolved,
						namespace: "genui-source"
					};
				}
				const root = args.path.startsWith("@") ? args.path.split("/").slice(0, 2).join("/") : args.path.split("/")[0] ?? args.path;
				if (!ALLOWED_IMPORTS.has(args.path) && !ALLOWED_IMPORTS.has(root)) return { errors: [{ text: `Import is not allowed in GenUI artifacts: ${args.path}` }] };
			});
			context.onLoad({
				filter: /.*/,
				namespace: "genui-source"
			}, (args) => {
				const contents = files.get(args.path);
				if (contents === void 0) return { errors: [{ text: `Generated source file not found: ${args.path}` }] };
				return {
					contents,
					loader: loaderFor(args.path),
					resolveDir: DEPENDENCY_ROOT
				};
			});
		}
	};
}
function stateContractDiagnostics(version) {
	const source = version.files.filter((file) => file.path.startsWith("src/")).map((file) => file.content).join("\n");
	if (!/<\s*(?:input|select|textarea)\b|\baria-(?:checked|pressed)\s*=|\brole\s*=\s*["'](?:checkbox|radio|slider|switch)["']/i.test(source) || /\buseArtifactState\s*(?:<[\s\S]{0,500}?>\s*)?\(/.test(source)) return [];
	return [{
		severity: "error",
		text: "Interactive user choices must use useArtifactState so they survive Canvas changes and remain readable on the next turn."
	}];
}
async function buildArtifact(version, distPath) {
	const contractDiagnostics = stateContractDiagnostics(version);
	if (contractDiagnostics.length > 0) return {
		ok: false,
		diagnostics: contractDiagnostics,
		outputFiles: []
	};
	let result;
	try {
		result = await build({
			entryPoints: ["src/main.tsx"],
			bundle: true,
			write: false,
			outdir: distPath,
			entryNames: "app",
			assetNames: "assets/[name]-[hash]",
			format: "esm",
			platform: "browser",
			target: ["es2022"],
			jsx: "automatic",
			sourcemap: "external",
			banner: { js: `(() => {
  const reportGenuiRuntimeError = () => {
    const root = document.getElementById('root')
    parent.postMessage({ source: 'dsh-genui', type: 'runtime-error', artifactId: root?.dataset.artifactId, versionId: root?.dataset.versionId }, '*')
  }
  addEventListener('error', reportGenuiRuntimeError)
  addEventListener('unhandledrejection', reportGenuiRuntimeError)
})()` },
			footer: { js: `const postGenuiReady = () => {
  const root = document.getElementById('root')
  parent.postMessage({ source: 'dsh-genui', type: 'ready', artifactId: root?.dataset.artifactId, versionId: root?.dataset.versionId }, '*')
}
addEventListener('message', (event) => {
  const root = document.getElementById('root')
  if (event.source === parent && event.data?.source === 'dsh-genui' && event.data?.type === 'ready-request'
    && event.data?.artifactId === root?.dataset.artifactId && event.data?.versionId === root?.dataset.versionId) postGenuiReady()
})
requestAnimationFrame(() => requestAnimationFrame(postGenuiReady))` },
			metafile: true,
			logLevel: "silent",
			plugins: [sourcePlugin(version)]
		});
	} catch (error) {
		const failure = error;
		return {
			ok: false,
			diagnostics: [
				...diagnostics(failure.errors ?? [], "error"),
				...diagnostics(failure.warnings ?? [], "warning"),
				...failure.errors?.length ? [] : [{
					severity: "error",
					text: failure.message ?? String(error)
				}]
			],
			outputFiles: []
		};
	}
	await mkdir(distPath, { recursive: true });
	const outputFiles = [];
	for (const output of result.outputFiles ?? []) {
		await mkdir(dirname(output.path), { recursive: true });
		await writeFile(output.path, output.contents, { mode: 384 });
		outputFiles.push(output.path);
	}
	return {
		ok: true,
		diagnostics: diagnostics(result.warnings, "warning"),
		outputFiles
	};
}

//#endregion
//#region src/tools.ts
const receiptSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		artifact_id: {
			type: "string",
			required: true
		},
		title: {
			type: "string",
			required: true
		},
		version_id: {
			type: "string",
			required: true
		},
		status: {
			type: "string",
			required: true
		},
		preview_url: { type: "string" },
		app_url: { type: "string" },
		delivery: {
			type: "string",
			required: true
		},
		message: {
			type: "string",
			required: true
		},
		diagnostics: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					severity: {
						type: "string",
						required: true
					},
					text: {
						type: "string",
						required: true
					},
					file: { type: "string" },
					line: { type: "integer" },
					column: { type: "integer" }
				}
			}
		}
	}
};
function renderReceipt(value) {
	const receipt = value;
	if (receipt.status === "ready") {
		if (receipt.delivery === "local-link") return [{
			type: "text",
			text: `${receipt.title}\n${receipt.app_url}`
		}];
		return [{
			type: "text",
			text: "This successful result must be the last emitted item. Emit no text and run no tools after it."
		}];
	}
	const diagnosticText = receipt.diagnostics?.length ? `\nDiagnostics:\n${receipt.diagnostics.map((item) => `- ${item.file ?? "<build>"}${item.line === void 0 ? "" : `:${item.line}`}: ${item.text}`).join("\n")}` : "";
	return [{
		type: "text",
		text: `This attempt needs correction. Do not call genui_create again for this artifact. Follow the repair instruction below with genui_update, then continue silently.\nArtifact: ${receipt.title} (${receipt.artifact_id})\nVersion: ${receipt.version_id}\nRepair instruction: ${receipt.message}${diagnosticText}`
	}];
}
function requireAgent(agent) {
	if (agent === void 0) throw new Error("GenUI tools require a live Harness agent");
	return agent;
}
function taskArtifactId(agent, requested) {
	const prefix = `s-${createHash("sha256").update(String(agent.id)).digest("hex").slice(0, 12)}-`;
	if (requested.startsWith(prefix)) return requested;
	const available = 64 - prefix.length;
	return `${prefix}${requested.length <= available ? requested : `${requested.slice(0, available - 9)}-${createHash("sha256").update(requested).digest("hex").slice(0, 8)}`}`;
}
function presentation(value) {
	const receipt = value;
	return {
		card: "genui",
		artifactId: receipt.artifact_id,
		title: receipt.title,
		versionId: receipt.version_id,
		status: receipt.status,
		...receipt.preview_url === void 0 ? {} : { previewUrl: receipt.preview_url },
		message: receipt.message,
		diagnostics: receipt.diagnostics ?? []
	};
}
async function compile(registry, capabilities, routePrefix, previewOrigin, version, agent, delivery, language) {
	const artifact = await registry.get(version.artifactId);
	const result = await buildArtifact(version, registry.distPath(version.artifactId, version.id));
	if (!result.ok) {
		const settled$1 = await registry.settle(version.artifactId, version.id, {
			checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
			build: "failed",
			browser: "not-run",
			diagnostics: result.diagnostics,
			notes: ["candidate rejected; last-known-good version preserved"]
		});
		const record = await registry.get(version.artifactId);
		return {
			artifact_id: settled$1.artifactId,
			title: artifact.title,
			version_id: settled$1.id,
			status: settled$1.status,
			delivery,
			message: record.currentVersionId === void 0 ? "Initial build failed. Repair the reported files with genui_update using this failed version as the base." : "Candidate build failed. Repair the reported files and call genui_update against the current ready version.",
			diagnostics: result.diagnostics
		};
	}
	const settled = await registry.settle(version.artifactId, version.id, {
		checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
		build: "passed",
		browser: "not-run",
		diagnostics: result.diagnostics,
		notes: ["candidate accepted after compile and source contract checks"]
	});
	const token = capabilities.issue(version.artifactId, agent);
	const previewUrl = `${routePrefix}/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`;
	const appUrl = `${previewOrigin}${routePrefix}/app/${version.artifactId}?lang=${language}#token=${token}`;
	return {
		artifact_id: settled.artifactId,
		title: artifact.title,
		version_id: settled.id,
		status: settled.status,
		preview_url: previewUrl,
		app_url: appUrl,
		delivery,
		message: "Artifact compiled and became the last-known-good version.",
		diagnostics: result.diagnostics
	};
}
const fileSpec = {
	type: "object",
	additionalProperties: false,
	properties: {
		path: {
			type: "string",
			required: true
		},
		content: {
			type: "string",
			required: true
		}
	}
};
const capabilitySpec = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			required: true,
			description: "Stable lowercase kebab-case capability id."
		},
		kind: {
			type: "string",
			required: true,
			enum: ["tool", "external"]
		},
		label: {
			type: "string",
			required: true,
			description: "Short user-facing permission name without implementation terms."
		},
		reason: {
			type: "string",
			required: true,
			description: "Concrete user-facing explanation of why the app needs this permission."
		},
		access: {
			type: "string",
			required: true,
			enum: ["read", "write"]
		},
		tool: {
			type: "string",
			description: "Exact connected Harness, MCP, or Skill tool name when kind is tool. Prefer this whenever a suitable connected tool exists."
		},
		url_prefix: {
			type: "string",
			description: "Credential-free HTTPS URL prefix when kind is external. Use only when no suitable connected tool exists."
		},
		methods: {
			type: "array",
			items: { type: "string" },
			description: "Allowed HTTP methods when kind is external."
		}
	}
};
const deliverySpec = {
	type: "string",
	required: true,
	enum: ["embedded", "local-link"],
	description: "Use local-link only when the user explicitly asks for CLI, terminal, localhost, or a browser URL. Otherwise use embedded."
};
const languageSpec = {
	type: "string",
	required: true,
	enum: ["en", "zh"],
	description: "The user-facing language of the generated app."
};
function capabilitiesFromInput(input) {
	return input.map((item) => item.kind === "tool" ? {
		id: item.id,
		kind: "tool",
		label: item.label,
		reason: item.reason,
		access: item.access,
		tool: item.tool ?? ""
	} : {
		id: item.id,
		kind: "external",
		label: item.label,
		reason: item.reason,
		access: item.access,
		urlPrefix: item.url_prefix ?? "",
		methods: item.methods ?? []
	});
}
function registerDesignTools(ctx, registry, designs) {
	ctx.tools.register(defineTool({
		name: "genui_design_list",
		description: "List reusable DESIGN.md profiles available to generated artifacts.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute() {
			return {
				default_design_id: designs.defaultId() ?? null,
				designs: await designs.list()
			};
		},
		isConcurrencySafe: () => true
	}));
	ctx.tools.register(defineTool({
		name: "genui_design_import",
		description: "Import or replace one reusable DESIGN.md profile. The content becomes authoritative for future generations that select this design id.",
		parameters: {
			design_id: {
				type: "string",
				required: true
			},
			content: {
				type: "string",
				required: true,
				description: "Complete DESIGN.md content beginning with one # heading."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args) {
			const design = await designs.put(args.design_id, args.content);
			return {
				design_id: design.id,
				title: design.title,
				filename: "DESIGN.md",
				bytes: Buffer.byteLength(design.content)
			};
		}
	}));
	ctx.tools.register(defineTool({
		name: "genui_design_export",
		description: "Export a reusable design profile or the DESIGN.md pinned to an artifact version. Provide exactly one of design_id or artifact_id.",
		parameters: {
			design_id: { type: "string" },
			artifact_id: { type: "string" },
			version_id: {
				type: "string",
				description: "Optional artifact version; defaults to the current ready version."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const hasDesign = args.design_id !== void 0;
			if (hasDesign === (args.artifact_id !== void 0)) throw new Error("provide exactly one of design_id or artifact_id");
			if (hasDesign) {
				const design = await designs.get(args.design_id);
				return {
					design_id: design.id,
					title: design.title,
					filename: "DESIGN.md",
					content: design.content
				};
			}
			const artifactId = taskArtifactId(requireAgent(exec.agent), args.artifact_id);
			const version = await registry.getVersion(artifactId, args.version_id);
			const content = version.files.find((file) => file.path === "DESIGN.md")?.content;
			if (content === void 0) throw new Error("artifact version does not contain DESIGN.md");
			return {
				artifact_id: version.artifactId,
				version_id: version.id,
				filename: "DESIGN.md",
				content
			};
		},
		isConcurrencySafe: () => true
	}));
}
function registerGenuiTools(ctx, registry, designs, capabilities, routePrefix, previewOrigin) {
	registerDesignTools(ctx, registry, designs);
	ctx.tools.register(defineTool({
		name: "genui_create",
		description: "Create and compile a new multi-file React/TypeScript UI artifact. Put source directly in this call; never stage it with workspace write, edit, shell, or coding tools. Call this only once per artifact id; repair any failed attempt with genui_update using the returned version guidance. Use ordinary source code, not an intermediate UI representation.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true,
				description: "Stable lowercase kebab-case id within this task."
			},
			title: {
				type: "string",
				required: true
			},
			delivery: deliverySpec,
			language: languageSpec,
			summary: {
				type: "string",
				required: true
			},
			requirements: {
				type: "array",
				items: { type: "string" },
				required: true
			},
			capabilities: {
				type: "array",
				items: capabilitySpec,
				required: true,
				description: "Only the exact connected actions and credential-free HTTPS services this app may request. Prefer exact Harness/MCP/Skill tool names; declare an external URL only when no suitable connected tool exists. Use [] for a local-only app."
			},
			files: {
				type: "array",
				items: fileSpec,
				required: true,
				description: "Complete source file array. Allowed paths are DESIGN.md, artifact.manifest.json, src/**, and public/**; never include index.html. Every item must contain exactly path and content; never send a filename-keyed object, nested files field, language field, or commentary."
			}
		},
		output: {
			schema: receiptSchema,
			render: (_args, value) => renderReceipt(value),
			presentationMeta: (_args, value) => presentation(value)
		},
		async execute(args, exec) {
			const agent = requireAgent(exec.agent);
			const receipt = await compile(registry, capabilities, routePrefix, previewOrigin, await registry.create({
				id: taskArtifactId(agent, args.artifact_id),
				title: args.title,
				summary: args.summary,
				requirements: args.requirements,
				capabilities: capabilitiesFromInput(args.capabilities),
				files: args.files
			}), agent, args.delivery, args.language);
			if (receipt.status === "ready" && receipt.delivery === "embedded") exec.concludeTurn();
			return receipt;
		}
	}));
	ctx.tools.register(defineTool({
		name: "genui_update",
		description: "Incrementally update an existing UI artifact. Only send changed, added, or deleted files and retain all still-active requirements.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true
			},
			delivery: deliverySpec,
			language: languageSpec,
			base_version_id: {
				type: "string",
				required: true
			},
			summary: {
				type: "string",
				required: true
			},
			patches: {
				type: "array",
				required: true,
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						path: {
							type: "string",
							required: true
						},
						content: { type: "string" },
						delete: { type: "boolean" }
					}
				}
			},
			add_requirements: {
				type: "array",
				items: { type: "string" }
			},
			supersede_requirements: {
				type: "array",
				items: { type: "string" }
			},
			capabilities: {
				type: "array",
				items: capabilitySpec,
				description: "Complete replacement list when connected actions change. Prefer exact Harness/MCP/Skill tool names; use an external URL only when no suitable connected tool exists. Omit to preserve the current list."
			}
		},
		output: {
			schema: receiptSchema,
			render: (_args, value) => renderReceipt(value),
			presentationMeta: (_args, value) => presentation(value)
		},
		async execute(args, exec) {
			const agent = requireAgent(exec.agent);
			const receipt = await compile(registry, capabilities, routePrefix, previewOrigin, await registry.update({
				id: taskArtifactId(agent, args.artifact_id),
				baseVersionId: args.base_version_id,
				summary: args.summary,
				patches: args.patches,
				...args.add_requirements === void 0 ? {} : { addRequirements: args.add_requirements },
				...args.supersede_requirements === void 0 ? {} : { supersedeRequirements: args.supersede_requirements },
				...args.capabilities === void 0 ? {} : { capabilities: capabilitiesFromInput(args.capabilities) }
			}), agent, args.delivery, args.language);
			if (receipt.status === "ready" && receipt.delivery === "embedded") exec.concludeTurn();
			return receipt;
		}
	}));
	ctx.tools.register(defineTool({
		name: "genui_state_read",
		description: "Read the current user-scoped values submitted or selected inside one generated app. Use this silently when a later user message refers to choices, form answers, feedback, or progress in that app.",
		parameters: { artifact_id: {
			type: "string",
			required: true
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: `These values are authoritative. Read them silently. Never discuss storage, SDKs, missing keys, implementation, or internal reasoning with the user. If the user also requested an app revision, inspect and update it without visible planning.\n${JSON.stringify(value, null, 2)}`
			}]
		},
		async execute(args, exec) {
			const agent = requireAgent(exec.agent);
			const artifactId = taskArtifactId(agent, args.artifact_id);
			const state = await registry.readState(artifactId, String(agent.id));
			return {
				artifact_id: artifactId,
				values: state?.values ?? {},
				updated_at: state?.updatedAt ?? null,
				expires_at: state?.expiresAt ?? null
			};
		},
		isConcurrencySafe: () => true
	}));
	ctx.tools.register(defineTool({
		name: "genui_inspect",
		description: "Inspect an artifact, including full source files, requirement ledger, version status, and validation evidence.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true
			},
			version_id: { type: "string" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const artifactId = taskArtifactId(requireAgent(exec.agent), args.artifact_id);
			const artifact = await registry.get(artifactId);
			const version = await registry.getVersion(artifactId, args.version_id);
			return JSON.parse(JSON.stringify({
				artifact,
				version
			}));
		},
		isConcurrencySafe: () => true
	}));
	ctx.tools.register(defineTool({
		name: "genui_rollback",
		description: "Move the artifact current pointer to an earlier ready version without deleting history.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true
			},
			version_id: {
				type: "string",
				required: true
			},
			delivery: deliverySpec,
			language: languageSpec
		},
		output: {
			schema: receiptSchema,
			render: (_args, value) => renderReceipt(value),
			presentationMeta: (_args, value) => presentation(value)
		},
		async execute(args, exec) {
			const agent = requireAgent(exec.agent);
			const artifactId = taskArtifactId(agent, args.artifact_id);
			const artifact = await registry.rollback(artifactId, args.version_id);
			const token = capabilities.issue(artifactId, agent);
			return {
				artifact_id: artifactId,
				title: artifact.title,
				version_id: args.version_id,
				status: "ready",
				preview_url: `${routePrefix}/preview/${artifactId}/${args.version_id}?lang=en#token=${token}`,
				app_url: `${previewOrigin}${routePrefix}/app/${artifactId}?lang=${args.language}#token=${token}`,
				delivery: args.delivery,
				message: "Artifact rolled back to the selected ready version.",
				diagnostics: []
			};
		}
	}));
}

//#endregion
//#region src/prompt.ts
const GENUI_BEHAVIOR_PROMPT = `Keep intermediate work private. Before any read, search, shell, state-read, inspection, retry, or repair call, emit no assistant text. Visible prose must be final user-facing content about the user's task, never tool choice, source files, schemas, code generation, builds, or verification. Do not narrate what you are about to do. After research, speak only when the next action is the final creation or update.

Honor source limits literally. "only", "只用", and "仅根据" create a hard allowlist. Prefer a matching connected MCP tool over an unnamed substitute. Use at most two discovery calls per connected source, four reads from one source, and six connected reads in one user turn. These are ceilings: prefer broad queries and batched reads, stop when evidence is sufficient, and never work around a denied call through another endpoint. Keep useful partial results and state missing evidence plainly.`;
function genuiSystemPrompt(defaultDesignId) {
	return `## Generative UI artifacts

Use genui_* only when interaction materially improves the user's task. A direct request for an interactive card, simulator, explorable model, visual control, GenUI, or localhost app is explicit intent. Without such a request, create an app only when the user needs to make several connected choices, manipulate a difficult causal or spatial relationship, or repeatedly inspect or act on live data and prose would be meaningfully less effective. Complexity alone is not a reason. Stay with prose for ordinary questions, rewriting, summarization, straightforward explanations, and simple lists. In coding, CLI, terminal, or localhost work, always require explicit intent.

Make one focused decision or working surface, never a miniature site or a dashboard that repeats the answer. Keep explanation in the conversation and put only the interactive part in the app. Do not ask the user to choose a presentation format when the best choice is evident.

Delivery and output:
- Keep genui_* calls, source drafting, diagnostics, retries, and repairs invisible. Never create goals, plans, recurring work, or workspace files for an artifact.
- Before a planning or decision app, give the main recommendation in 1–3 natural sentences. Before an input app, state only the missing information in 1–2 sentences. Do not announce or recap the interface.
- Use embedded delivery by default. Use local-link only when the user explicitly asks for CLI, terminal, localhost, or a browser URL.
- A successful embedded genui_create or genui_update is the final emitted item. After a successful local-link result, output one short sentence and the exact app_url on its own line, then stop.
- Unless asked, do not mention GenUI, tools, artifacts, versions, source code, builds, diagnostics, verification, requirements, or design profiles.

Code First:
- Write normal React + TypeScript, never a component-tree IR. Every app needs src/main.tsx; normally use 3–5 files including styles, adding files only for real separation of concerns.
- Available imports: react, react-dom/client, lucide-react, recharts, date-fns, zustand, framer-motion, and @dsh-genui/sdk. The SDK is a compiler-injected virtual module; never search for it.
- Allowed paths: DESIGN.md, artifact.manifest.json, src/**, and public/**. Never include index.html. Put source only in genui_create or genui_update arguments; never stage it with workspace or shell tools.
- SDK contract: useArtifactState(key, initialValue) returns [value, setValue, { ready, error }]; reportResult(value) saves a concise completed outcome; callTool(name, arguments) returns Promise<unknown>; watchTool(name, arguments, onValue, { intervalMs, onError }) returns an unsubscribe function; requestExternal(url, options) returns { status, headers, body }, so parse JSON with JSON.parse(body); artifactContext() returns { artifactId, versionId }.

State and connected actions:
- Persist user answers, selections, drafts, and progress with concise semantic useArtifactState keys. Keep replaceable search results and catalogs in React state; persist the query or selection, not the response payload. Base reload and empty states only on data that survives reload.
- When a later turn refers to app input or selections, genui_state_read must be the first tool call. Treat its values and __result as authoritative; never rely on earlier chat summaries or remembered defaults. Describe the result in the user's language without exposing storage keys, hooks, or persistence mechanics.
- Base follow-up recommendations only on saved values, explicit assumptions, or fresh tool evidence. Do not invent venue availability, popularity, prices, travel times, or booking rules that the state does not support.
- Call reportResult with a small structured summary when the user completes a form, plan, comparison, or feedback flow.
- Every genui_create declares capabilities; use [] for a local-only app. Declare only the exact tool or credential-free HTTPS prefix needed, with a natural label, concrete reason, and read/write access. Before opening a connected app, the host presents its ungranted capabilities together for one task-scoped decision; changed capabilities are shown again. Do not build permission settings into the app.
- Prefer an available Harness, MCP, or Skill tool by its exact callTool name. Use requestExternal only when no matching connected tool exists, and only for public credential-free HTTPS. Never request, expose, or persist keys, cookies, authorization headers, or other credentials.
- Separate user facts, tool-grounded facts, and assumptions. Never invent live facts. Ask for a blocking detail or show an editable estimate.
- Fetch once: the Agent may pass a one-time fact into a local app; the app should call a tool only for user-driven refresh, search, filtering, or action. Do not fetch the same data before creation and again on open.
- Fetch narrowly. Load on open only when current data is essential; otherwise wait for user action. Disable duplicate triggers while pending. Preserve partial success and give a concrete next step on errors.
- Use watchTool only for genuinely changing data, at intervals of at least 5 seconds, and unsubscribe on unmount. Never poll static data or write actions.
- callTool returns the canonical Harness result. Use only a documented or observed response shape; otherwise show the raw result without inventing fields.

Design:
1. Reusable visual language lives in DESIGN.md, not an IR or a page template. Bundled ids are material-3, apple-human-interface, and shadcn-ui.
2. ${defaultDesignId === void 0 ? "For a new app, silently choose and export one bundled visual language: material-3 for expressive, touch-oriented interfaces; apple-human-interface for calm system-like tools; or shadcn-ui for crisp forms, document-first work, and data-heavy application UI." : `The Harness default design is ${defaultDesignId}. Silently export and use it for new apps unless the user asks for another direction.`}
3. Honor a named design through genui_design_list and genui_design_export. Import a supplied DESIGN.md with genui_design_import.
4. Pin the exported profile as root DESIGN.md and keep it on updates unless the user changes direction.
5. Apply its tokens, layout, components, motion, dark mode, and copy rules; never expose a design chooser inside the generated app.

Evolution:
1. On first creation, convert explicit user needs into concise requirements and call genui_create once with all files, capabilities, delivery, and language.
2. Repair a failed creation with genui_update, never another genui_create. Before later updates, call genui_inspect unless the current source is already present in this turn.
3. Pass the current ready version as base_version_id, or the latest failed version if none is ready. Send only changed, added, or deleted files. Preserve every requirement the user has not replaced.
4. Bind and verify every promised interaction. Tool-backed writes need authoritative readback when the tool supports it.
5. genui_create and genui_update compile the app and enforce source contracts before replacing the last-known-good version. Use the returned diagnostics and never invent another preview workflow. If the host later reports a runtime failure, inspect and repair that version with genui_update.

Product quality:
- Use one primary task and at most two sections in Inline view. Prefer progressive disclosure to dense reports. Curate a few useful valid choices instead of rendering every possibility.
- For conceptual explanations, build one manipulable causal or spatial model with one control group, one main visual, and one changing takeaway. Keep definitions and caveats in the conversation. Use 3D only when spatial structure requires it.
- Provide clear loading, empty, error, and success states. Use semantic controls, accessible names, visible keyboard focus, labeled inputs, image alt text, reduced-motion behavior, light and dark color schemes, and a responsive layout that reflows without horizontal overflow at 260 CSS pixels.
- Treat permission denial as a normal recoverable outcome. Never render raw Error messages; explain the failure in the app's language and keep a clear retry action when retrying is useful.
- If the app has interactive controls, mark exactly one main control with data-genui-primary-action. Activating it must change visible state or invoke an SDK action; use the main slider or selector when there is no button.
- Write concrete, natural copy for the user's situation. Avoid generic slogans, invented metrics, fake testimonials, implementation terms, forced three-part lists, repeated conclusions, excessive em dashes, and stock phrases such as "not just X, but Y", "unlock", "elevate", "seamless", or "revolutionize". Remove any sentence that does not help the user understand or act.

After the user-facing explanation or recommendation, emit no ordinary text until genui_* succeeds. End on the successful embedded app or the exact local app URL.`;
}
const GENUI_SYSTEM_PROMPT = genuiSystemPrompt();

//#endregion
//#region src/runtime.ts
async function apply(ctx, config) {
	const resolved = resolveConfig(config);
	registerDesignSettingsNamespace(ctx);
	const registry = new ArtifactRegistry(resolve(process.cwd(), resolved.artifactRoot), resolved.maxSourceBytes);
	await registry.init();
	const designs = new DesignStore(resolve(registry.root, ".designs"));
	await designs.init();
	const capabilities = await CapabilityStore.persistent(resolve(registry.root, ".capability-key"), (sessionId) => ctx.agents.get(SessionId(sessionId)));
	const http = createHttpRuntime(ctx, registry, designs, capabilities, resolved.routePrefix);
	ctx.webServer.register({
		kind: "prefix",
		path: resolved.routePrefix,
		handler: http.handler
	});
	ctx.webServer.register({
		kind: "exact",
		path: "/.well-known/dsh-genui",
		handler: http.handler
	});
	ctx.systemPrompt.section({
		name: "behavior:genui",
		order: 1,
		text: GENUI_BEHAVIOR_PROMPT
	});
	ctx.systemPrompt.section({
		name: "tool:genui",
		order: 118,
		text: () => genuiSystemPrompt(designs.defaultId())
	});
	registerDiscoveryBudget(ctx);
	const previewOrigin = `http://127.0.0.1:${ctx.webServer.port}`;
	registerGenuiTools(ctx, registry, designs, capabilities, resolved.routePrefix, previewOrigin);
	ctx.logger.info(`GenUI artifacts: ${registry.root}`);
	return () => {
		capabilities.clear();
	};
}

//#endregion
//#region src/index.ts
const name = "genui";
const inject = [
	"tools",
	"systemPrompt",
	"webServer",
	"agents"
];

//#endregion
export { ArtifactRegistry, Config, DESIGN_PRESETS, DesignStore, apply, buildArtifact, inject, name };