//#region src/invariant.ts
const PACKAGE_NAME = "dsh-plugin-genui";
const name = "genui-invariant";
const inject = ["invariants"];
const install = () => {};
function apply(ctx) {
	const registry = ctx.get("invariants");
	if (registry === void 0) throw new Error(`invariant companion requires the invariants service for ${PACKAGE_NAME}`);
	return Promise.resolve(registry.register(PACKAGE_NAME, install));
}

//#endregion
export { apply, inject, name };