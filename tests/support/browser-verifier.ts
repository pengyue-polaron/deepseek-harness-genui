import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import type { BuildDiagnostic } from '../../src/artifacts/types.ts'

export interface BrowserVerificationResult {
  ok: boolean
  diagnostics: BuildDiagnostic[]
  notes: string[]
}

export async function mountBridgedPreview(page: Page, url: string, title = 'artifact'): Promise<void> {
  const preview = new URL(url)
  const fragment = [...new URLSearchParams(preview.hash.slice(1)).entries()]
  const token = fragment.length === 1 && fragment[0]?.[0] === 'token' ? fragment[0][1] : undefined
  const marker = '/preview/'
  const markerAt = preview.pathname.lastIndexOf(marker)
  if (token === undefined || token === '' || markerAt < 0) throw new Error('browser verification capability is invalid')
  const previewParts = preview.pathname.slice(markerAt + marker.length).split('/').map(decodeURIComponent)
  const artifactId = previewParts[0]
  const versionId = previewParts[1]
  if (artifactId === undefined || artifactId === '' || versionId === undefined || versionId === '' || previewParts.length !== 2) {
    throw new Error('browser verification preview route is invalid')
  }
  const endpoint = `${preview.origin}${preview.pathname.slice(0, markerAt)}/api/${encodeURIComponent(artifactId)}`
  const nonce = crypto.randomUUID()
  preview.hash = new URLSearchParams({ token: 'bridge-v1', bridge_nonce: nonce }).toString()
  await page.evaluate((frameTitle) => {
    const frame = document.createElement('iframe')
    frame.title = frameTitle
    frame.sandbox.add('allow-scripts', 'allow-modals')
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
    document.body.append(frame)
  }, title)
  await page.evaluate(({ childUrl, capability, apiEndpoint, artifact, version, expectedNonce, frameTitle }) => {
    const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe')].find(item => item.title === frameTitle)
    if (frame === undefined) throw new Error('verification iframe is missing')
    const actions = new Set(['state/read', 'state/write', 'tool', 'external'])
    let port: MessagePort | undefined
    let started = false
    let accepted = false
    const send = (message: Record<string, unknown>) => port?.postMessage({
      source: 'dsh-genui', bridgeVersion: 1, nonce: expectedNonce, ...message,
    })
    window.addEventListener('message', (event) => {
      const value = event.data as Record<string, unknown> | null
      if (accepted || port !== undefined || event.source !== frame.contentWindow || event.origin !== 'null'
        || event.ports.length !== 1 || value === null || value.source !== 'dsh-genui'
        || value.type !== 'bridge-connect' || value.bridgeVersion !== 1 || value.nonce !== expectedNonce
        || value.artifactId !== artifact || value.versionId !== version) return
      const acceptedPort = event.ports[0]
      if (acceptedPort === undefined) return
      port = acceptedPort
      accepted = true
      acceptedPort.onmessage = (message) => {
        const request = message.data as Record<string, unknown> | null
        if (request === null || request.source !== 'dsh-genui' || request.bridgeVersion !== 1
          || request.nonce !== expectedNonce || request.artifactId !== artifact || request.versionId !== version) return
        if (request.type === 'preview-loaded') {
          if (started) return
          started = true
          send({ type: 'theme', theme: 'light' })
          send({ type: 'start-app' })
          return
        }
        if (request.type === 'preview-leaving') {
          port?.close()
          port = undefined
          started = false
          frame.style.visibility = 'hidden'
          return
        }
        if (request.type !== 'api-request' || !started || typeof request.requestId !== 'string'
          || request.requestId.length === 0 || request.requestId.length > 128
          || typeof request.action !== 'string' || !actions.has(request.action)
          || typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) return
        const requestId = request.requestId
        const action = request.action
        const body = request.body as Record<string, unknown>
        const timeout = action === 'tool' ? 65_000 : action === 'external' ? 35_000 : 10_000
        void fetch(`${apiEndpoint}/${action}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${capability}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, version_id: version }),
          signal: AbortSignal.timeout(timeout),
        }).then(async response => ({ ok: response.ok, status: response.status, value: await response.json() }))
          .then(result => send({ type: 'api-response', requestId, ...result }), error => send({
            type: 'api-response', requestId, ok: false, status: 502,
            value: { error: error instanceof Error ? error.message : 'verification request failed' },
          }))
      }
      acceptedPort.start()
      send({ type: 'bridge-accepted' })
    })
    frame.addEventListener('load', () => {
      if (!started) return
      port?.close()
      port = undefined
      started = false
      frame.style.visibility = 'hidden'
    })
    frame.src = childUrl
  }, {
    childUrl: preview.toString(), capability: token, apiEndpoint: endpoint,
    artifact: artifactId, version: versionId, expectedNonce: nonce, frameTitle: title,
  })
}

async function verifyWithBrowser(browser: Browser, url: string): Promise<BrowserVerificationResult> {
  let context: BrowserContext | undefined
  const diagnostics: BuildDiagnostic[] = []
  const notes: string[] = []
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto(new URL('/genui/not-found', url).toString())
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push({ severity: 'error', text: `browser console: ${message.text()}` })
      if (message.type() === 'warning') diagnostics.push({ severity: 'warning', text: `browser console: ${message.text()}` })
    })
    page.on('pageerror', error => diagnostics.push({ severity: 'error', text: `browser runtime: ${error.message}` }))
    await mountBridgedPreview(page, url)
    const frame = page.frameLocator('iframe[title="artifact"]')
    try {
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 10_000 })

      const surfaceSnapshot = () => frame.locator('html').evaluate((element) => {
        const visible = (candidate: Element): boolean => {
          const style = getComputedStyle(candidate)
          const rect = candidate.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
            && rect.width > 0 && rect.height > 0
        }
        const controls = [...document.querySelectorAll('input, select, textarea')].filter(visible).map(candidate => {
          if (candidate instanceof HTMLInputElement) return { value: candidate.value, checked: candidate.checked }
          if (candidate instanceof HTMLSelectElement) return { value: candidate.value, selectedIndex: candidate.selectedIndex }
          return { value: (candidate as HTMLTextAreaElement).value }
        })
        return JSON.stringify({ html: element.querySelector('#root')?.innerHTML ?? '', controls })
      })

      const themeSnapshot = () => frame.locator('html').evaluate(() => JSON.stringify(
        [document.documentElement, document.body, document.getElementById('root')].map(candidate => {
          if (candidate === null) return null
          const style = getComputedStyle(candidate)
          return { color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage }
        }),
      ))

      const inspectSurface = async (label: string, accessibility = false) => {
        const report = await frame.locator('html').evaluate((element, includeAccessibility) => {
          const visible = (candidate: Element): boolean => {
            const style = getComputedStyle(candidate)
            const rect = candidate.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
              && rect.width > 0 && rect.height > 0
          }
          const labelledBy = (candidate: Element): string => (candidate.getAttribute('aria-labelledby') ?? '')
            .split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim()
          const nameOf = (candidate: Element): string => {
            const explicit = candidate.getAttribute('aria-label')?.trim() || labelledBy(candidate)
            if (explicit) return explicit
            if (candidate instanceof HTMLInputElement || candidate instanceof HTMLSelectElement || candidate instanceof HTMLTextAreaElement) {
              const labels = [...(candidate.labels ?? [])].map(label => label.textContent?.trim() ?? '').join(' ').trim()
              if (labels) return labels
              if (candidate instanceof HTMLInputElement && ['button', 'submit', 'reset', 'image'].includes(candidate.type)) {
                return candidate.value.trim() || candidate.getAttribute('alt')?.trim() || ''
              }
              return ''
            }
            return candidate.textContent?.trim() || candidate.getAttribute('title')?.trim() || ''
          }
          const unlabeled: string[] = []
          const missingAlt: string[] = []
          const keyboardIssues: string[] = []
          if (includeAccessibility) {
            const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])'
            for (const [index, candidate] of [...document.querySelectorAll(selector)].entries()) {
              if (!visible(candidate)) continue
              const role = candidate.getAttribute('role')
              const type = candidate.getAttribute('type')
              const label = `${candidate.tagName.toLowerCase()}${type ? `[type=${type}]` : ''}${role ? `[role=${role}]` : ''} #${index + 1}`
              if (nameOf(candidate).length === 0) unlabeled.push(label)
              if ((candidate as HTMLElement).tabIndex < 0) {
                keyboardIssues.push(`${label} is not keyboard reachable`)
                continue
              }
              const active = document.activeElement
              const control = candidate as HTMLElement
              control.blur()
              const restingStyle = getComputedStyle(candidate)
              const resting = {
                outlineStyle: restingStyle.outlineStyle,
                outlineWidth: restingStyle.outlineWidth,
                outlineColor: restingStyle.outlineColor,
                outlineOffset: restingStyle.outlineOffset,
                boxShadow: restingStyle.boxShadow,
                backgroundColor: restingStyle.backgroundColor,
                backgroundImage: restingStyle.backgroundImage,
                borderTop: restingStyle.borderTop,
                borderRight: restingStyle.borderRight,
                borderBottom: restingStyle.borderBottom,
                borderLeft: restingStyle.borderLeft,
              }
              control.focus()
              const focusedStyle = getComputedStyle(candidate)
              const focused = {
                outlineStyle: focusedStyle.outlineStyle,
                outlineWidth: focusedStyle.outlineWidth,
                outlineColor: focusedStyle.outlineColor,
                outlineOffset: focusedStyle.outlineOffset,
                boxShadow: focusedStyle.boxShadow,
                backgroundColor: focusedStyle.backgroundColor,
                backgroundImage: focusedStyle.backgroundImage,
                borderTop: focusedStyle.borderTop,
                borderRight: focusedStyle.borderRight,
                borderBottom: focusedStyle.borderBottom,
                borderLeft: focusedStyle.borderLeft,
              }
              const outline = focusedStyle.outlineStyle !== 'none' && Number.parseFloat(focusedStyle.outlineWidth) > 0
                && focusedStyle.outlineColor !== 'transparent' && focusedStyle.outlineColor !== 'rgba(0, 0, 0, 0)'
                && (focused.outlineStyle !== resting.outlineStyle || focused.outlineWidth !== resting.outlineWidth
                  || focused.outlineColor !== resting.outlineColor || focused.outlineOffset !== resting.outlineOffset)
              const shadow = focusedStyle.boxShadow !== 'none' && focused.boxShadow !== resting.boxShadow
              const background = focused.backgroundColor !== resting.backgroundColor || focused.backgroundImage !== resting.backgroundImage
              const border = focused.borderTop !== resting.borderTop || focused.borderRight !== resting.borderRight
                || focused.borderBottom !== resting.borderBottom || focused.borderLeft !== resting.borderLeft
              if (document.activeElement !== candidate) keyboardIssues.push(`${label} cannot receive focus`)
              else if (!outline && !shadow && !background && !border) keyboardIssues.push(`${label} has no visible focus indicator`)
              if (active instanceof HTMLElement) active.focus()
            }
            for (const [index, image] of [...document.querySelectorAll('img')].entries()) {
              if (visible(image) && !image.hasAttribute('alt')) missingAlt.push(`img #${index + 1}`)
            }
          }
          return { width: element.clientWidth, scrollWidth: element.scrollWidth, unlabeled, missingAlt, keyboardIssues }
        }, accessibility)
        if (report.scrollWidth > report.width) {
          diagnostics.push({ severity: 'error', text: `${label} viewport overflows horizontally: ${report.scrollWidth}px > ${report.width}px` })
        } else {
          notes.push(`${label} mounted at ${report.width}px without horizontal overflow`)
        }
        for (const control of report.unlabeled) {
          diagnostics.push({ severity: 'error', text: `visible interactive control has no accessible name: ${control}` })
        }
        for (const image of report.missingAlt) {
          diagnostics.push({ severity: 'error', text: `visible image is missing alt text: ${image}` })
        }
        for (const issue of report.keyboardIssues) {
          diagnostics.push({ severity: 'error', text: `visible interactive control ${issue}` })
        }
      }

      await inspectSurface('light desktop', true)
      const lightThemeSnapshot = await themeSnapshot()

      const primary = await frame.locator('html').evaluate((_, interactiveSelector) => {
        const visible = (candidate: Element): boolean => {
          const style = getComputedStyle(candidate)
          const rect = candidate.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
            && rect.width > 0 && rect.height > 0
        }
        const controls = [...document.querySelectorAll(interactiveSelector)].filter(visible)
        const marked = [...document.querySelectorAll('[data-genui-primary-action]')].filter(visible)
        return {
          controls: controls.length,
          marked: marked.length,
          markedInteractive: marked.length === 1 && marked[0]?.matches(interactiveSelector),
        }
      }, 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]')

      if (primary.controls > 0) {
        if (primary.marked !== 1) {
          diagnostics.push({ severity: 'error', text: `interactive app must have exactly one visible data-genui-primary-action control; found ${primary.marked}` })
        } else if (!primary.markedInteractive) {
          diagnostics.push({ severity: 'error', text: 'data-genui-primary-action must be placed on an interactive control' })
        } else {
          const before = await surfaceSnapshot()
          let sdkActionObserved = false
          const observeAction = (request: { url(): string }) => {
            if (/\/(?:tool|external|state\/write)$/.test(new URL(request.url()).pathname)) sdkActionObserved = true
          }
          page.on('request', observeAction)
          const action = frame.locator('[data-genui-primary-action]:visible')
          const control = await action.evaluate(element => ({
            tag: element.tagName.toLowerCase(),
            type: element instanceof HTMLInputElement ? element.type : '',
          }))
          if (control.tag === 'select') {
            const values = await action.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))
            const next = values[1]
            if (next !== undefined) await action.selectOption(next)
          } else if (control.tag === 'textarea' || (control.tag === 'input' && ['text', 'search', 'email', 'url', 'tel'].includes(control.type))) {
            await action.fill('Verification input')
          } else if (control.tag === 'input' && ['range', 'number'].includes(control.type)) {
            await action.evaluate((element) => {
              const input = element as HTMLInputElement
              const current = Number(input.value)
              const min = input.min === '' ? 0 : Number(input.min)
              const max = input.max === '' ? current + 2 : Number(input.max)
              const step = input.step === '' || input.step === 'any' ? 1 : Number(input.step)
              input.value = String(current + step <= max ? current + step : Math.max(min, current - step))
              input.dispatchEvent(new Event('input', { bubbles: true }))
              input.dispatchEvent(new Event('change', { bubbles: true }))
            })
          } else {
            await action.click()
          }
          let changed = false
          for (let attempt = 0; attempt < 20 && !changed && !sdkActionObserved; attempt += 1) {
            await page.waitForTimeout(100)
            changed = await surfaceSnapshot() !== before
          }
          page.off('request', observeAction)
          if (changed || sdkActionObserved) notes.push('primary interaction changed the app or invoked a verified action')
          else diagnostics.push({ severity: 'error', text: 'data-genui-primary-action did not change visible app state or invoke a verified action' })
        }
      }

      await page.emulateMedia({ colorScheme: 'dark' })
      await page.locator('iframe[title="artifact"]').evaluate((element) => {
        const frame = element as HTMLIFrameElement
        frame.contentWindow?.postMessage({ source: 'dsh-genui', type: 'theme', theme: 'light' }, '*')
      })
      await page.waitForTimeout(50)
      const explicitLightThemeSnapshot = await themeSnapshot()
      if (explicitLightThemeSnapshot !== lightThemeSnapshot) {
        diagnostics.push({ severity: 'error', text: 'explicit light theme does not override the operating-system dark preference' })
      }
      const lightMarker = await frame.locator('html').getAttribute('data-ds-light-theme')
      if (lightMarker === null) diagnostics.push({ severity: 'error', text: 'artifact runtime did not apply the explicit light theme marker' })
      await page.locator('iframe[title="artifact"]').evaluate((element) => {
        const frame = element as HTMLIFrameElement
        frame.contentWindow?.postMessage({ source: 'dsh-genui', type: 'theme', theme: 'dark' }, '*')
      })
      await page.waitForTimeout(50)
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 5_000 })
      await inspectSurface('dark desktop')

      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 5_000 })
      await inspectSurface('reduced-motion desktop')

      await page.setViewportSize({ width: 390, height: 844 })
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 10_000 })
      await inspectSurface('mobile')

      await page.setViewportSize({ width: 260, height: 720 })
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 10_000 })
      await inspectSurface('compact mobile', true)
    } catch (error) {
      diagnostics.push({ severity: 'error', text: `sandboxed preview did not mount: ${error instanceof Error ? error.message : String(error)}` })
    }
  } catch (error) {
    diagnostics.push({ severity: 'error', text: `browser verification failed: ${error instanceof Error ? error.message : String(error)}` })
  } finally {
    await context?.close()
  }
  return {
    ok: diagnostics.every(item => item.severity !== 'error'),
    diagnostics,
    notes,
  }
}

