import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { ArtifactRegistry } from './artifacts/registry.ts'
import { buildArtifact } from './artifacts/builder.ts'
import { verifyArtifactInBrowser } from './artifacts/browser-verifier.ts'
import type { ArtifactCapability, ArtifactVersion, BuildDiagnostic, FilePatch, SourceFile } from './artifacts/types.ts'
import type { DesignStore } from './designs/store.ts'
import type { CapabilityStore } from './runtime/capabilities.ts'

const diagnosticsSchema = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      severity: { type: 'string' as const, required: true },
      text: { type: 'string' as const, required: true },
      file: { type: 'string' as const },
      line: { type: 'integer' as const },
      column: { type: 'integer' as const },
    },
  },
} as const

const receiptSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    artifact_id: { type: 'string' as const, required: true },
    title: { type: 'string' as const, required: true },
    version_id: { type: 'string' as const, required: true },
    status: { type: 'string' as const, required: true },
    preview_url: { type: 'string' as const },
    message: { type: 'string' as const, required: true },
    diagnostics: diagnosticsSchema,
  },
} as const

interface ToolReceipt {
  artifact_id: string
  title: string
  version_id: string
  status: string
  preview_url?: string
  message: string
  diagnostics?: BuildDiagnostic[]
}

function renderReceipt(value: unknown): { type: 'text'; text: string }[] {
  const receipt = value as ToolReceipt
  if (receipt.status === 'ready') {
    return [{
      type: 'text',
      text: 'This successful result must be the last emitted item. Emit no text and run no tools after it.',
    }]
  }
  const diagnosticText = receipt.diagnostics?.length
    ? `\nDiagnostics:\n${receipt.diagnostics.map(item => `- ${item.file ?? '<build>'}${item.line === undefined ? '' : `:${item.line}`}: ${item.text}`).join('\n')}`
    : ''
  return [{
    type: 'text',
    text: `This attempt needs correction. Do not call genui_create again for this artifact. Follow the repair instruction below with genui_update, then continue silently.\nArtifact: ${receipt.title} (${receipt.artifact_id})\nVersion: ${receipt.version_id}\nRepair instruction: ${receipt.message}${diagnosticText}`,
  }]
}

function requireAgent(agent: Agent | undefined): Agent {
  if (agent === undefined) throw new Error('GenUI tools require a live Harness agent')
  return agent
}

function presentation(value: unknown): JsonValue {
  const receipt = value as ToolReceipt
  return {
    card: 'genui',
    artifactId: receipt.artifact_id,
    title: receipt.title,
    versionId: receipt.version_id,
    status: receipt.status,
    ...(receipt.preview_url === undefined ? {} : { previewUrl: receipt.preview_url }),
    message: receipt.message,
    diagnostics: receipt.diagnostics ?? [],
  } as unknown as JsonValue
}

async function compile(
  registry: ArtifactRegistry,
  capabilities: CapabilityStore,
  routePrefix: string,
  previewOrigin: string,
  version: ArtifactVersion,
  agent: Agent,
): Promise<ToolReceipt> {
  const artifact = await registry.get(version.artifactId)
  const result = await buildArtifact(version, registry.distPath(version.artifactId, version.id))
  if (!result.ok) {
    const settled = await registry.settle(version.artifactId, version.id, {
      checkedAt: new Date().toISOString(),
      build: 'failed',
      browser: 'not-run',
      diagnostics: result.diagnostics,
      notes: ['candidate rejected; last-known-good version preserved'],
    })
    const record = await registry.get(version.artifactId)
    return {
      artifact_id: settled.artifactId,
      title: artifact.title,
      version_id: settled.id,
      status: settled.status,
      message: record.currentVersionId === undefined
        ? 'Initial build failed. Repair the reported files with genui_update using this failed version as the base.'
        : 'Candidate build failed. Repair the reported files and call genui_update against the current ready version.',
      diagnostics: result.diagnostics,
    }
  }
  const verificationToken = capabilities.issue(version.artifactId, agent, 'verification')
  const verificationUrl = `${routePrefix}/preview/${version.artifactId}/${version.id}?lang=en#token=${verificationToken}`
  const browser = await verifyArtifactInBrowser(`${previewOrigin}${verificationUrl}`)
  capabilities.revoke(verificationToken)
  const settled = await registry.settle(version.artifactId, version.id, {
    checkedAt: new Date().toISOString(),
    build: 'passed',
    browser: browser.ok ? 'passed' : 'failed',
    diagnostics: [...result.diagnostics, ...browser.diagnostics],
    notes: browser.notes,
  })
  if (!browser.ok) {
    return {
      artifact_id: settled.artifactId,
      title: artifact.title,
      version_id: settled.id,
      status: settled.status,
      message: 'Candidate rendered incorrectly in the browser. Repair the diagnostics; the last-known-good version is unchanged.',
      diagnostics: [...result.diagnostics, ...browser.diagnostics],
    }
  }
  const token = capabilities.issue(version.artifactId, agent)
  const previewUrl = `${routePrefix}/preview/${version.artifactId}/${version.id}?lang=en#token=${token}`
  return {
    artifact_id: settled.artifactId,
    title: artifact.title,
    version_id: settled.id,
    status: settled.status,
    preview_url: previewUrl,
    message: 'Artifact compiled, passed desktop/mobile browser checks, and became the last-known-good version.',
    diagnostics: [...result.diagnostics, ...browser.diagnostics],
  }
}

