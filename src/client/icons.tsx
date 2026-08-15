export type ShellIconName =
  | 'check' | 'chevron-down' | 'chevron-up' | 'maximize' | 'minimize'
  | 'refresh' | 'panel-right' | 'panel-right-close' | 'shield'

// This small Lucide-compatible path subset keeps the Harness client bundle self-contained.
const paths: Record<ShellIconName, string[]> = {
  check: ['M20 6 9 17l-5-5'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  maximize: ['M15 3h6v6', 'm14 10 7-7', 'M9 21H3v-6', 'm3 21 7-7'],
  minimize: ['M4 14h6v6', 'm3 21 7-7', 'M20 10h-6V4', 'm14 10 7-7'],
  'panel-right': ['M3 4h18v16H3z', 'M15 4v16'],
  'panel-right-close': ['M3 4h18v16H3z', 'M15 4v16', 'm11 9-3 3 3 3'],
  refresh: ['M21 12a9 9 0 0 0-15.56-6.16L3 8', 'M3 3v5h5', 'M3 12a9 9 0 0 0 15.56 6.16L21 16', 'M16 16h5v5'],
  shield: ['M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z'],
}

export function ShellIcon({ name }: { name: ShellIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name].map(path => <path key={path} d={path} />)}
    </svg>
  )
}
