import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { parseByteRange, resolveSafePath, sanitizeSyncState } from '../lib/utils.js'

test('parseByteRange supports normal, open-ended and suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-9', 100), { start: 0, end: 9 })
  assert.deepEqual(parseByteRange('bytes=10-', 100), { start: 10, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-500', 100), { start: 0, end: 99 })
  assert.deepEqual(parseByteRange('bytes=95-500', 100), { start: 95, end: 99 })
})

test('parseByteRange rejects malformed and unsatisfiable ranges', () => {
  for (const value of ['items=0-2', 'bytes=100-', 'bytes=4-3', 'bytes=-0', 'bytes=0-1,4-5', 'bytes=abc-def']) {
    assert.equal(parseByteRange(value, 100), null, value)
  }
  assert.equal(parseByteRange('bytes=0-0', 0), null)
})

test('resolveSafePath rejects traversal outside the music root', () => {
  const root = path.join(os.tmpdir(), 'resonance-music')
  assert.equal(resolveSafePath(root, path.join('album', 'song.mp3')), path.join(root, 'album', 'song.mp3'))
  assert.throws(() => resolveSafePath(root, path.join('..', 'secret.txt')), /outside music root/)
  assert.throws(() => resolveSafePath(root, root), /outside music root/)
})

test('sanitizeSyncState validates and bounds persisted user data', () => {
  const result = sanitizeSyncState({
    favorites: ['a', 'a', 42, 'b'],
    playlists: [{ id: 'p1', name: ' Mix ', trackIds: ['a', 'a', 'b'] }, { id: 2, name: 'invalid', trackIds: [] }],
    history: ['x', null],
    queue: ['q'],
    updatedAt: 42,
    ignored: 'not persisted',
  })
  assert.deepEqual(result.favorites, ['a', 'b'])
  assert.deepEqual(result.playlists, [{ id: 'p1', name: 'Mix', trackIds: ['a', 'b'] }])
  assert.deepEqual(result.history, ['x'])
  assert.deepEqual(result.queue, ['q'])
  assert.equal(result.updatedAt, null)
  assert.equal('ignored' in result, false)
})

test('sanitizeSyncState whitelists theme and equalizer settings', () => {
  const result = sanitizeSyncState({
    preferences: { theme: 'dark', accent: 'violet', radius: 900, fontScale: 70, sidebar: false, arbitrary: 'drop' },
    equalizer: { eq: { bass: 30, mid: -20, treble: 3 }, eqPreset: 'Studio' },
  })
  assert.deepEqual(result.preferences, { theme: 'dark', accent: 'violet', radius: 28, fontScale: 85, sidebar: false })
  assert.deepEqual(result.equalizer, { eq: { '32': 12, '64': 12, '125': 12, '250': -12, '500': -12, '1000': -12, '2000': -12, '4000': 3, '8000': 3, '16000': 3 }, eqPreset: 'Studio' })
})

test('sanitizeSyncState clamps all ten equalizer bands independently', () => {
  const result = sanitizeSyncState({ equalizer: { eq: { '32': 14, '64': -14, '125': 2, '250': 0, '500': 1, '1000': 2, '2000': 3, '4000': 4, '8000': 5, '16000': 6 }, eqPreset: 'Manual' } })
  assert.deepEqual(result.equalizer.eq, { '32': 12, '64': -12, '125': 2, '250': 0, '500': 1, '1000': 2, '2000': 3, '4000': 4, '8000': 5, '16000': 6 })
})

test('resolveServerHost keeps the music API bound to loopback', async () => {
  const { resolveServerHost } = await import('../lib/utils.js')
  assert.equal(resolveServerHost(undefined), '127.0.0.1')
  assert.equal(resolveServerHost('127.0.0.1'), '127.0.0.1')
  for (const host of ['0.0.0.0', '192.168.1.20', '::', 'localhost', '']) {
    assert.equal(resolveServerHost(host), '127.0.0.1', host)
  }
})

test('sanitizeUploadFilename strips paths and unsafe characters while preserving valid audio extensions', async () => {
  const { sanitizeUploadFilename } = await import('../lib/utils.js')
  assert.equal(sanitizeUploadFilename('C:\\Users\\me\\Live Set.mp3'), 'Live Set.mp3')
  assert.equal(sanitizeUploadFilename('../../Album: Track?.FLAC'), 'Album_ Track_.flac')
  assert.throws(() => sanitizeUploadFilename('cover.jpg'), /Unsupported audio/)
  assert.throws(() => sanitizeUploadFilename(''), /Empty upload/)
})
