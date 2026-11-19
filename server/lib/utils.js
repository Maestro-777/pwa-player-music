import path from 'node:path'

export function resolveServerHost(requestedHost) {
  return requestedHost === '127.0.0.1' ? requestedHost : '127.0.0.1'
}

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

export function mergeSyncStates(previous = {}, incoming = {}) {
  const left = sanitizeSyncState(previous)
  const right = sanitizeSyncState(incoming)
  const mergeStrings = (a, b, limit) => [...new Set([...a, ...b])].slice(-limit)
  const playlistMap = new Map(left.playlists.map(item => [item.id, item]))
  for (const item of right.playlists) {
    const old = playlistMap.get(item.id)
    playlistMap.set(item.id, old
      ? { ...old, ...item, trackIds: mergeStrings(old.trackIds, item.trackIds, 5000) }
      : item)
  }
  return {
    version: 1,
    favorites: mergeStrings(left.favorites, right.favorites, 10000),
    playlists: [...playlistMap.values()].slice(-500),
    history: mergeStrings(right.history, left.history, 500),
    queue: mergeStrings(left.queue, right.queue, 5000),
    playback: (() => { const a = left.playback, b = right.playback; if (!a) return b; if (!b) return a; return Date.parse(b.updatedAt || '') >= Date.parse(a.updatedAt || '') ? b : a })(),
    preferences: right.preferences || left.preferences,
    equalizer: right.equalizer || left.equalizer,
    updatedAt: new Date().toISOString(),
  }
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
  const sourcePlayback = input.playback && typeof input.playback === 'object' && !Array.isArray(input.playback) ? input.playback : null
  const playback = sourcePlayback && typeof sourcePlayback.trackId === 'string' && sourcePlayback.trackId.length <= 256 && Number.isFinite(sourcePlayback.position) && sourcePlayback.position >= 0
    ? { trackId: sourcePlayback.trackId, position: Math.min(sourcePlayback.position, 86400), updatedAt: typeof sourcePlayback.updatedAt === 'string' ? sourcePlayback.updatedAt : null }
    : null
  const sourcePrefs = input.preferences && typeof input.preferences === 'object' && !Array.isArray(input.preferences) ? input.preferences : {}
  const preferences = {}
  if (['dark', 'light', 'system'].includes(sourcePrefs.theme)) preferences.theme = sourcePrefs.theme
  if (['violet', 'blue', 'mint', 'rose', 'amber'].includes(sourcePrefs.accent)) preferences.accent = sourcePrefs.accent
  for (const key of ['compact', 'sidebar', 'visualizer', 'floatingPlayer']) if (typeof sourcePrefs[key] === 'boolean') preferences[key] = sourcePrefs[key]
  if (['solid', 'gradient', 'glass'].includes(sourcePrefs.background)) preferences.background = sourcePrefs.background
  for (const [key, min, max] of [['radius', 4, 28], ['fontScale', 85, 120], ['blur', 0, 30]]) {
    const value = Number(sourcePrefs[key])
    if (Number.isFinite(value)) preferences[key] = Math.min(max, Math.max(min, value))
  }
  const sourceEq = input.equalizer && typeof input.equalizer === 'object' && !Array.isArray(input.equalizer) ? input.equalizer : {}
  const sourceBands = sourceEq.eq && typeof sourceEq.eq === 'object' ? sourceEq.eq : {}
  const eq = {}
  const bandKeys = ['32', '64', '125', '250', '500', '1000', '2000', '4000', '8000', '16000']
  const clampBand = value => Number.isFinite(value) ? Math.min(12, Math.max(-12, value)) : 0
  if (bandKeys.some(key => typeof sourceBands[key] === 'number')) {
    for (const key of bandKeys) eq[key] = clampBand(sourceBands[key])
  } else {
    const bass = clampBand(sourceBands.bass), mid = clampBand(sourceBands.mid), treble = clampBand(sourceBands.treble)
    Object.assign(eq, { '32': bass, '64': bass, '125': bass, '250': mid, '500': mid, '1000': mid, '2000': mid, '4000': treble, '8000': treble, '16000': treble })
  }
  const equalizer = Object.keys(eq).length ? { eq, eqPreset: typeof sourceEq.eqPreset === 'string' ? sourceEq.eqPreset.slice(0, 40) : 'Пользовательский' } : null
  return {
    version: 1,
    favorites: strings(input.favorites, 10000),
    playlists,
    history: strings(input.history, 500),
    queue: strings(input.queue, 5000),
    playback,
    preferences: Object.keys(preferences).length ? preferences : null,
    equalizer,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  }
}

const AUDIO_UPLOAD_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff'])
export function sanitizeUploadFilename(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Empty upload filename')
  const leaf = input.replace(/\\/g, '/').split('/').pop().normalize('NFKC').trim()
  const extension = path.extname(leaf).toLowerCase()
  if (!AUDIO_UPLOAD_EXTENSIONS.has(extension)) throw new Error('Unsupported audio file extension')
  const rawStem = leaf.slice(0, leaf.length - path.extname(leaf).length)
  const stem = rawStem.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/g, '').trim().slice(0, 120) || 'audio'
  return stem + extension
}

export function parseReplayGainDb(value) {
  if (value === null || value === undefined) return null
  const match = String(value).match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? Math.max(-12, Math.min(6, parsed)) : null
}
