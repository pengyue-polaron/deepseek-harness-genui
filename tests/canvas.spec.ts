import { describe, expect, it } from 'vitest'
import { canvasController, solveCanvasSurface } from '../src/client/canvas.ts'

describe('Canvas controller', () => {
  it('grows with available space while preserving a readable conversation', () => {
    expect(solveCanvasSurface(1440, 1160)).toEqual({ mode: 'split', width: 534 })
    expect(solveCanvasSurface(1320, 1040)).toEqual({ mode: 'split', width: 478 })
    expect(solveCanvasSurface(1280, 1000)).toEqual({ mode: 'split', width: 440 })
    expect(solveCanvasSurface(1200, 920)).toEqual({ mode: 'split', width: 360 })
    expect(solveCanvasSurface(1160, 880)).toEqual({ mode: 'full', width: 1160 })
  })

  it('keeps one active artifact per session without affecting another session', () => {
    canvasController.open('session-a', 'trip-planner')
    canvasController.open('session-b', 'feedback-form')
    expect(canvasController.isOpen('session-a', 'trip-planner')).toBe(true)
    expect(canvasController.isOpen('session-b', 'feedback-form')).toBe(true)

    canvasController.open('session-a', 'weather-map')
    expect(canvasController.isOpen('session-a', 'trip-planner')).toBe(false)
    expect(canvasController.isOpen('session-a', 'weather-map')).toBe(true)

    canvasController.close('session-a', 'weather-map')
    canvasController.close('session-b', 'feedback-form')
  })
})
