import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import { parseFile } from 'music-metadata'
import NodeID3 from 'node-id3'
import { parseByteRange, resolveSafePath, sanitizeSyncState, resolveServerHost } from './lib/utils.js'

const app = express()
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const SYNC_FILE = path.join(SERVER_DIR, 'resonance-sync.json')
const BACKUP_DIR = path.join(SERVER_DIR, 'backups')
const emptySync = { version: 1, favorites: [], playlists: [], history: [], queue: [], preferences: null, equalizer: null, updatedAt: null }
async function readSync() { try { return sanitizeSyncState(JSON.parse(await fs.readFile(SYNC_FILE, 'utf8'))) } catch { return { ...emptySync } } }
async function writeSync(value) { const safe = { ...sanitizeSyncState(value), updatedAt: new Date().toISOString() }; await fs.mkdir(SERVER_DIR, { recursive: true }); await fs.writeFile(SYNC_FILE, JSON.stringify(safe, null, 2), 'utf8'); return safe }

const PORT = Number(process.env.PORT || 4317)
const requestedHost = process.env.HOST
const HOST = resolveServerHost(requestedHost)
if (requestedHost && requestedHost !== HOST) console.warn('Ignoring non-loopback HOST setting. The music API is restricted to 127.0.0.1 and is accessed remotely through the Vite/Tailscale proxy.')
const MUSIC_ROOT = path.resolve(process.env.MUSIC_ROOT || 'C:\\Users\\makhm\\Music')
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim())
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff'])
let tracks = []
let lastScan = null
let scanPromise = null

app.use(cors({ origin(origin, callback) {
  const isPrivateLan = origin && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)
  const isTailscale = origin && /^https:\/\/[a-z0-9-]+\.ts\.net$/.test(origin)
  if (!origin || allowedOrigins.includes(origin) || isPrivateLan || isTailscale) return callback(null, true)
  return callback(new Error('Origin is not allowed by CORS'))
} }))
app.use(express.json({ limit: '12mb' }))

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const found = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await walk(fullPath))
    else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(fullPath)
  }
  return found
}

async function scanLibrary() {
  if (scanPromise) return scanPromise
  const currentScan = (async () => {
    await fs.access(MUSIC_ROOT)
    const files = await walk(MUSIC_ROOT)
    const next = []
    for (const filePath of files) {
      try {
        const [metadata, stat] = await Promise.all([parseFile(filePath, { duration: true }), fs.stat(filePath)])
        const common = metadata.common
        const relativePath = path.relative(MUSIC_ROOT, filePath)
        next.push({
          id: crypto.createHash('sha1').update(relativePath.toLowerCase()).digest('hex'),
          title: common.title || path.basename(filePath, path.extname(filePath)),
          artist: common.artist || common.albumartist || 'Неизвестный исполнитель',
          album: common.album || 'Без альбома',
          albumArtist: common.albumartist || common.artist || 'Неизвестный исполнитель',
          track: common.track?.no || null, year: common.year || null, genre: common.genre?.[0] || null,
          duration: metadata.format.duration || 0, format: path.extname(filePath).slice(1).toUpperCase(),
          size: stat.size, relativePath, hasEmbeddedPicture: Boolean(common.picture?.length),
        })
      } catch (error) { console.warn('Metadata skipped:', filePath, error.message) }
    }
    tracks = next.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.track || 0) - (b.track || 0))
    lastScan = new Date().toISOString()
    return tracks
  })()
  scanPromise = currentScan
  try { return await currentScan }
  finally { if (scanPromise === currentScan) scanPromise = null }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Resonance Music Server', version: '0.2.0', root: MUSIC_ROOT, lastScan, trackCount: tracks.length }))