export class BrowserVerifier {
  private browser: Promise<Browser> | undefined
  private readonly launchBrowser: () => Promise<Browser>

  constructor(launchBrowser?: () => Promise<Browser>) {
    this.launchBrowser = launchBrowser ?? (() => chromium.launch({ headless: true }))
  }

  async verify(url: string): Promise<BrowserVerificationResult> {
    try {
      const browser = await this.getBrowser()
      const result = await verifyWithBrowser(browser, url)
      if (!browser.isConnected()) this.browser = undefined
      return result
    } catch (error) {
      this.browser = undefined
      return {
        ok: false,
        diagnostics: [{ severity: 'error', text: `browser verification failed: ${error instanceof Error ? error.message : String(error)}` }],
        notes: [],
      }
    }
  }

  async close(): Promise<void> {
    const pending = this.browser
    this.browser = undefined
    if (pending === undefined) return
    await (await pending).close()
  }

  private async getBrowser(): Promise<Browser> {
    const current = this.browser ??= this.launchBrowser()
    try {
      const browser = await current
      if (browser.isConnected()) return browser
      if (this.browser === current) this.browser = this.launchBrowser()
      return await this.browser
    } catch (error) {
      if (this.browser === current) this.browser = undefined
      throw error
    }
  }
}

export async function verifyArtifactInBrowser(url: string): Promise<BrowserVerificationResult> {
  const verifier = new BrowserVerifier()
  try {
    return await verifier.verify(url)
  } finally {
    await verifier.close()
  }
}
