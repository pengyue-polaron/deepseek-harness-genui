// Pin the tested host's transitive packages too: prerelease caret ranges can
// otherwise combine an old direct dependency with a newer, incompatible peer.
export async function pinnedHostOverrides(version, seeds) {
  const isHostPackage = name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
  const overrides = {}
  let pending = seeds.filter(isHostPackage)
  // Removed in modern hosts; fixtures may retain it for legacy client types.
  const visited = new Set(['@deepseek-ai/dsh-client-runtime'])
  while (pending.length > 0) {
    const batch = [...new Set(pending.splice(0, 8))].filter(name => !visited.has(name))
    batch.forEach(name => visited.add(name))
    const packages = await Promise.all(batch.map(async name => {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`Cannot resolve ${name}@${version}: HTTP ${response.status}`)
      overrides[name] = version
      return response.json()
    }))
    for (const pkg of packages) {
      pending.push(...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })
        .filter(name => isHostPackage(name) && !visited.has(name)))
    }
    pending = [...new Set(pending)]
  }
  return overrides
}
