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
  assert.deepEqual(result.equalizer, { eq: { bass: 12, mid: -12, treble: 3 }, eqPreset: 'Studio' })
})
