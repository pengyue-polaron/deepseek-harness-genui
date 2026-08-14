import { chromium } from 'playwright'
import type { BuildDiagnostic } from './types.ts'

export interface BrowserVerificationResult {
  ok: boolean
  diagnostics: BuildDiagnostic[]
  notes: string[]
}

export async function verifyArtifactInBrowser(url: string): Promise<BrowserVerificationResult> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const diagnostics: BuildDiagnostic[] = []
  const notes: string[] = []
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
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
    await browser?.close()
  }
  return {
    ok: diagnostics.every(item => item.severity !== 'error'),
    diagnostics,
    notes,
  }
}
