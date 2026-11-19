import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createReadStream } from 'node:fs'
import { parseFile } from 'music-metadata'
import NodeID3 from 'node-id3'
import { parseByteRange, resolveSafePath, sanitizeSyncState, mergeSyncStates, parseReplayGainDb, resolveServerHost, sanitizeUploadFilename } from './lib/utils.js'

const app = express()
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const SYNC_FILE = path.join(SERVER_DIR, 'resonance-sync.json')
const BACKUP_DIR = path.join(SERVER_DIR, 'backups')
const emptySync = { version: 1, favorites: [], playlists: [], history: [], queue: [], playback: null, preferences: null, equalizer: null, updatedAt: null }
async function readSync() { try { return sanitizeSyncState(JSON.parse(await fs.readFile(SYNC_FILE, 'utf8'))) } catch { return { ...emptySync } } }
let syncWriteQueue = Promise.resolve()
function writeSync(value) {
  const task = syncWriteQueue.then(async () => {
    const safe = mergeSyncStates(await readSync(), value)
    await fs.mkdir(SERVER_DIR, { recursive: true })
    const temp = SYNC_FILE + '.tmp'
    await fs.writeFile(temp, JSON.stringify(safe, null, 2), 'utf8')
    await fs.rename(temp, SYNC_FILE).catch(async error => { await fs.rm(SYNC_FILE, { force: true }); await fs.rename(temp, SYNC_FILE); if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error })
    return safe
  })
  syncWriteQueue = task.catch(() => {})
  return task
}

const PORT = Number(process.env.PORT || 4317)
const requestedHost = process.env.HOST
const HOST = resolveServerHost(requestedHost)
if (requestedHost && requestedHost !== HOST) console.warn('Ignoring non-loopback HOST setting. The music API is restricted to 127.0.0.1 and is accessed remotely through the Vite/Tailscale proxy.')
const MUSIC_ROOT = path.resolve(process.env.MUSIC_ROOT || 'C:\\Users\\makhm\\Music')
const UPLOAD_DIR = path.join(MUSIC_ROOT, 'Resonance Uploads')
const API_ACCESS_KEY = (process.env.RESONANCE_ACCESS_KEY || '').trim()
const authFailures = new Map()
const AUTH_WINDOW_MS = 15 * 60 * 1000
const AUTH_FAILURE_LIMIT = 8
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim())
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.aiff'])
let tracks = []
let lastScan = null
let scanPromise = null

