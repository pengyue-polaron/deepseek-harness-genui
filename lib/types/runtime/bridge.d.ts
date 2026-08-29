export declare const ARTIFACT_BRIDGE_VERSION = 1;
export declare const ARTIFACT_BRIDGE_TOKEN = "bridge-v1";
/**
 * Runs before every generated bundle. The bootstrap owns the only MessagePort,
 * replaces legacy SDK fetches, and does not start app.js until the trusted host
 * has accepted the channel and the preview document has completed its first load.
 */
export declare const BRIDGE_RUNTIME: string;
//# sourceMappingURL=bridge.d.ts.map