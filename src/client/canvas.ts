import { useLayoutEffect, useState, useSyncExternalStore } from 'react'

type Listener = () => void

export interface CanvasSurface {
  mode: 'split' | 'full'
  width: number
}

const MIN_CANVAS_WIDTH = 340
const MAX_CANVAS_WIDTH = 520
const MIN_CONVERSATION_WIDTH = 600
const CANVAS_SHARE = 0.4
const INITIAL_SURFACE: CanvasSurface = { mode: 'split', width: 440 }

export function solveCanvasSurface(frameWidth: number, workspaceWidth: number): CanvasSurface {
  const available = Math.max(0, workspaceWidth)
  const largestWithoutCrowdingChat = available - MIN_CONVERSATION_WIDTH
  if (largestWithoutCrowdingChat < MIN_CANVAS_WIDTH) return { mode: 'full', width: frameWidth }
  const preferred = Math.round(available * CANVAS_SHARE)
  return {
    mode: 'split',
    width: Math.min(MAX_CANVAS_WIDTH, largestWithoutCrowdingChat, Math.max(MIN_CANVAS_WIDTH, preferred)),
  }
}

function hostColumns(element: HTMLElement): { center: HTMLElement; frame: HTMLElement } {
  let center = element
  while (true) {
    const frame: HTMLElement | null = center.parentElement
    if (frame === null) break
    const hasOverlay = Array.from(frame.children).some(child => child instanceof HTMLElement && child.hasAttribute('data-shell-overlay'))
    if (hasOverlay) return { center, frame }
    center = frame
  }
  throw new Error('Harness layout columns are missing')
}

class CanvasController {
  private readonly activeBySession = new Map<string, string>()
  private readonly listeners = new Map<string, Set<Listener>>()

  open(sessionId: string, artifactId: string): void {
    if (this.activeBySession.get(sessionId) === artifactId) return
    this.activeBySession.set(sessionId, artifactId)
    this.emit(sessionId)
  }

  close(sessionId: string, artifactId: string): void {
    if (this.activeBySession.get(sessionId) !== artifactId) return
    this.activeBySession.delete(sessionId)
    this.emit(sessionId)
  }

  isOpen(sessionId: string, artifactId: string): boolean {
    return this.activeBySession.get(sessionId) === artifactId
  }

  subscribe(sessionId: string, listener: Listener): () => void {
    const group = this.listeners.get(sessionId) ?? new Set<Listener>()
    group.add(listener)
    this.listeners.set(sessionId, group)
    return () => {
      group.delete(listener)
      if (group.size === 0) this.listeners.delete(sessionId)
    }
  }

  private emit(sessionId: string): void {
    for (const listener of this.listeners.get(sessionId) ?? []) listener()
  }
}

export const canvasController = new CanvasController()

export function useCanvasArtifact(sessionId: string, artifactId: string): boolean {
  return useSyncExternalStore(
    listener => canvasController.subscribe(sessionId, listener),
    () => canvasController.isOpen(sessionId, artifactId),
    () => false,
  )
}

export function useCanvasSurface(open: boolean, card: HTMLElement | null): CanvasSurface {
  const [surface, setSurface] = useState<CanvasSurface>(INITIAL_SURFACE)

  useLayoutEffect(() => {
    if (!open || card === null) return
    const { center, frame } = hostColumns(card)
    const update = () => {
      const next = solveCanvasSurface(frame.getBoundingClientRect().width, center.getBoundingClientRect().width)
      center.style.setProperty('--dsh-genui-canvas-width', `${next.width}px`)
      if (next.mode === 'split') {
        center.dataset.genuiCanvasHost = 'true'
        center.style.setProperty('--dsh-genui-canvas-reserve', `${next.width}px`)
      } else {
        delete center.dataset.genuiCanvasHost
        center.style.removeProperty('--dsh-genui-canvas-reserve')
      }
      setSurface(current => current.mode === next.mode && current.width === next.width ? current : next)
    }
    const observer = new ResizeObserver(update)
    observer.observe(frame)
    observer.observe(center)
    update()
    return () => {
      observer.disconnect()
      delete center.dataset.genuiCanvasHost
      center.style.removeProperty('--dsh-genui-canvas-width')
      center.style.removeProperty('--dsh-genui-canvas-reserve')
    }
  }, [card, open])

  return surface
}