const fileSpec = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    path: { type: 'string' as const, required: true },
    content: { type: 'string' as const, required: true },
  },
} as const

const capabilitySpec = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    id: { type: 'string' as const, required: true, description: 'Stable lowercase kebab-case capability id.' },
    kind: { type: 'string' as const, required: true, enum: ['tool', 'external'] },
    label: { type: 'string' as const, required: true, description: 'Short user-facing permission name without implementation terms.' },
    reason: { type: 'string' as const, required: true, description: 'Concrete user-facing explanation of why the app needs this permission.' },
    access: { type: 'string' as const, required: true, enum: ['read', 'write'] },
    tool: { type: 'string' as const, description: 'Exact connected Harness, MCP, or Skill tool name when kind is tool. Prefer this whenever a suitable connected tool exists.' },
    url_prefix: { type: 'string' as const, description: 'Credential-free HTTPS URL prefix when kind is external. Use only when no suitable connected tool exists.' },
    methods: { type: 'array' as const, items: { type: 'string' as const }, description: 'Allowed HTTP methods when kind is external.' },
  },
} as const

interface CapabilityInput {
  id: string
  kind: string
  label: string
  reason: string
  access: string
  tool?: string
  url_prefix?: string
  methods?: string[]
}

function capabilitiesFromInput(input: CapabilityInput[]): ArtifactCapability[] {
  return input.map(item => item.kind === 'tool'
    ? {
        id: item.id, kind: 'tool', label: item.label, reason: item.reason,
        access: item.access as 'read' | 'write', tool: item.tool ?? '',
      }
    : {
        id: item.id, kind: 'external', label: item.label, reason: item.reason,
        access: item.access as 'read' | 'write', urlPrefix: item.url_prefix ?? '',
        methods: (item.methods ?? []) as Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>,
      })
}

