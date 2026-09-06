# DeepSeek Harness GenUI v0.14.1

This patch fixes plugin-market installation failing with `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.25.12` ([issue #10](https://github.com/pengyue-polaron/deepseek-harness-genui/issues/10)).

## Changes

- Use `esbuild-wasm` for runtime React/TypeScript compilation. The production dependency tree no longer includes native esbuild, so installing the plugin does not require `--allow-build=esbuild`.
- Keep native esbuild as development-only tooling for repository tests.
- Verify installation without compiler build approval, compile a React app with the installed WASM package, and reject native esbuild in the production dependency tree.
- Update the bilingual installation instructions and committed runtime bundle.

## Install or upgrade

```sh
dsh plugin --profile web add dsh-plugin-genui@0.14.1 --save-exact
dsh --profile web
```

Use Node.js `^22.19.0 || ^24.0.0` and a supported DeepSeek Harness Web profile. The supported Harness range remains 0.1.0-rc.6 through rc.8 and 0.1.1-rc.1 through rc.2. Inline, Canvas, fullscreen, and localhost remain supported; TUI/headless profiles remain unsupported.

## Validation and limitations

Local validation on macOS with Node.js 24 passed type checking, 142 tests (one opt-in network scenario skipped), bundle budgets, packaging, clean Web-profile installation/removal, installed-package React compilation, and the existing v0.13.2 upgrade regression. The release workflow additionally requires the full CI compatibility matrix, production dependency audit, and the opt-in live HTTPS scenario before publication.

WebAssembly compilation can be slower than the native compiler. Plugin users still do not need Chrome or Chromium. Windows has not been tested on a real machine for this patch; the reported failure is addressed by removing the dependency that requires the blocked install script.

See the [v0.14.0 release notes](release-notes-v0.14.0.md) for the existing runtime behavior and security limitations.
