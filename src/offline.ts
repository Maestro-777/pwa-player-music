export type OfflineTrackInfo = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  format: string
  year: number | null
  genre: string | null
}

export type OfflineTrackRecord = {
  id: string
  track: OfflineTrackInfo
  blob: Blob
  savedAt: string
  size: number
}

const DATABASE_NAME = 'resonance-offline-library'
const STORE_NAME = 'tracks'
const DATABASE_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Это устройство или браузер не поддерживает локальные офлайн-загрузки.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Не удалось открыть офлайн-хранилище.'))
    request.onblocked = () => reject(new Error('Офлайн-хранилище занято другой вкладкой. Закрой другие вкладки Resonance и повтори.'))
  })
}

function writeRecord(record: OfflineTrackRecord): Promise<void> {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Не удалось сохранить аудиофайл.')) }
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Сохранение аудиофайла было прервано.')) }
  }))
}

export async function saveOfflineTrack(track: OfflineTrackInfo, streamUrl: string): Promise<OfflineTrackRecord> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try { await navigator.storage.persist() } catch { /* persistence is best-effort */ }
  }
  const response = await fetch(streamUrl)
  if (!response.ok) throw new Error(response.status === 404 ? 'Файл не найден на музыкальном сервере. Просканируй библиотеку ещё раз.' : 'Не удалось скачать трек (HTTP ' + response.status + ').')
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > 0 && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      if (estimate.quota && (estimate.usage || 0) + declaredSize > estimate.quota * 0.95) {
        throw new Error('Недостаточно свободного места браузера для этой загрузки. Освободи место в офлайн-разделе.')
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Недостаточно')) throw error
    }
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error('Сервер вернул пустой аудиофайл.')
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      if (estimate.quota && (estimate.usage || 0) > estimate.quota * 0.98) {
        throw new Error('Хранилище браузера почти заполнено. Удали ненужные офлайн-треки.')
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Хранилище')) throw error
    }
  }
  const record: OfflineTrackRecord = { id: track.id, track, blob, savedAt: new Date().toISOString(), size: blob.size }
  await writeRecord(record)
  return record
}

export async function listOfflineTracks(): Promise<OfflineTrackRecord[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as OfflineTrackRecord[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать офлайн-библиотеку.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Ошибка чтения офлайн-библиотеки.')) }
  })
}

export async function getOfflineTrack(id: string): Promise<OfflineTrackRecord | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve((request.result as OfflineTrackRecord | undefined) || null)
    request.onerror = () => reject(request.error || new Error('Не удалось открыть офлайн-трек.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Ошибка чтения офлайн-трека.')) }
  })
}

export async function deleteOfflineTrack(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('Не удалось удалить офлайн-трек.')) }
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Удаление было прервано.')) }
  })
}
