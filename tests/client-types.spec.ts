import { describe, expect, it } from 'vitest'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { readMeta } from '../src/client/types.ts'
import { renderReceipt } from '../src/tools.ts'

const artifactId = 's-123456789abc-task-map'
const createVersion = 'v-12345678-1234-1234-1234-123456789abc'
const updateVersion = 'v-abcdefab-1234-5678-9abc-abcdefabcdef'

function receipt(versionId: string, title: string) {
  return {
    artifact_id: artifactId,
    title,
    version_id: versionId,
    status: 'ready',
    preview_url: `/genui/preview/${artifactId}/${versionId}?lang=en#token=payload.signature`,
    app_url: `http://127.0.0.1:3080/genui/app/${artifactId}?lang=en#token=payload.signature`,
    delivery: 'embedded',
    message: 'ready',
  }
}

function nestedBlock(tool: 'genui_create' | 'genui_update', value: ReturnType<typeof receipt>, meta?: unknown): ToolCallViewProps['block'] {
  return {
    kind: 'tool-result',
    seq: 2,
    time: Date.now(),
    callId: `${tool}-call`,
    call: { name: tool, argsRaw: '{}' },
    callTime: Date.now() - 1,
    content: renderReceipt(value),
    isError: false,
    ...(meta === undefined ? {} : { meta }),
    callView: null,
    resultView: null,
    subCalls: [],
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

describe('GenUI tool receipt metadata', () => {
  it('restores nested PTC create and update cards when presentation meta is absent', () => {
    expect(readMeta(nestedBlock('genui_create', receipt(createVersion, 'Task map')))).toEqual({
      artifactId,
      title: 'Task map',
      versionId: createVersion,
    })
    expect(readMeta(nestedBlock('genui_update', receipt(updateVersion, 'Updated task map')))).toEqual({
      artifactId,
      title: 'Updated task map',
      versionId: updateVersion,
    })
  })

  it('keeps preview capabilities out of embedded receipt content', () => {
    const rendered = renderReceipt(receipt(createVersion, 'Task map'))
    const text = (rendered[0] as { type: 'text'; text: string }).text
    expect(text).not.toContain('payload.signature')
    expect(text).not.toContain('/genui/preview/')
    const encoded = text.match(/<!--dsh-genui-receipt:([A-Za-z0-9_-]+)-->$/)?.[1]
    expect(encoded).toBeDefined()
    expect(JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString('utf8'))).toEqual({
      v: 1, card: 'genui', artifactId, title: 'Task map', versionId: createVersion,
    })
  })

  it('prefers normal presentation meta over the content fallback', () => {
    const direct = {
      card: 'genui', artifactId, title: 'Direct metadata', versionId: createVersion,
      previewUrl: `/genui/preview/${artifactId}/${createVersion}?lang=en#token=direct.signature`,
    }
    expect(readMeta(nestedBlock('genui_update', receipt(updateVersion, 'Fallback metadata'), direct))).toEqual({
      artifactId,
      title: 'Direct metadata',
      versionId: createVersion,
      previewUrl: `/genui/preview/${artifactId}/${createVersion}?lang=en#token=direct.signature`,
    })
  })

  it('ignores old prose, malformed markers, unknown versions, and secret-bearing sentinels', () => {
    const base = nestedBlock('genui_create', receipt(createVersion, 'Task map')) as Extract<ToolCallViewProps['block'], { kind: 'tool-result' }>
    const withText = (text: string): ToolCallViewProps['block'] => ({ ...base, content: [{ type: 'text', text }] })
    expect(readMeta(withText(`Task map\nhttps://attacker.example/${artifactId}/${createVersion}`))).toBeUndefined()
    expect(readMeta(withText('<!--dsh-genui-receipt:not-base64!-->'))).toBeUndefined()
    expect(readMeta(withText(`<!--dsh-genui-receipt:${encode({
      v: 2, card: 'genui', artifactId, title: 'Task map', versionId: createVersion,
    })}-->`))).toBeUndefined()
    expect(readMeta(withText(`<!--dsh-genui-receipt:${encode({
      v: 1, card: 'genui', artifactId, title: 'Task map', versionId: createVersion,
      previewUrl: `https://attacker.example/genui/preview/${artifactId}/${createVersion}#token=stolen`,
    })}-->`))).toBeUndefined()
    expect(readMeta(withText(`prefix <!--dsh-genui-receipt:${encode({
      v: 1, card: 'genui', artifactId, title: 'Task map', versionId: createVersion,
    })}-->`))).toBeUndefined()
  })

  it('rejects ambiguous duplicate receipt markers', () => {
    const base = nestedBlock('genui_update', receipt(updateVersion, 'Updated task map')) as Extract<ToolCallViewProps['block'], { kind: 'tool-result' }>
    const content = renderReceipt(receipt(updateVersion, 'Updated task map'))
    const text = (content[0] as { type: 'text'; text: string }).text
    expect(readMeta({ ...base, content: [{ type: 'text', text: `${text}\n${text.split('\n').at(-1)}` }] })).toBeUndefined()
  })
})
