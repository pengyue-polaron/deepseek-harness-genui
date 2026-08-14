export interface GenuiReadyMessage {
  source: 'dsh-genui'
  type: 'ready'
  artifactId: string
  versionId: string
}

export function isGenuiReadyMessage(
  event: MessageEvent<unknown>,
  frameWindow: Window | null,
  artifactId: string,
  versionId: string,
): event is MessageEvent<GenuiReadyMessage> {
  if (event.source !== frameWindow || typeof event.data !== 'object' || event.data === null) return false
  const value = event.data as Partial<GenuiReadyMessage>
  return value.source === 'dsh-genui'
    && value.type === 'ready'
    && value.artifactId === artifactId
    && value.versionId === versionId
}
