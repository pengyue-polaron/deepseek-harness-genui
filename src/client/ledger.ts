import { useLayoutEffect, useSyncExternalStore } from 'react'

interface Entry {
  callId: string
  element: HTMLElement
  hasPreview: boolean
  sequence: number
}

class ArtifactCardLedger {
  private sequence = 0
  private readonly entries = new Map<string, Map<string, Entry>>()
  private readonly listeners = new Map<string, Set<() => void>>()

  mount(key: string, callId: string, element: HTMLElement, hasPreview: boolean): () => void {
    const group = this.entries.get(key) ?? new Map<string, Entry>()
    group.set(callId, { callId, element, hasPreview, sequence: ++this.sequence })
    this.entries.set(key, group)
    this.emit(key)
    return () => {
      group.delete(callId)
      if (group.size === 0) this.entries.delete(key)
      this.emit(key)
    }
  }

  isPrimary(key: string, callId: string): boolean {
    const group = [...(this.entries.get(key)?.values() ?? [])]
    const eligible = group.filter(entry => entry.hasPreview)
    const candidates = eligible.length > 0 ? eligible : group
    return candidates.reduce<Entry | undefined>((latest, entry) =>
      latest === undefined || entry.sequence > latest.sequence ? entry : latest, undefined)?.callId === callId
  }

  focusPrimary(key: string): void {
    const group = [...(this.entries.get(key)?.values() ?? [])]
    const eligible = group.filter(entry => entry.hasPreview)
    const candidates = eligible.length > 0 ? eligible : group
    const latest = candidates.reduce<Entry | undefined>((current, entry) =>
      current === undefined || entry.sequence > current.sequence ? entry : current, undefined)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    latest?.element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    latest?.element.focus({ preventScroll: true })
  }

  subscribe(key: string, listener: () => void): () => void {
    const group = this.listeners.get(key) ?? new Set<() => void>()
    group.add(listener)
    this.listeners.set(key, group)
    return () => {
      group.delete(listener)
      if (group.size === 0) this.listeners.delete(key)
    }
  }

  private emit(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) listener()
  }
}

export const artifactCardLedger = new ArtifactCardLedger()

export function usePrimaryArtifactCard(key: string, callId: string, element: HTMLElement | null, hasPreview: boolean): boolean {
  useLayoutEffect(() => element === null ? undefined : artifactCardLedger.mount(key, callId, element, hasPreview),
    [callId, element, hasPreview, key])
  return useSyncExternalStore(
    listener => artifactCardLedger.subscribe(key, listener),
    () => artifactCardLedger.isPrimary(key, callId),
    () => false,
  )
}
