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

// Did a Supabase call fail because the NETWORK was unreachable (vs. the server
// rejecting it)? navigator.onLine lies on mobile — iOS Safari often reports
// online with no real connectivity — so the actual fetch failure is the source
// of truth for "we're offline, queue this instead".
export function isNetworkError(err) {
  if (!err) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = (err.message || String(err)).toLowerCase()
  return (
    m.includes('load failed') ||         // Safari
    m.includes('failed to fetch') ||     // Chrome / Firefox
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('timeout') ||
    m.includes('fetch')
  )
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
// Each item is a self-describing operation:
//   { table, operation, payload?, match?, onConflict?, tempId? }
//     operation : 'insert' | 'update' | 'delete' | 'upsert'
//     payload   : the row(s) for insert/update/upsert
//     match     : { column: value, … } — the WHERE for update/delete
//     onConflict: comma-separated columns, for upsert
//     tempId    : set on offline inserts so a later offline edit/delete can find
//                 and amend the queued insert instead of hitting the DB
//
// replayWrite() below is the single place that turns one of these back into a
// Supabase call, used by the flush loop.

export function queueWrite(item) {
  try {
    const q = getPendingWrites()
    q.push({ ...item, ts: Date.now() })
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    // ignore
  }
}

// Execute one queued operation against a live Supabase client. Returns the
// Supabase result ({ error } shape). Centralised so the flush loop doesn't have
// to know the op vocabulary.
export async function replayWrite(supabase, write) {
  const q = supabase.from(write.table)
  if (write.operation === 'insert') {
    return q.insert(Array.isArray(write.payload) ? write.payload : [write.payload])
  }
  if (write.operation === 'upsert') {
    return q.upsert(write.payload, write.onConflict ? { onConflict: write.onConflict } : undefined)
  }
  if (write.operation === 'update') {
    let builder = q.update(write.payload)
    for (const [col, val] of Object.entries(write.match || {})) builder = builder.eq(col, val)
    return builder
  }
  if (write.operation === 'delete') {
    let builder = q.delete()
    for (const [col, val] of Object.entries(write.match || {})) builder = builder.eq(col, val)
    return builder
  }
  return { error: { message: `Unknown queued operation: ${write.operation}` } }
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
