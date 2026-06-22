// Lightweight offline cache backed by localStorage.
//
// Reads after each successful Supabase fetch so the data survives a network
// drop. When the app starts offline it hydrates from the cache and shows a
// banner rather than a blank/error screen.
//
// Writes queue: mutations that arrive while the device is offline are stored
// as plain Supabase operations and flushed in order when connectivity returns.
// Single-user data + "last write wins" means conflicts are essentially
// impossible in practice.

const PREFIX = 'pahirap_cache_'
const QUEUE_KEY = 'pahirap_pending_writes'

// Optimistic rows created while offline get a temporary id (they have no real
// database UUID yet). Prefix it distinctively so we can recognise these rows and
// NEVER send the fake id to Supabase — a `uuid` column rejects "temp_…" with an
// "invalid input syntax for type uuid" error.
const TEMP_PREFIX = 'temp_'
let tempCounter = 0
export function newTempId() {
  // Avoid Date.now() collisions when several rows are added in the same ms.
  tempCounter += 1
  return `${TEMP_PREFIX}${Date.now()}_${tempCounter}`
}
export function isTempId(id) {
  return typeof id === 'string' && id.startsWith(TEMP_PREFIX)
}

// ── Read / write cache ────────────────────────────────────────────────────────

export function saveCache(userId, key, data) {
  try {
    localStorage.setItem(`${PREFIX}${userId}_${key}`, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // Storage quota exceeded — silently skip; stale data is still better than
    // crashing the fetch flow.
  }
}

export function loadCache(userId, key) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${userId}_${key}`)
    if (!raw) return null
    return JSON.parse(raw).data
  } catch {
    return null
  }
}

export function clearUserCache(userId) {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(`${PREFIX}${userId}_`)) localStorage.removeItem(k)
  }
}

// ── Pending write queue ───────────────────────────────────────────────────────
// Each item: { table, operation: 'insert'|'update'|'delete', payload?, matchId? }

export function queueWrite(item) {
  try {
    const q = getPendingWrites()
    q.push({ ...item, ts: Date.now() })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    // ignore
  }
}

export function getPendingWrites() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function clearPendingWrites() {
  localStorage.removeItem(QUEUE_KEY)
}

function setPendingWrites(writes) {
  if (writes.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(writes))
  else clearPendingWrites()
}

// Editing a row that was created offline and hasn't synced yet: there's no DB
// row, so we patch the queued insert's payload. Matched by the tempId we tagged
// it with at queue time.
export function updateQueuedInsert(table, tempId, fields) {
  const q = getPendingWrites()
  for (const w of q) {
    if (w.table === table && w.operation === 'insert' && w.tempId === tempId) {
      w.payload = { ...w.payload, ...fields }
    }
  }
  setPendingWrites(q)
}

// Deleting an unsynced offline row: just drop its queued insert so it never
// reaches the database.
export function removeQueuedInsert(table, tempId) {
  const q = getPendingWrites().filter(
    (w) => !(w.table === table && w.operation === 'insert' && w.tempId === tempId)
  )
  setPendingWrites(q)
}