app.use(cors({ credentials: true, origin(origin, callback) {
  const isPrivateLan = origin && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)
  const isTailscale = origin && /^https:\/\/[a-z0-9-]+\.ts\.net$/.test(origin)
  if (!origin || allowedOrigins.includes(origin) || isPrivateLan || isTailscale) return callback(null, true)
  return callback(new Error('Origin is not allowed by CORS'))
} }))
app.use(express.json({ limit: '12mb' }))
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}
function sessionCookie(req) {
  const item = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('resonance_session='))
  if (!item) return ''
  try { return decodeURIComponent(item.slice('resonance_session='.length)) } catch { return '' }
}
function authFailureKey(req) { return req.get('cf-connecting-ip') || req.ip || req.socket.remoteAddress || 'unknown' }
app.post('/api/auth/session', (req, res) => {
  if (!API_ACCESS_KEY) return res.status(503).json({ error: 'Ключ доступа не настроен. Перезапусти 2-ЗАПУСТИТЬ.bat.' })
  const ip = authFailureKey(req), now = Date.now(), previous = authFailures.get(ip)
  if (previous && now - previous.since < AUTH_WINDOW_MS && previous.count >= AUTH_FAILURE_LIMIT) return res.status(429).json({ error: 'Слишком много неверных попыток. Попробуй позже.' })
  if (!safeEqual(req.get('x-resonance-key'), API_ACCESS_KEY)) {
    const current = previous && now - previous.since < AUTH_WINDOW_MS ? previous : { since: now, count: 0 }
    current.count += 1; authFailures.set(ip, current)
    return res.status(401).json({ error: 'Ключ доступа неверный.' })
  }
  authFailures.delete(ip)
  const secure = req.secure || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https'
  res.setHeader('Set-Cookie', 'resonance_session=' + encodeURIComponent(API_ACCESS_KEY) + '; HttpOnly; Path=/api; SameSite=Strict; Max-Age=28800' + (secure ? '; Secure' : ''))
  res.setHeader('Cache-Control', 'no-store')
  res.json({ ok: true, expiresIn: 28800 })
})
app.use('/api', (req, res, next) => {
  if (req.path === '/health' && req.method === 'GET') return next()
  if (req.path === '/auth/session' && req.method === 'POST') return next()
  if (!API_ACCESS_KEY) return res.status(503).json({ error: 'Ключ доступа сервера не настроен.' })
  const ip = authFailureKey(req), now = Date.now(), previous = authFailures.get(ip)
  if (previous && now - previous.since < AUTH_WINDOW_MS && previous.count >= AUTH_FAILURE_LIMIT) return res.status(429).json({ error: 'Слишком много неверных попыток. Попробуй позже.' })
  if (safeEqual(req.get('x-resonance-key'), API_ACCESS_KEY) || safeEqual(sessionCookie(req), API_ACCESS_KEY)) { authFailures.delete(ip); if (safeEqual(req.get('x-resonance-key'), API_ACCESS_KEY)) { const secure = req.secure || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https'; res.setHeader('Set-Cookie', 'resonance_session=' + encodeURIComponent(API_ACCESS_KEY) + '; HttpOnly; Path=/api; SameSite=Strict; Max-Age=28800' + (secure ? '; Secure' : '')) } return next() }
  const current = previous && now - previous.since < AUTH_WINDOW_MS ? previous : { since: now, count: 0 }
  current.count += 1; authFailures.set(ip, current)
  return res.status(401).json({ error: 'Нужен ключ доступа Resonance. Введи его в окне подключения.' })
})

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
          replayGainDb: parseReplayGainDb(common.replaygain_track_gain ?? common.replayGainTrackGain),
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

app.get('/api/health', (_req, res) => res.setHeader('Cache-Control', 'no-store').json({ ok: true, name: 'Resonance Music Server', version: '0.3.0', requiresKey: Boolean(API_ACCESS_KEY), lastScan, trackCount: tracks.length }))
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
async function createTrackBackup(track, keep = 10) {
  const extension = path.extname(track.relativePath).toLowerCase()
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const id = track.id + '-' + Date.now() + extension
  await fs.copyFile(safeTrackPath(track), path.join(BACKUP_DIR, id))
  const names = (await fs.readdir(BACKUP_DIR)).filter(name => name.startsWith(track.id + '-') && name.endsWith(extension)).sort().reverse()
  await Promise.all(names.slice(keep).map(name => fs.rm(path.join(BACKUP_DIR, name), { force: true })))
  return id
}
function writeId3(tags, filePath) {
  return new Promise((resolve, reject) => NodeID3.write(tags, filePath, error => error ? reject(error) : resolve(true)))
}
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFMPEG_FORMATS = new Set(['.flac', '.m4a', '.ogg', '.opus'])
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    child.once('error', error => reject(new Error('Для записи тегов FLAC/M4A/OGG нужен FFmpeg. Установи FFmpeg и добавь его в PATH или укажи FFMPEG_PATH. ' + error.message)))
    child.once('close', code => code === 0 ? resolve(true) : reject(new Error('FFmpeg не смог записать метаданные: ' + stderr.slice(-1200))))
  })
}
async function writeContainerTags(filePath, tags, coverData) {
  const extension = path.extname(filePath).toLowerCase()
  if (!FFMPEG_FORMATS.has(extension)) throw new Error('Запись тегов этого формата пока не поддерживается.')
  const stem = filePath.slice(0, -extension.length)
  const tempPath = stem + '.resonance-tmp' + extension
  const coverPath = stem + '.resonance-cover.tmp'
  const originalPath = stem + '.resonance-original' + extension
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', filePath]
  try {
    if (coverData) {
      const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(coverData)
      if (!match) throw new Error('Обложка должна быть JPG или PNG.')
      const bytes = Buffer.from(match[2], 'base64')
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Обложка должна быть не больше 8 МБ.')
      await fs.writeFile(coverPath, bytes)
      args.push('-i', coverPath)
    }
    args.push('-map', '0', ...(coverData ? ['-map', '1:v:0'] : []), '-c', 'copy')
    for (const [key, value] of Object.entries({ title: tags.title, artist: tags.artist, album: tags.album, genre: tags.genre, date: tags.year, track: tags.trackNumber })) {
      if (value !== undefined && value !== '') args.push('-metadata', key + '=' + String(value))
    }
    if (coverData) args.push('-disposition:v:0', 'attached_pic')
    args.push(tempPath)
    await runFfmpeg(args)
    await fs.rename(filePath, originalPath)
    try { await fs.rename(tempPath, filePath) } catch (error) { await fs.rename(originalPath, filePath).catch(() => {}); throw error }
    await fs.rm(originalPath, { force: true })
    return true
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {})
    await fs.rm(originalPath, { force: true }).catch(() => {})
    await fs.rm(coverPath, { force: true }).catch(() => {})
  }
}
app.get('/api/metadata/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  const extension = path.extname(track.relativePath).toLowerCase()
  if (extension !== '.mp3' && !FFMPEG_FORMATS.has(extension)) return res.status(415).json({ error: 'Редактирование доступно для MP3, FLAC, M4A, OGG и OPUS. Для этих форматов требуется FFmpeg.' })
  try {
    const metadata = await parseFile(safeTrackPath(track), { duration: false })
    const picture = metadata.common.picture?.[0]
    res.json({ id: track.id, title: metadata.common.title || track.title, artist: metadata.common.artist || track.artist, album: metadata.common.album || track.album, genre: metadata.common.genre?.[0] || '', year: metadata.common.year || '', trackNumber: metadata.common.track?.no || '', hasCover: Boolean(picture?.data?.length), coverMime: picture?.format || null, writable: true, writer: extension === '.mp3' ? 'native' : 'ffmpeg' })
  } catch (error) { res.status(500).json({ error: error.message }) }
})
app.put('/api/metadata/:id', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  const extension = path.extname(track.relativePath).toLowerCase()
  if (extension !== '.mp3' && !FFMPEG_FORMATS.has(extension)) return res.status(415).json({ error: 'Формат записи не поддерживается.' })
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
    const filePath = safeTrackPath(track); await createTrackBackup(track)
    if (extension === '.mp3') { const ok = await writeId3(tags, filePath); if (!ok) throw new Error('Не удалось записать ID3-теги.') }
    else await writeContainerTags(filePath, tags, req.body.coverData || '')
    await scanLibrary(); res.json({ ok: true, track: tracks.find(item => item.id === track.id), backupAvailable: true })
  } catch (error) { res.status(500).json({ error: error.message || 'Ошибка записи метаданных' }) }
})
app.post('/api/metadata/:id/restore', async (req, res) => {
  const track = tracks.find(item => item.id === req.params.id)
  if (!track) return res.sendStatus(404)
  const extension = path.extname(track.relativePath).toLowerCase()
  try { const names = (await fs.readdir(BACKUP_DIR)).filter(name => name.startsWith(track.id + '-') && name.endsWith(extension)).sort().reverse(); if (!names.length) return res.status(404).json({ error: 'Резервная копия не найдена.' }); await createTrackBackup(track); await fs.copyFile(path.join(BACKUP_DIR, names[0]), safeTrackPath(track)); await scanLibrary(); res.json({ ok: true, track: tracks.find(item => item.id === track.id) }) }
  catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/backups', async (_req, res) => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true })
    const backups = []
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{40}-\d+\.(mp3|flac|m4a|ogg|opus)$/.test(entry.name)) continue
      const stat = await fs.stat(path.join(BACKUP_DIR, entry.name))
      backups.push({ id: entry.name.replace(/\.(mp3|flac|m4a|ogg|opus)$/i, ''), trackId: entry.name.split('-')[0], createdAt: new Date(stat.mtimeMs).toISOString(), size: stat.size })
    }
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    res.json({ backups })
  } catch (error) { res.status(500).json({ error: error.message }) }
})
app.post('/api/backups/:id/restore', async (req, res) => {
  if (!/^[a-f0-9]{40}-\d+\.(mp3|flac|m4a|ogg|opus)$/.test(req.params.id)) return res.sendStatus(400)
  const [trackId] = req.params.id.split('-')
  const track = tracks.find(item => item.id === trackId)
  if (!track || path.extname(track.relativePath).toLowerCase() !== path.extname(req.params.id).toLowerCase()) return res.sendStatus(404)
  try {
    const backupPath = path.join(BACKUP_DIR, req.params.id)
    await fs.access(backupPath)
    await createTrackBackup(track)
    await fs.copyFile(backupPath, safeTrackPath(track))
    await scanLibrary()
    res.json({ ok: true, track: tracks.find(item => item.id === track.id) })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.get('/api/sync', async (_req, res) => res.json(await readSync()))
app.put('/api/sync', async (req, res) => { try { res.json(await writeSync(req.body || {})) } catch (error) { res.status(500).json({ error: error.message }) } })
async function uniqueUploadName(directory, originalName) {
  const safeName = sanitizeUploadFilename(originalName), extension = path.extname(safeName), stem = path.basename(safeName, extension)
  for (let index = 0; index < 10000; index += 1) {
    const candidate = index === 0 ? safeName : stem + ' (' + index + ')' + extension
    try { await fs.access(path.join(directory, candidate)) }
    catch (error) { if (error.code === 'ENOENT') return candidate; throw error }
  }
  throw new Error('Не удалось подобрать уникальное имя файла.')
}
const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) { fs.mkdir(UPLOAD_DIR, { recursive: true }).then(() => callback(null, UPLOAD_DIR), callback) },
    filename(_req, file, callback) { uniqueUploadName(UPLOAD_DIR, file.originalname).then(name => callback(null, name), callback) },
  }),
  fileFilter(_req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension)) return callback(new Error('Формат ' + extension + ' не поддерживается.'))
    callback(null, true)
  },
  limits: { fileSize: 1024 * 1024 * 1024, files: 40, fields: 10, parts: 50 },
})
app.post('/api/uploads', upload.array('files', 40), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : []
  if (!files.length) return res.status(400).json({ error: 'Выбери хотя бы один аудиофайл.' })
  try {
    const library = await scanLibrary()
    res.status(201).json({ ok: true, uploaded: files.length, files: files.map(file => file.filename), trackCount: library.length, folder: path.relative(MUSIC_ROOT, UPLOAD_DIR) })
  } catch (error) { res.status(500).json({ error: 'Файлы загружены, но библиотеку не удалось обновить: ' + error.message }) }
})
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

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Файл превышает максимальный размер 1 ГБ.' : 'Не удалось принять загрузку: ' + error.message })
  }
  if (error) return res.status(400).json({ error: error.message || 'Ошибка запроса.' })
  return res.sendStatus(404)
})
app.listen(PORT, HOST, async () => {
  console.log('Resonance Music Server listening on http://' + HOST + ':' + PORT)
  console.log('API network exposure: loopback only (Vite/Tailscale/Cloudflare proxy)')
  if (!API_ACCESS_KEY) console.error('RESONANCE_ACCESS_KEY is missing. API requests will be rejected; run 2-ЗАПУСТИТЬ.bat to create one.')
  console.log('Music folder: ' + MUSIC_ROOT)
  try { await scanLibrary(); console.log('Indexed ' + tracks.length + ' audio files') }
  catch (error) { console.warn('Initial library scan failed:', error.message) }
})
