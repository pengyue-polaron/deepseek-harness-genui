# Security

Report vulnerabilities through GitHub private vulnerability reporting. Do not include credentials, private prompts, or exploit details in a public issue.

## Trust boundary

Generated app code runs in an opaque-origin iframe with a restrictive Content Security Policy. A trusted bootstrap creates a private, one-document message channel before the generated bundle starts. The real task capability token stays in the trusted Harness shell or standalone parent and is never placed in the generated iframe URL, DOM, global bridge object, or bridge messages. The iframe receives only the fixed, non-authorizing compatibility marker `bridge-v1`.

The parent accepts only state reads/writes, declared tool calls, and declared credential-free public HTTPS calls. It supplies the artifact, version, endpoint, and real capability itself; generated code cannot choose them. Permission changes, version quarantine, and other host controls remain parent-only. Navigation closes the document channel, and late responses are not delivered to the replacement document.

Generated apps declare every connected tool or public HTTPS route they use. The user approves access before first use and can remove it from the app card. Temporary links expire after 7 days; inactive task data and grants are removed on the same schedule.

## Important limit

The sandbox and broker protect host credentials and prevent an unapproved or navigated document from acquiring host capabilities. They do not make deliberately malicious JavaScript safe to trust with data that the user has already authorized it to read. For example, code could encode an authorized tool result or saved task value into a later navigation URL. Source-contract checks and CSP are defense in depth, not a proof that arbitrary obfuscated code cannot disclose data it legitimately received.

Do not place secrets in generated-app state or grant an app access to data you would not allow that app to display. Reports about sandbox escape, token or credential exposure, permission bypass, cross-task state access, stale-document access, or unrestricted network access receive priority.
