import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import { parseFile } from 'music-metadata'

const app = express()
const PORT = Number(process.env.PORT || 4317)
const HOST = process.env.HOST || '0.0.0.0'
const MUSIC_ROOT = path.resolve(process.env.MUSIC_ROOT || 'C:\\Users\\makhm\\Music')
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim())
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff'])
let tracks = []
let lastScan = null
let scanning = false

app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
  return callback(new Error('Origin is not allowed by CORS'))
} }))
app.use(express.json({ limit: '1mb' }))

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
  if (scanning) return tracks
  scanning = true
  try {
    await fs.access(MUSIC_ROOT)
    const files = await walk(MUSIC_ROOT)
    const next = []
    for (const filePath of files) {
      try {
        const [metadata, stat] = await Promise.all([
          parseFile(filePath, { duration: true }),
          fs.stat(filePath),
        ])
        const common = metadata.common
        const relativePath = path.relative(MUSIC_ROOT, filePath)
        next.push({
          id: crypto.createHash('sha1').update(relativePath.toLowerCase()).digest('hex'),
          title: common.title || path.basename(filePath, path.extname(filePath)),
          artist: common.artist || common.albumartist || 'Неизвестный исполнитель',
          album: common.album || 'Без альбома',
          albumArtist: common.albumartist || common.artist || 'Неизвестный исполнитель',
          track: common.track?.no || null,
          year: common.year || null,
          genre: common.genre?.[0] || null,
          duration: metadata.format.duration || 0,
          format: path.extname(filePath).slice(1).toUpperCase(),
          size: stat.size,
          relativePath,
          hasEmbeddedPicture: Boolean(common.picture?.length),
        })
      } catch (error) {
        console.warn('Metadata skipped:', filePath, error.message)
      }
    }
    tracks = next.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || (a.track || 0) - (b.track || 0))
    lastScan = new Date().toISOString()
    return tracks
  } finally { scanning = false }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Resonance Music Server', version: '0.1.0', root: MUSIC_ROOT, lastScan, trackCount: tracks.length }))
app.get('/api/library', (_req, res) => res.json({ tracks, lastScan, root: MUSIC_ROOT }))
app.post('/api/library/scan', async (_req, res) => {
  try { const result = await scanLibrary(); res.json({ ok: true, count: result.length, lastScan }) }
  catch (error) { res.status(500).json({ ok: false, error: error.message, root: MUSIC_ROOT }) }
})
app.get('/api/stream/:id', (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.status(404).json({ error: 'Track not found. Scan the library first.' })
  const absolutePath = path.resolve(MUSIC_ROOT, track.relativePath)
  if (!absolutePath.startsWith(MUSIC_ROOT + path.sep)) return res.status(400).json({ error: 'Invalid path' })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')
  const stream = createReadStream(absolutePath)
  stream.on('error', () => { if (!res.headersSent) res.sendStatus(404); else res.destroy() })
  stream.pipe(res)
})

app.listen(PORT, HOST, async () => {
  console.log(`Resonance Music Server listening on http://${HOST}:${PORT}`)
  console.log(`Music folder: ${MUSIC_ROOT}`)
  try { await scanLibrary(); console.log(`Indexed ${tracks.length} audio files`) }
  catch (error) { console.warn('Initial library scan failed:', error.message) }
})
