export interface GenuiReadyMessage {
  source: 'dsh-genui'
  type: 'ready'
  artifactId: string
  versionId: string
}

export interface GenuiRuntimeErrorMessage {
  source: 'dsh-genui'
  type: 'runtime-error'
  artifactId: string
  versionId: string
  /** Informational only; the host determines startup vs interactive from its accepted ready signal. */
  phase?: 'startup' | 'interactive'
}

function isCurrentFrameMessage(
  event: MessageEvent<unknown>,
  frameWindow: Window | null,
  artifactId: string,
  versionId: string,
): event is MessageEvent<GenuiReadyMessage | GenuiRuntimeErrorMessage> {
  if (event.source !== frameWindow || typeof event.data !== 'object' || event.data === null) return false
  const value = event.data as Partial<GenuiReadyMessage | GenuiRuntimeErrorMessage>
  return value.source === 'dsh-genui' && value.artifactId === artifactId && value.versionId === versionId
}

export function isGenuiReadyMessage(
  event: MessageEvent<unknown>,
  frameWindow: Window | null,
  artifactId: string,
  versionId: string,
): event is MessageEvent<GenuiReadyMessage> {
  return isCurrentFrameMessage(event, frameWindow, artifactId, versionId) && event.data.type === 'ready'
}

export function isGenuiRuntimeErrorMessage(
  event: MessageEvent<unknown>,
  frameWindow: Window | null,
  artifactId: string,
  versionId: string,
): event is MessageEvent<GenuiRuntimeErrorMessage> {
  return isCurrentFrameMessage(event, frameWindow, artifactId, versionId)
    && event.data.type === 'runtime-error'
    && (event.data.phase === undefined || event.data.phase === 'startup' || event.data.phase === 'interactive')
}
