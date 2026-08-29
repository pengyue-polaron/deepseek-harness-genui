export const cardCss = `
.dsh-genui-anchor { position: relative; min-width: 0; }
[data-genui-canvas-host='true'] { box-sizing: border-box; padding-right: var(--dsh-genui-canvas-reserve); }
.dsh-genui-canvas-placeholder { display: flex; width: 100%; min-height: 42px; align-items: center; gap: 9px; border: 1px solid var(--dsw-alias-border-l1,rgba(37,40,44,.12)); border-radius: 11px; padding: 6px 9px; background: var(--dsw-alias-bg-layer-1,#faf9f6); color: var(--dsw-alias-label-primary,#252422); cursor: pointer; font: 12px/1.2 ui-sans-serif, sans-serif; text-align: left; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dsh-genui-canvas-placeholder:hover { background: var(--dsw-alias-bg-layer-2,#f2f0eb); }
.dsh-genui-canvas-placeholder:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary,#b94e32); outline-offset: 2px; }
.dsh-genui-canvas-placeholder > svg { width: 17px; height: 17px; flex: none; color: var(--dsw-alias-brand-primary,#b94e32); }
.dsh-genui-canvas-placeholder strong { min-width: 0; overflow: hidden; flex: 1; color: var(--dsw-alias-label-primary,#252422); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-canvas-placeholder span { color: var(--dsw-alias-brand-primary,#b94e32); font-weight: 650; white-space: nowrap; }
.dsh-genui-canvas-placeholder:disabled { cursor: default; }
.dsh-genui-card {
  --g-border: var(--dsw-alias-border-l1,rgba(37,40,44,.12));
  --g-panel: var(--dsw-alias-bg-base,#faf9f6);
  --g-panel-raised: var(--dsw-alias-bg-layer-1,#fff);
  --g-panel-soft: var(--dsw-alias-bg-layer-2,#f2f0eb);
  --g-ink: var(--dsw-alias-label-primary,#252422);
  --g-muted: var(--dsw-alias-label-secondary,#77736d);
  --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#252422) 6.5%,transparent);
  --g-focus: var(--dsw-alias-brand-primary,#b94e32);
  --g-success: var(--dsw-alias-state-success-primary,#287553);
  --g-danger: var(--dsw-alias-state-error-primary,#a84235);
  container-type: inline-size;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--g-border);
  border-radius: 13px;
  background: var(--g-panel);
  color: var(--g-ink);
  box-shadow: 0 1px 2px rgba(28,25,20,.035), 0 8px 28px rgba(28,25,20,.045);
  font-family: ui-sans-serif, sans-serif;
}
.dsh-genui-card[data-surface='canvas'] { position: fixed; z-index: 80; inset: 0 0 0 auto; display: flex; width: var(--dsh-genui-canvas-width,440px); height: 100dvh; border-width: 0 0 0 1px; border-radius: 0; flex-direction: column; box-shadow: none; animation: dsh-genui-canvas-in 220ms cubic-bezier(.2,.8,.2,1); }
.dsh-genui-card[data-surface='canvas'][data-canvas-layout='full'] { inset: 0; width: 100vw; border: 0; }
.dsh-genui-card[data-canvas-layout='full'] .dsh-genui-head { padding-top: max(4px,env(safe-area-inset-top)); padding-right: max(8px,env(safe-area-inset-right)); padding-left: max(10px,env(safe-area-inset-left)); }
.dsh-genui-card[data-canvas-layout='full'] .dsh-genui-fullscreen { display: none; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-body { height: auto; min-height: 0; flex: 1; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-collapse { display: none; }
.dsh-genui-card[data-surface='canvas'] .dsh-genui-head { min-height: 48px; padding-right: 8px; padding-left: 12px; }
@keyframes dsh-genui-canvas-in { from { opacity: .7; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
.dsh-genui-card:focus { outline: none; }
.dsh-genui-card:focus-visible { outline: 2px solid var(--g-focus); outline-offset: 2px; }
.dsh-genui-head { position: relative; z-index: 5; min-height: 42px; display: flex; align-items: center; gap: 8px; padding: 4px 7px 4px 9px; border-bottom: 1px solid var(--g-border); background: var(--g-panel-raised); }
.dsh-genui-card[data-collapsed='true'] .dsh-genui-head { border-bottom-color: transparent; }
.dsh-genui-name { min-width: 0; flex: 1; }
.dsh-genui-title { min-width: 0; overflow: hidden; margin: 0; color: var(--g-ink); font: 650 13px/1.2 ui-sans-serif,sans-serif; text-overflow: ellipsis; text-wrap: balance; white-space: nowrap; }
.dsh-genui-actions { display: flex; flex: none; align-items: center; gap: 4px; }
.dsh-genui-action { display: inline-flex; width: 32px; height: 32px; flex: none; align-items: center; justify-content: center; border: 0; border-radius: 8px; padding: 0; background: transparent; color: var(--g-muted); cursor: pointer; font: 650 11px/1 ui-sans-serif,sans-serif; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.dsh-genui-action:hover { background: var(--g-hover); color: var(--g-ink); }
.dsh-genui-action:active { background: color-mix(in srgb,var(--g-ink) 11%,transparent); }
.dsh-genui-action:focus-visible, .dsh-genui-button:focus-visible { outline: 2px solid var(--g-focus); outline-offset: 1px; }
.dsh-genui-action svg, .dsh-genui-button svg { width: 16px; height: 16px; flex: none; stroke-width: 1.8; }
.dsh-genui-open-label { display: none; }
.dsh-genui-button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--g-border); border-radius: 8px; padding: 0 11px; background: var(--g-panel-raised); color: var(--g-ink); cursor: pointer; font: 650 11px/1 ui-sans-serif,sans-serif; touch-action: manipulation; }
.dsh-genui-button:hover { background: var(--g-hover); }
.dsh-genui-button--strong { border-color: transparent; background: var(--g-ink); color: var(--g-panel-raised); }
.dsh-genui-button--strong:hover { background: color-mix(in srgb,var(--g-ink) 88%,transparent); }
.dsh-genui-button:disabled { cursor: wait; opacity: .55; }
.dsh-genui-body { position: relative; display: flex; height: min(420px,50vh); min-height: 260px; overflow: hidden; flex-direction: column; background: var(--g-panel); }
.dsh-genui-body[hidden], .dsh-genui-loading[hidden], .dsh-genui-frame-error[hidden] { display: none; }
.dsh-genui-frame-shell { position: relative; width: 100%; min-height: 0; flex: 1; }
.dsh-genui-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--g-panel); }
.dsh-genui-loading, .dsh-genui-frame-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--g-panel); color: var(--g-muted); font: 500 12px/1.4 ui-sans-serif,sans-serif; text-align: center; }
.dsh-genui-loading { pointer-events: none; }
.dsh-genui-frame-error > div { display: grid; justify-items: center; gap: 10px; }
.dsh-genui-toast { position: absolute; z-index: 60; top: 50px; left: 50%; max-width: calc(100% - 24px); overflow: hidden; border: 1px solid var(--g-border); border-radius: 999px; padding: 8px 11px; background: var(--g-ink); color: var(--g-panel-raised); box-shadow: 0 10px 30px rgba(20,18,14,.22); font: 650 11px/1.25 ui-sans-serif,sans-serif; text-align: center; text-overflow: ellipsis; transform: translateX(-50%); white-space: nowrap; }
.dsh-genui-permission-backdrop { position: absolute; z-index: 70; inset: 42px 0 0; display: grid; overflow: auto; overscroll-behavior: contain; place-items: center; padding: 20px; background: color-mix(in srgb,var(--g-panel) 78%,transparent); backdrop-filter: blur(8px); }
.dsh-genui-permission { display: grid; width: min(440px,100%); grid-template-columns: auto minmax(0,1fr); gap: 12px 14px; border: 1px solid var(--g-border); border-radius: 16px; padding: 18px; background: var(--g-panel-raised); box-shadow: 0 20px 60px rgba(20,18,14,.18); }
.dsh-genui-permission-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; background: color-mix(in srgb,var(--g-focus) 12%,var(--g-panel)); color: var(--g-focus); }
.dsh-genui-permission-mark svg { width: 17px; height: 17px; }
.dsh-genui-permission-copy { min-width: 0; }
.dsh-genui-permission-copy h4 { margin: 2px 0 6px; color: var(--g-ink); font: 700 16px/1.25 ui-sans-serif,sans-serif; overflow-wrap: anywhere; text-wrap: balance; }
.dsh-genui-permission-copy p { margin: 0; color: var(--g-muted); font: 12px/1.5 ui-sans-serif,sans-serif; overflow-wrap: anywhere; text-wrap: pretty; }
.dsh-genui-permission-copy .dsh-genui-permission-kicker { color: var(--g-focus); font-size: 10px; font-weight: 750; letter-spacing: .04em; }
.dsh-genui-permission-facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.dsh-genui-permission-facts span { max-width: 100%; overflow-wrap: anywhere; border: 1px solid var(--g-border); border-radius: 999px; padding: 5px 8px; background: var(--g-panel); color: var(--g-ink); font: 650 10px/1.2 ui-sans-serif,sans-serif; }
.dsh-genui-permission-copy .dsh-genui-permission-scope { font-size: 10px; }
.dsh-genui-permission-copy .dsh-genui-permission-queue { margin-top: 7px; color: var(--g-ink); font-size: 10px; font-weight: 650; }
.dsh-genui-permission-copy .dsh-genui-permission-error { margin-top: 8px; color: var(--g-danger); }
.dsh-genui-permission-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.dsh-genui-access { width: min(480px,100%); border: 1px solid var(--g-border); border-radius: 16px; padding: 18px; background: var(--g-panel-raised); box-shadow: 0 20px 60px rgba(20,18,14,.18); }
.dsh-genui-access-head { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; }
.dsh-genui-access-head h4 { margin: 1px 0 5px; color: var(--g-ink); font: 700 16px/1.25 ui-sans-serif,sans-serif; text-wrap: balance; }
.dsh-genui-access-head p { margin: 0; color: var(--g-muted); font: 12px/1.45 ui-sans-serif,sans-serif; text-wrap: pretty; }
.dsh-genui-access-list { display: grid; gap: 8px; margin: 16px 0; }
.dsh-genui-access-row { display: flex; min-width: 0; align-items: center; gap: 12px; border: 1px solid var(--g-border); border-radius: 11px; padding: 10px; background: var(--g-panel); }
.dsh-genui-access-row > div { display: grid; min-width: 0; flex: 1; gap: 3px; }
.dsh-genui-access-row strong { color: var(--g-ink); font: 650 12px/1.3 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-access-row span { color: var(--g-muted); font: 11px/1.4 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-access-row .dsh-genui-access-facts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.dsh-genui-access-row .dsh-genui-access-facts span { border: 1px solid var(--g-border); border-radius: 999px; padding: 3px 6px; color: var(--g-ink); font-size: 9px; font-weight: 650; }
.dsh-genui-access-row .dsh-genui-button { flex: none; }
.dsh-genui-access-row .dsh-genui-access-state { flex: none; color: var(--g-muted); font-weight: 650; }
.dsh-genui-access > .dsh-genui-permission-error { margin: 0 0 10px; color: var(--g-danger); font: 11px/1.4 ui-sans-serif,sans-serif; }
.dsh-genui-error { padding: 16px; color: var(--g-danger); font: 13px/1.45 ui-sans-serif,sans-serif; overflow-wrap: anywhere; }
.dsh-genui-receipt-shell { --g-border: var(--dsw-alias-border-l1,rgba(37,40,44,.12)); --g-panel-raised: var(--dsw-alias-bg-layer-1,#fff); --g-ink: var(--dsw-alias-label-primary,#252422); --g-muted: var(--dsw-alias-label-secondary,#77736d); --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#252422) 6.5%,transparent); --g-focus: var(--dsw-alias-brand-primary,#b94e32); --g-success: var(--dsw-alias-state-success-primary,#287553); --g-danger: var(--dsw-alias-state-error-primary,#a84235); position: relative; }
.dsh-genui-receipt { display: flex; min-height: 38px; align-items: center; gap: 8px; padding: 4px 7px 4px 10px; border: 1px solid var(--g-border); border-radius: 10px; background: var(--g-panel-raised); color: var(--g-muted); font: 11px/1.25 ui-sans-serif,sans-serif; }
.dsh-genui-receipt svg { width: 14px; height: 14px; flex: none; color: var(--g-success); }
.dsh-genui-receipt[data-failed='true'] svg { color: var(--g-danger); }
.dsh-genui-receipt strong { min-width: 0; overflow: hidden; color: var(--g-ink); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-receipt span { min-width: 0; overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-receipt button { width: auto; padding: 0 8px; }
.dsh-genui-progress { --g-border: var(--dsw-alias-border-l1,rgba(37,40,44,.12)); --g-panel: var(--dsw-alias-bg-base,#faf9f6); --g-panel-raised: var(--dsw-alias-bg-layer-1,#fff); --g-ink: var(--dsw-alias-label-primary,#252422); --g-muted: var(--dsw-alias-label-secondary,#77736d); --g-focus: var(--dsw-alias-brand-primary,#b94e32); display: grid; gap: 12px; overflow: hidden; border: 1px solid var(--g-border); border-radius: 12px; padding: 13px 14px; background: var(--g-panel-raised); color: var(--g-ink); font-family: ui-sans-serif,sans-serif; }
.dsh-genui-progress-head { display: flex; min-width: 0; align-items: center; gap: 10px; }
.dsh-genui-progress-head > div { display: grid; min-width: 0; gap: 2px; }
.dsh-genui-progress-head strong { overflow: hidden; font-size: 13px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.dsh-genui-progress-head span { color: var(--g-muted); font-size: 11px; }
.dsh-genui-progress-spinner { width: 18px; height: 18px; flex: none; border: 2px solid color-mix(in srgb,var(--g-focus) 22%,transparent); border-top-color: var(--g-focus); border-radius: 50%; animation: dsh-genui-spin 800ms linear infinite; }
.dsh-genui-progress ol { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.dsh-genui-progress li { position: relative; min-width: 0; border-top: 2px solid var(--g-border); padding-top: 7px; color: var(--g-muted); font-size: 10px; line-height: 1.35; }
.dsh-genui-progress li[data-state='active'] { border-top-color: var(--g-focus); color: var(--g-ink); font-weight: 650; }
.dsh-genui-progress li[data-state='done'] { border-top-color: color-mix(in srgb,var(--g-focus) 45%,var(--g-border)); color: var(--g-muted); }
.dsh-genui-progress > p { margin: -2px 0 0; color: var(--g-muted); font-size: 10px; line-height: 1.4; }
@keyframes dsh-genui-spin { to { transform: rotate(360deg); } }
.dsh-genui-card:fullscreen { display: flex; width: 100vw; height: 100dvh; border: 0; border-radius: 0; flex-direction: column; background: var(--g-panel); }
.dsh-genui-card[data-surface='canvas']:fullscreen { inset: 0; width: 100vw; max-width: none; }
.dsh-genui-card:fullscreen .dsh-genui-head { padding-top: max(3px,env(safe-area-inset-top)); padding-right: max(5px,env(safe-area-inset-right)); padding-left: max(7px,env(safe-area-inset-left)); }
.dsh-genui-card:fullscreen .dsh-genui-body { height: auto; min-height: 0; flex: 1; }
.dsh-genui-card:fullscreen .dsh-genui-collapse { display: none; }
@media (prefers-color-scheme: dark) {
  .dsh-genui-card:not([data-genui-theme='light']) { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel: var(--dsw-alias-bg-base,#171717); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-panel-soft: var(--dsw-alias-bg-layer-2,#262624); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#eeeeec) 7.5%,transparent); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); --g-success: var(--dsw-alias-state-success-primary,#67c996); --g-danger: var(--dsw-alias-state-error-primary,#e27b6d); box-shadow: 0 1px 2px rgba(0,0,0,.18),0 8px 28px rgba(0,0,0,.2); }
  .dsh-genui-receipt-shell:not([data-genui-theme='light']) { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#eeeeec) 7.5%,transparent); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); --g-success: var(--dsw-alias-state-success-primary,#67c996); --g-danger: var(--dsw-alias-state-error-primary,#e27b6d); }
  .dsh-genui-progress:not([data-genui-theme='light']) { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel: var(--dsw-alias-bg-base,#171717); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); }
  .dsh-genui-anchor:not([data-genui-theme='light']) .dsh-genui-canvas-placeholder { border-color: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); background: var(--dsw-alias-bg-layer-1,#1d1d1d); color: var(--dsw-alias-label-primary,#eeeeec); }
  .dsh-genui-anchor:not([data-genui-theme='light']) .dsh-genui-canvas-placeholder:hover { background: var(--dsw-alias-bg-layer-2,#262624); }
  .dsh-genui-anchor:not([data-genui-theme='light']) .dsh-genui-canvas-placeholder > svg, .dsh-genui-anchor:not([data-genui-theme='light']) .dsh-genui-canvas-placeholder span { color: var(--dsw-alias-brand-primary,#e17a5f); }
  .dsh-genui-anchor:not([data-genui-theme='light']) .dsh-genui-canvas-placeholder strong { color: var(--dsw-alias-label-primary,#eeeeec); }
}
[data-ds-dark-theme] .dsh-genui-card { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel: var(--dsw-alias-bg-base,#171717); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-panel-soft: var(--dsw-alias-bg-layer-2,#262624); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#eeeeec) 7.5%,transparent); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); --g-success: var(--dsw-alias-state-success-primary,#67c996); --g-danger: var(--dsw-alias-state-error-primary,#e27b6d); box-shadow: 0 1px 2px rgba(0,0,0,.18),0 8px 28px rgba(0,0,0,.2); }
[data-ds-dark-theme] .dsh-genui-receipt-shell { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-hover: color-mix(in srgb,var(--dsw-alias-label-primary,#eeeeec) 7.5%,transparent); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); --g-success: var(--dsw-alias-state-success-primary,#67c996); --g-danger: var(--dsw-alias-state-error-primary,#e27b6d); }
[data-ds-dark-theme] .dsh-genui-progress { --g-border: var(--dsw-alias-border-l1,rgba(255,255,255,.11)); --g-panel: var(--dsw-alias-bg-base,#171717); --g-panel-raised: var(--dsw-alias-bg-layer-1,#1d1d1d); --g-ink: var(--dsw-alias-label-primary,#eeeeec); --g-muted: var(--dsw-alias-label-secondary,#9c9a94); --g-focus: var(--dsw-alias-brand-primary,#e17a5f); }
[data-ds-dark-theme] .dsh-genui-canvas-placeholder { border-color: rgba(255,255,255,.11); background: var(--dsw-alias-bg-layer-1,#1d1d1d); color: var(--dsw-alias-label-primary,#eeeeec); }
[data-ds-dark-theme] .dsh-genui-canvas-placeholder:hover { background: var(--dsw-alias-bg-layer-2,#262624); }
[data-ds-dark-theme] .dsh-genui-canvas-placeholder > svg, [data-ds-dark-theme] .dsh-genui-canvas-placeholder span { color: var(--dsw-alias-brand-primary,#e17a5f); }
[data-ds-dark-theme] .dsh-genui-canvas-placeholder strong { color: var(--dsw-alias-label-primary,#eeeeec); }
@media (prefers-reduced-motion: reduce) { .dsh-genui-card[data-surface='canvas'] { animation: none; } .dsh-genui-progress-spinner { animation: none; } }
@media (max-width: 640px) {
  .dsh-genui-head { min-height: 48px; padding-right: 3px; padding-left: 3px; }
  .dsh-genui-action { width: 44px; height: 44px; }
  .dsh-genui-body { height: min(390px,48dvh); min-height: 240px; }
  .dsh-genui-permission-backdrop { inset: 48px 0 0; align-items: end; padding: 10px max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left)); }
  .dsh-genui-permission { width: 100%; border-radius: 18px; padding: 16px; }
  .dsh-genui-access { width: 100%; border-radius: 18px; padding: 16px; }
  .dsh-genui-access-row { align-items: stretch; flex-direction: column; }
  .dsh-genui-access-row .dsh-genui-button { min-height: 40px; }
  .dsh-genui-permission-actions .dsh-genui-button { min-height: 42px; flex: 1; }
}
@container (max-width: 420px) {
  .dsh-genui-card[data-surface='inline'] .dsh-genui-fullscreen { display: none; }
  .dsh-genui-canvas-action { width: auto; gap: 6px; padding: 0 10px; border-radius: 9px; background: var(--g-ink); color: var(--g-panel-raised); }
  .dsh-genui-canvas-action:hover { background: color-mix(in srgb,var(--g-ink) 88%,transparent); color: var(--g-panel-raised); }
  .dsh-genui-open-label { display: inline; }
  .dsh-genui-receipt { align-items: flex-start; flex-wrap: wrap; padding: 8px; }
  .dsh-genui-receipt span { flex-basis: calc(100% - 28px); white-space: normal; }
  .dsh-genui-receipt button { min-height: 40px; margin-left: 22px; }
}
`
