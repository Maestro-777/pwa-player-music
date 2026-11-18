import path from 'node:path'

export function resolveSafePath(root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, resolvedPath)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Invalid path outside music root')
  }
  return resolvedPath
}

export function parseByteRange(header, size) {
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null
  let start
  let end
  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null
    end = Math.min(end, size - 1)
  }
  if (start < 0 || start >= size || start > end) return null
  return { start, end }
}

export function sanitizeSyncState(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const strings = (items, limit) => Array.isArray(items)
    ? [...new Set(items.filter(item => typeof item === 'string' && item.length <= 256))].slice(0, limit)
    : []
  const playlists = Array.isArray(input.playlists)
    ? input.playlists.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.trackIds))
      .slice(0, 500)
      .map(item => ({ id: item.id.slice(0, 128), name: item.name.trim().slice(0, 120), trackIds: strings(item.trackIds, 5000) }))
      .filter(item => item.name.length > 0)
    : []
  return {
    version: 1,
    favorites: strings(input.favorites, 10000),
    playlists,
    history: strings(input.history, 500),
    queue: strings(input.queue, 5000),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  }
}
