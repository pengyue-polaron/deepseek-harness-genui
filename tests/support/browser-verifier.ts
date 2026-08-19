import { chromium } from 'playwright'
import type { Browser, BrowserContext } from 'playwright'
import type { BuildDiagnostic } from '../../src/artifacts/types.ts'

export interface BrowserVerificationResult {
  ok: boolean
  diagnostics: BuildDiagnostic[]
  notes: string[]
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
    const safeUrl = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
    await page.setContent(`<iframe title="artifact" sandbox="allow-scripts allow-forms allow-modals allow-downloads" src="${safeUrl}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`)
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
          if (includeAccessibility) {
            const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])'
            for (const [index, candidate] of [...document.querySelectorAll(selector)].entries()) {
              if (visible(candidate) && nameOf(candidate).length === 0) {
                const role = candidate.getAttribute('role')
                const type = candidate.getAttribute('type')
                unlabeled.push(`${candidate.tagName.toLowerCase()}${type ? `[type=${type}]` : ''}${role ? `[role=${role}]` : ''} #${index + 1}`)
              }
            }
            for (const [index, image] of [...document.querySelectorAll('img')].entries()) {
              if (visible(image) && !image.hasAttribute('alt')) missingAlt.push(`img #${index + 1}`)
            }
          }
          return { width: element.clientWidth, scrollWidth: element.scrollWidth, unlabeled, missingAlt }
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
      }

      await inspectSurface('light desktop', true)

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
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 5_000 })
      await inspectSurface('dark desktop')

      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 5_000 })
      await inspectSurface('reduced-motion desktop')

      await page.setViewportSize({ width: 390, height: 844 })
      await frame.locator('#root > *').first().waitFor({ state: 'visible', timeout: 10_000 })
      await inspectSurface('mobile')
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