function registerDesignTools(ctx: Context, registry: ArtifactRegistry, designs: DesignStore): void {
  ctx.tools.register(defineTool({
    name: 'genui_design_list',
    description: 'List reusable DESIGN.md profiles available to generated artifacts.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute() {
      return { default_design_id: designs.defaultId() ?? null, designs: await designs.list() } as unknown as Record<string, JsonValue>
    },
    isConcurrencySafe: () => true,
  }))

  ctx.tools.register(defineTool({
    name: 'genui_design_import',
    description: 'Import or replace one reusable DESIGN.md profile. The content becomes authoritative for future generations that select this design id.',
    parameters: {
      design_id: { type: 'string', required: true },
      content: { type: 'string', required: true, description: 'Complete DESIGN.md content beginning with one # heading.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const design = await designs.put(args.design_id, args.content)
      return { design_id: design.id, title: design.title, filename: 'DESIGN.md', bytes: Buffer.byteLength(design.content) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'genui_design_export',
    description: 'Export a reusable design profile or the DESIGN.md pinned to an artifact version. Provide exactly one of design_id or artifact_id.',
    parameters: {
      design_id: { type: 'string' },
      artifact_id: { type: 'string' },
      version_id: { type: 'string', description: 'Optional artifact version; defaults to the current ready version.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const hasDesign = args.design_id !== undefined
      const hasArtifact = args.artifact_id !== undefined
      if (hasDesign === hasArtifact) throw new Error('provide exactly one of design_id or artifact_id')
      if (hasDesign) {
        const design = await designs.get(args.design_id as string)
        return { design_id: design.id, title: design.title, filename: 'DESIGN.md', content: design.content }
      }
      const version = await registry.getVersion(args.artifact_id as string, args.version_id)
      const content = version.files.find(file => file.path === 'DESIGN.md')?.content
      if (content === undefined) throw new Error('artifact version does not contain DESIGN.md')
      return { artifact_id: version.artifactId, version_id: version.id, filename: 'DESIGN.md', content }
    },
    isConcurrencySafe: () => true,
  }))
}

export function registerGenuiTools(
  ctx: Context,
  registry: ArtifactRegistry,
  designs: DesignStore,
  capabilities: CapabilityStore,
  routePrefix: string,
  previewOrigin: string,
): void {
  registerDesignTools(ctx, registry, designs)
  ctx.tools.register(defineTool({
    name: 'genui_create',
    description: 'Create and compile a new multi-file React/TypeScript UI artifact. Put source directly in this call; never stage it with workspace write, edit, shell, or coding tools. Call this only once per artifact id; repair any failed attempt with genui_update using the returned version guidance. Use ordinary source code, not an intermediate UI representation.',
    parameters: {
      artifact_id: { type: 'string', required: true, description: 'Stable lowercase kebab-case id.' },
      title: { type: 'string', required: true },
      summary: { type: 'string', required: true },
      requirements: { type: 'array', items: { type: 'string' }, required: true },
      capabilities: {
        type: 'array', items: capabilitySpec, required: true,
        description: 'Only the exact connected actions and credential-free HTTPS services this app may request. Prefer exact Harness/MCP/Skill tool names; declare an external URL only when no suitable connected tool exists. Use [] for a local-only app.',
      },
      files: { type: 'array', items: fileSpec, required: true },
    },
    output: {
      schema: receiptSchema,
      render: (_args, value) => renderReceipt(value),
      presentationMeta: (_args, value) => presentation(value),
    },
    async execute(args, exec) {
      const version = await registry.create({
        id: args.artifact_id,
        title: args.title,
        summary: args.summary,
        requirements: args.requirements,
        capabilities: capabilitiesFromInput(args.capabilities as CapabilityInput[]),
        files: args.files as SourceFile[],
      })
      return compile(registry, capabilities, routePrefix, previewOrigin, version, requireAgent(exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'genui_update',
    description: 'Incrementally update an existing UI artifact. Only send changed, added, or deleted files and retain all still-active requirements.',
    parameters: {
      artifact_id: { type: 'string', required: true },
      base_version_id: { type: 'string', required: true },
      summary: { type: 'string', required: true },
      patches: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            content: { type: 'string' },
            delete: { type: 'boolean' },
          },
        },
      },
      add_requirements: { type: 'array', items: { type: 'string' } },
      supersede_requirements: { type: 'array', items: { type: 'string' } },
      capabilities: {
        type: 'array', items: capabilitySpec,
        description: 'Complete replacement list when connected actions change. Prefer exact Harness/MCP/Skill tool names; use an external URL only when no suitable connected tool exists. Omit to preserve the current list.',
      },
    },
    output: {
      schema: receiptSchema,
      render: (_args, value) => renderReceipt(value),
      presentationMeta: (_args, value) => presentation(value),
    },
    async execute(args, exec) {
      const version = await registry.update({
        id: args.artifact_id,
        baseVersionId: args.base_version_id,
        summary: args.summary,
        patches: args.patches as FilePatch[],
        ...(args.add_requirements === undefined ? {} : { addRequirements: args.add_requirements }),
        ...(args.supersede_requirements === undefined ? {} : { supersedeRequirements: args.supersede_requirements }),
        ...(args.capabilities === undefined ? {} : { capabilities: capabilitiesFromInput(args.capabilities as CapabilityInput[]) }),
      })
      return compile(registry, capabilities, routePrefix, previewOrigin, version, requireAgent(exec.agent))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'genui_state_read',
    description: 'Read the current user-scoped values submitted or selected inside one generated app. Use this silently when a later user message refers to choices, form answers, feedback, or progress in that app.',
    parameters: {
      artifact_id: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const agent = requireAgent(exec.agent)
      const state = await registry.readState(args.artifact_id, String(agent.id))
      return {
        artifact_id: args.artifact_id,
        values: state?.values ?? {},
        updated_at: state?.updatedAt ?? null,
        expires_at: state?.expiresAt ?? null,
      } as unknown as Record<string, JsonValue>
    },
    isConcurrencySafe: () => true,
  }))

  ctx.tools.register(defineTool({
    name: 'genui_inspect',
    description: 'Inspect an artifact, including full source files, requirement ledger, version status, and validation evidence.',
    parameters: {
      artifact_id: { type: 'string', required: true },
      version_id: { type: 'string' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const artifact = await registry.get(args.artifact_id)
      const version = await registry.getVersion(args.artifact_id, args.version_id)
      return JSON.parse(JSON.stringify({ artifact, version })) as Record<string, JsonValue>
    },
    isConcurrencySafe: () => true,
  }))

  ctx.tools.register(defineTool({
    name: 'genui_rollback',
    description: 'Move the artifact current pointer to an earlier ready version without deleting history.',
    parameters: {
      artifact_id: { type: 'string', required: true },
      version_id: { type: 'string', required: true },
    },
    output: {
      schema: receiptSchema,
      render: (_args, value) => renderReceipt(value),
      presentationMeta: (_args, value) => presentation(value),
    },
    async execute(args, exec) {
      const artifact = await registry.rollback(args.artifact_id, args.version_id)
      const token = capabilities.issue(args.artifact_id, requireAgent(exec.agent))
      return {
        artifact_id: args.artifact_id,
        title: artifact.title,
        version_id: args.version_id,
        status: 'ready',
        preview_url: `${routePrefix}/preview/${args.artifact_id}/${args.version_id}?lang=en#token=${token}`,
        message: 'Artifact rolled back to the selected ready version.',
        diagnostics: [],
      }
    },
  }))
}