app.get('/api/library', (_req, res) => res.json({ tracks, lastScan, root: MUSIC_ROOT }))
app.get('/api/cover/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  let absolutePath
  try { absolutePath = resolveSafePath(MUSIC_ROOT, track.relativePath) } catch { return res.sendStatus(400) }
  try {
    const metadata = await parseFile(absolutePath, { duration: false })
    const picture = metadata.common.picture?.[0]
    if (!picture?.data?.length) return res.sendStatus(404)
    res.setHeader('Content-Type', picture.format || 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.end(picture.data)
  } catch { res.sendStatus(404) }
})
app.get('/api/lyrics/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  let audioPath
  try { audioPath = resolveSafePath(MUSIC_ROOT, track.relativePath) } catch { return res.sendStatus(400) }
  const stem = audioPath.slice(0, audioPath.length - path.extname(audioPath).length)
  for (const ext of ['.lrc', '.txt']) {
    try {
      const content = await fs.readFile(stem + ext, 'utf8')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'private, max-age=300')
      return res.send(content)
    } catch (error) { if (error.code !== 'ENOENT') return res.sendStatus(500) }
  }
  return res.sendStatus(404)
})
function safeTrackPath(track) {
  return resolveSafePath(MUSIC_ROOT, track.relativePath)
}
function writeId3(tags, filePath) {
  return new Promise((resolve, reject) => NodeID3.write(tags, filePath, error => error ? reject(error) : resolve(true)))
}
app.get('/api/metadata/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  if (path.extname(track.relativePath).toLowerCase() !== '.mp3') return res.status(415).json({ error: 'Запись тегов пока поддерживается только для MP3. Другие форматы доступны только для чтения.' })
  try {
    const metadata = await parseFile(safeTrackPath(track), { duration: false })
    const picture = metadata.common.picture?.[0]
    res.json({ id: track.id, title: metadata.common.title || track.title, artist: metadata.common.artist || track.artist, album: metadata.common.album || track.album, genre: metadata.common.genre?.[0] || '', year: metadata.common.year || '', trackNumber: metadata.common.track?.no || '', hasCover: Boolean(picture?.data?.length), coverMime: picture?.format || null, writable: true })
  } catch (error) { res.status(500).json({ error: error.message }) }
})
app.put('/api/metadata/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  if (path.extname(track.relativePath).toLowerCase() !== '.mp3') return res.status(415).json({ error: 'Запись тегов пока поддерживается только для MP3.' })
  const tags = {}
  for (const key of ['title', 'artist', 'album', 'genre']) { if (req.body[key] !== undefined) { if (typeof req.body[key] !== 'string' || req.body[key].length > 500) return res.status(400).json({ error: 'Некорректное поле: ' + key }); tags[key] = req.body[key].trim() } }
  if (req.body.year !== undefined && req.body.year !== '') { const year = Number(req.body.year); if (!Number.isInteger(year) || year < 1000 || year > 9999) return res.status(400).json({ error: 'Некорректный год.' }); tags.year = String(year) }
  if (req.body.trackNumber !== undefined && req.body.trackNumber !== '') { const n = Number(req.body.trackNumber); if (!Number.isInteger(n) || n < 1 || n > 9999) return res.status(400).json({ error: 'Некорректный номер дорожки.' }); tags.trackNumber = String(n) }
  if (req.body.coverData) {
    const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(req.body.coverData)
    if (!match) return res.status(400).json({ error: 'Обложка должна быть JPG или PNG.' })
    const imageBuffer = Buffer.from(match[2], 'base64')
    if (imageBuffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Обложка слишком большая (максимум 8 МБ).' })
    tags.image = { mime: match[1] === 'jpeg' ? 'image/jpeg' : 'image/png', type: { id: 3, name: 'front cover' }, description: 'Cover', imageBuffer }
  }
  try {
    const filePath = safeTrackPath(track); await fs.mkdir(BACKUP_DIR, { recursive: true })
    await fs.copyFile(filePath, path.join(BACKUP_DIR, track.id + '-' + Date.now() + '.mp3'))
    const ok = await writeId3(tags, filePath); if (!ok) throw new Error('Не удалось записать ID3-теги.')
    await scanLibrary(); res.json({ ok: true, track: tracks.find(item => item.id === track.id), backupAvailable: true })
  } catch (error) { res.status(500).json({ error: error.message || 'Ошибка записи метаданных' }) }
})
app.post('/api/metadata/:id/restore', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  if (path.extname(track.relativePath).toLowerCase() !== '.mp3') return res.status(415).json({ error: 'Восстановление доступно только для MP3.' })
  try { const names = (await fs.readdir(BACKUP_DIR)).filter(name => name.startsWith(track.id + '-') && name.endsWith('.mp3')).sort().reverse(); if (!names.length) return res.status(404).json({ error: 'Резервная копия не найдена.' }); await fs.copyFile(path.join(BACKUP_DIR, names[0]), safeTrackPath(track)); await scanLibrary(); res.json({ ok: true, track: tracks.find(item => item.id === track.id) }) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/backups', async (_req, res) => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true })
    const backups = []
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{40}-\d+\.mp3$/.test(entry.name)) continue
      const stat = await fs.stat(path.join(BACKUP_DIR, entry.name))
      backups.push({ id: entry.name.slice(0, -4), trackId: entry.name.split('-')[0], createdAt: new Date(stat.mtimeMs).toISOString(), size: stat.size })
    }
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    res.json({ backups })
  } catch (error) { res.status(500).json({ error: error.message }) }
})
app.post('/api/backups/:id/restore', async (req, res) => {
  if (!/^[a-f0-9]{40}-\d+$/.test(req.params.id)) return res.sendStatus(400)
  const [trackId] = req.params.id.split('-')
  const track = tracks.find(item => item.id === trackId)
  if (!track || path.extname(track.relativePath).toLowerCase() !== '.mp3') return res.sendStatus(404)
  try {
    const backupPath = path.join(BACKUP_DIR, req.params.id + '.mp3')
    await fs.access(backupPath)
    await fs.copyFile(backupPath, safeTrackPath(track))
    await scanLibrary()
    res.json({ ok: true, track: tracks.find(item => item.id === track.id) })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/sync', async (_req, res) => res.json(await readSync()))
app.put('/api/sync', async (req, res) => { try { res.json(await writeSync(req.body || {})) } catch (error) { res.status(500).json({ error: error.message }) } })
app.post('/api/library/scan', async (_req, res) => {
  try { const result = await scanLibrary(); res.json({ ok: true, count: result.length, lastScan }) }
  catch (error) { res.status(500).json({ ok: false, error: error.message, root: MUSIC_ROOT }) }
})
app.get('/api/stream/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.status(404).json({ error: 'Track not found. Scan the library first.' })
  let absolutePath
  try { absolutePath = resolveSafePath(MUSIC_ROOT, track.relativePath) } catch { return res.status(400).json({ error: 'Invalid path' }) }
  try {
    const stat = await fs.stat(absolutePath)
    const ext = path.extname(absolutePath).toLowerCase()
    const mime = ({ '.mp3':'audio/mpeg', '.flac':'audio/flac', '.m4a':'audio/mp4', '.aac':'audio/aac', '.ogg':'audio/ogg', '.opus':'audio/ogg', '.wav':'audio/wav', '.wma':'audio/x-ms-wma', '.aiff':'audio/aiff' })[ext] || 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const range = req.headers.range
    if (range) {
      const parsed = parseByteRange(range, stat.size)
      if (!parsed) return res.status(416).set('Content-Range', 'bytes */' + stat.size).end()
      const { start, end } = parsed
      res.status(206).set({ 'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size, 'Content-Length': end - start + 1 })
      return createReadStream(absolutePath, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', stat.size)
    createReadStream(absolutePath).pipe(res)
  } catch { if (!res.headersSent) res.sendStatus(404); else res.destroy() }
})

app.listen(PORT, HOST, async () => {
  console.log('Resonance Music Server listening on http://' + HOST + ':' + PORT)
  console.log('API network exposure: local machine only (Vite/Tailscale proxy)')
  console.log('Music folder: ' + MUSIC_ROOT)
  try { await scanLibrary(); console.log('Indexed ' + tracks.length + ' audio files') }
  catch (error) { console.warn('Initial library scan failed:', error.message) }
})
