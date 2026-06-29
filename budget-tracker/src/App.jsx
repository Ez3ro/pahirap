import { useEffect, useState } from "react"
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from "./lib/supabase"
import Auth from "./components/Auth"
import Sidebar from "./components/Sidebar"
import { NAV_ITEMS } from "./lib/nav"
import { useOnlineStatus } from "./lib/useOnlineStatus"
import { usePullToRefresh } from "./lib/usePullToRefresh"
import { saveCache, loadCache, clearUserCache, queueWrite, getPendingWrites, clearPendingWrites, newTempId, isTempId, updateQueuedInsert, removeQueuedInsert, isNetworkError, replayWrite } from "./lib/offlineCache"
import Dashboard from "./views/Dashboard"
import Transactions from "./views/Transactions"
import Income from "./views/Income"
import Debts from "./views/Debts"
import Budget from "./views/Budget"
import History from "./views/History"
import LentMoney from "./views/LentMoney"
import { dayKey, canMarkNoSpend } from "./lib/streak"
import { advanceDue } from "./lib/debts"
import { DEFAULT_CATEGORIES, DEBT_CATEGORY } from "./lib/categories"
import { triggerInstantCheck } from "./lib/notifications"
import AddFab from "./components/AddFab"
import AddTransactionSheet from "./components/AddTransactionSheet"

export default function App() {
  // `session` is null when logged out, or an object with the user when logged in.
  // `authReady` stops us flashing the login screen before we've checked.
  const isOnline = useOnlineStatus()

  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Which sidebar section is showing.
  const [view, setView] = useState("dashboard")
  // Mobile slide-over open/closed.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Desktop: whether the sidebar is collapsed (hidden). Persisted across visits.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  )
  // The quick-add bottom sheet, openable from the FAB on any screen.
  const [addOpen, setAddOpen] = useState(false)

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
      return next
    })
  }

  const [transactions, setTransactions] = useState([])
  const [salarySettings, setSalarySettings] = useState(null)
  const [debts, setDebts] = useState([])
  const [budgetLimits, setBudgetLimits] = useState([])
  const [loans, setLoans] = useState([])
  const [noSpendDays, setNoSpendDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // One wrapper for every mutation, so offline behaviour is uniform.
  //
  // It tries the live Supabase call first. If that fails because the NETWORK is
  // unreachable (a thrown fetch error, or navigator.onLine === false), it queues
  // the operation for later sync and runs the optimistic local update so the UI
  // updates immediately. A real server rejection (constraint, auth, etc.) is
  // surfaced as an error and NOT queued — retrying it wouldn't help.
  //
  // spec: {
  //   write,            // a queued-write descriptor: { table, operation, payload?, match?, onConflict?, tempId? }
  //   optimistic,       // () => void — apply the change to local state right now
  //   onSynced,         // optional () => void — run after a successful LIVE write (e.g. refetch)
  // }
  // Returns true if it went through or was queued, false on a hard error.
  async function runWrite({ write, optimistic, onSynced }) {
    try {
      const { error } = await replayWrite(supabase, write)
      if (error) {
        if (isNetworkError(error)) {
          queueWrite(write)
          optimistic?.()
          setError(null)
          return true
        }
        setError(error.message)
        return false
      }
      onSynced?.()
      return true
    } catch (e) {
      if (isNetworkError(e)) {
        queueWrite(write)
        optimistic?.()
        setError(null)
        return true
      }
      setError(e.message || String(e))
      return false
    }
  }

  async function fetchTransactions() {
    setLoading(true)
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'transactions')
      if (cached) setTransactions(cached)
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
      const cached = loadCache(session.user.id, 'transactions')
      if (cached) setTransactions(cached)
    } else {
      setTransactions(data)
      saveCache(session.user.id, 'transactions', data)
      setError(null)
    }
    setLoading(false)
  }

  // Returns true on success so callers (e.g. the add sheet) know whether to close.
  async function addTransaction(transaction) {
    // The temp id is local-only — it never goes to Supabase (the insert payload
    // has no id, so the DB assigns a real UUID on sync). We tag the queued write
    // with the same tempId so a later offline edit/delete can find and amend it.
    const tempId = newTempId()
    const ok = await runWrite({
      write: { table: 'transactions', operation: 'insert', payload: transaction, tempId },
      optimistic: () => {
        const temp = { ...transaction, id: tempId, created_at: new Date().toISOString() }
        setTransactions((prev) => [temp, ...prev])
      },
      onSynced: () => { fetchTransactions(); triggerInstantCheck() },
    })
    return ok
  }

  async function deleteTransaction(id) {
    // An unsynced offline row only exists locally + as a queued insert. Sending
    // its temp id to Supabase would error ("invalid input syntax for type
    // uuid"), so just drop it from the queue and the UI.
    if (isTempId(id)) {
      removeQueuedInsert('transactions', id)
      setTransactions((prev) => prev.filter((t) => t.id !== id))
      return
    }
    await runWrite({
      write: { table: 'transactions', operation: 'delete', match: { id } },
      optimistic: () => setTransactions((prev) => prev.filter((t) => t.id !== id)),
      onSynced: () => setTransactions((prev) => prev.filter((t) => t.id !== id)),
    })
  }

  async function updateTransaction(id, fields) {
    // Editing a not-yet-synced offline row: there's no DB row to update, so
    // amend the queued insert payload and the local row instead. When it finally
    // syncs, the edited values are what get inserted.
    if (isTempId(id)) {
      updateQueuedInsert('transactions', id, fields)
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)))
      return
    }
    await runWrite({
      write: { table: 'transactions', operation: 'update', payload: fields, match: { id } },
      optimistic: () => setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t))),
      onSynced: () => fetchTransactions(),
    })
  }

  async function fetchSalarySettings() {
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'salary_settings')
      if (cached !== null) setSalarySettings(cached)
      return
    }
    const { data, error } = await supabase
      .from("salary_settings")
      .select("*")
      .maybeSingle()

    if (!error) {
      setSalarySettings(data)
      saveCache(session.user.id, 'salary_settings', data)
    } else {
      const cached = loadCache(session.user.id, 'salary_settings')
      if (cached !== null) setSalarySettings(cached)
    }
  }

  // Persist a partial change to the single salary_settings row (one per user,
  // keyed by user_id). Goes through runWrite so it queues offline; the optimistic
  // update merges `fields` into the current settings so the UI reflects it now.
  async function saveSalaryFields(fields) {
    const payload = { user_id: session.user.id, ...fields, updated_at: new Date().toISOString() }
    await runWrite({
      write: { table: 'salary_settings', operation: 'upsert', payload, onConflict: 'user_id' },
      optimistic: () => setSalarySettings((prev) => ({ ...(prev || { user_id: session.user.id }), ...fields })),
      onSynced: () => fetchSalarySettings(),
    })
  }

  async function saveSalarySettings({ periodA, periodB, paydayA, paydayB }) {
    await saveSalaryFields({
      period_a_amount: periodA,
      period_b_amount: periodB,
      payday_a: paydayA,
      payday_b: paydayB,
    })
  }

  async function skipPayday(dateISO) {
    // Mark a payday as "didn't get paid" by appending it to the skip list.
    const current = salarySettings?.skipped_paydays ?? []
    if (current.includes(dateISO)) return
    await saveSalaryFields({ skipped_paydays: [...current, dateISO] })
  }

  async function unskipPayday(dateISO) {
    // Undo a skip: drop the date from the skip list.
    const current = salarySettings?.skipped_paydays ?? []
    await saveSalaryFields({ skipped_paydays: current.filter((d) => d !== dateISO) })
  }

  async function recordSalary({ dateISO, amount, label }) {
    // paid_for tags this as the salary for a specific payday. The unique index
    // means a second attempt at the same payday will error instead of duplicating.
    const row = { name: `Salary (${label})`, amount, type: "income", paid_for: dateISO }
    const tempId = newTempId()
    await runWrite({
      write: { table: 'transactions', operation: 'insert', payload: row, tempId },
      optimistic: () => setTransactions((prev) => [{ ...row, id: tempId, created_at: new Date().toISOString() }, ...prev]),
      onSynced: () => fetchTransactions(),
    })
  }

  async function fetchDebts() {
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'debts')
      if (cached) setDebts(cached)
      return
    }
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
      const cached = loadCache(session.user.id, 'debts')
      if (cached) setDebts(cached)
    } else {
      setDebts(data)
      saveCache(session.user.id, 'debts', data)
    }
  }

  async function addDebt(debt) {
    const tempId = newTempId()
    await runWrite({
      write: { table: 'debts', operation: 'insert', payload: debt, tempId },
      optimistic: () => setDebts((prev) => [{ ...debt, id: tempId, created_at: new Date().toISOString() }, ...prev]),
      onSynced: () => fetchDebts(),
    })
  }

  async function deleteDebt(id) {
    if (isTempId(id)) {
      removeQueuedInsert('debts', id)
      setDebts((prev) => prev.filter((d) => d.id !== id))
      return
    }
    await runWrite({
      write: { table: 'debts', operation: 'delete', match: { id } },
      optimistic: () => setDebts((prev) => prev.filter((d) => d.id !== id)),
      onSynced: () => setDebts((prev) => prev.filter((d) => d.id !== id)),
    })
  }

  async function updateDebt(id, fields) {
    if (isTempId(id)) {
      updateQueuedInsert('debts', id, fields)
      setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...fields } : d)))
      return
    }
    await runWrite({
      write: { table: 'debts', operation: 'update', payload: fields, match: { id } },
      optimistic: () => setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...fields } : d))),
      onSynced: () => fetchDebts(),
    })
  }

  async function fetchBudgetLimits() {
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'budget_limits')
      if (cached) setBudgetLimits(cached)
      return
    }
    const { data, error } = await supabase.from("budget_limits").select("*")
    if (error) {
      setError(error.message)
      const cached = loadCache(session.user.id, 'budget_limits')
      if (cached) setBudgetLimits(cached)
      return
    }

    if (data.length === 0) {
      // First visit — seed the default categories with no limit set yet.
      const defaults = DEFAULT_CATEGORIES.map((c) => ({
        user_id: session.user.id,
        category: c.key,
        monthly_limit: 0,
      }))
      const { error: seedError } = await supabase.from("budget_limits").insert(defaults)
      if (seedError) { setError(seedError.message); return }
      const { data: seeded } = await supabase.from("budget_limits").select("*")
      setBudgetLimits(seeded ?? [])
      saveCache(session.user.id, 'budget_limits', seeded ?? [])
      return
    }

    setBudgetLimits(data)
    saveCache(session.user.id, 'budget_limits', data)
  }

  // Budget limits are keyed by (user_id, category) — there's no separate row id we
  // act on, so offline edits match on those columns and the optimistic update
  // patches the matching category row in local state. No temp-id dance needed.
  const uid = () => session.user.id

  function patchLimit(category, fields) {
    setBudgetLimits((prev) => {
      const exists = prev.some((b) => b.category === category)
      if (exists) return prev.map((b) => (b.category === category ? { ...b, ...fields } : b))
      return [...prev, { user_id: uid(), category, monthly_limit: 0, ...fields }]
    })
  }

  async function saveBudgetLimit(category, limit) {
    await runWrite({
      write: { table: 'budget_limits', operation: 'upsert', payload: { user_id: uid(), category, monthly_limit: limit }, onConflict: 'user_id,category' },
      optimistic: () => patchLimit(category, { monthly_limit: limit }),
      onSynced: () => fetchBudgetLimits(),
    })
  }

  // Toggle whether a category takes part in the auto-budget. Off = the auto-split
  // skips it and shares its money among the rest.
  async function setCategoryAutoBudget(category, autoBudget) {
    await runWrite({
      write: { table: 'budget_limits', operation: 'update', payload: { auto_budget: autoBudget }, match: { user_id: uid(), category } },
      optimistic: () => patchLimit(category, { auto_budget: autoBudget }),
      onSynced: () => fetchBudgetLimits(),
    })
  }

  // Set how often a category's budget resets (daily / weekly / monthly).
  async function setCategoryCadence(category, cadence) {
    await runWrite({
      write: { table: 'budget_limits', operation: 'update', payload: { cadence }, match: { user_id: uid(), category } },
      optimistic: () => patchLimit(category, { cadence }),
      onSynced: () => fetchBudgetLimits(),
    })
  }

  // Apply an auto-budget: write a batch of { category, monthly_limit } rows in one
  // upsert. Used by the Budget page's "Apply suggested budget" button.
  async function applyBudgetLimits(rows) {
    if (!rows.length) return
    const payload = rows.map((r) => ({ user_id: uid(), category: r.category, monthly_limit: r.monthly_limit }))
    await runWrite({
      write: { table: 'budget_limits', operation: 'upsert', payload, onConflict: 'user_id,category' },
      optimistic: () => { for (const r of rows) patchLimit(r.category, { monthly_limit: r.monthly_limit }) },
      onSynced: () => fetchBudgetLimits(),
    })
  }

  async function addBudgetCategory(name) {
    // "Debt" is reserved — it's a passthrough category the budget deliberately
    // ignores, so it must never become a budgetable card.
    if (name.trim().toLowerCase() === DEBT_CATEGORY.toLowerCase()) {
      setError(`"${DEBT_CATEGORY}" is reserved for debt payments and can't be a budget category.`)
      return
    }
    await runWrite({
      write: { table: 'budget_limits', operation: 'insert', payload: { user_id: uid(), category: name, monthly_limit: 0 } },
      optimistic: () => patchLimit(name, { monthly_limit: 0 }),
      onSynced: () => fetchBudgetLimits(),
    })
  }

  async function removeBudgetCategory(category) {
    await runWrite({
      write: { table: 'budget_limits', operation: 'delete', match: { user_id: uid(), category } },
      optimistic: () => setBudgetLimits((prev) => prev.filter((b) => b.category !== category)),
      onSynced: () => fetchBudgetLimits(),
    })
  }

  async function fetchLoans() {
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'loans')
      if (cached) setLoans(cached)
      return
    }
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) {
      setError(error.message)
      const cached = loadCache(session.user.id, 'loans')
      if (cached) setLoans(cached)
    } else {
      setLoans(data)
      saveCache(session.user.id, 'loans', data)
    }
  }

  async function addLoan(loan) {
    const tempId = newTempId()
    await runWrite({
      write: { table: 'loans', operation: 'insert', payload: loan, tempId },
      optimistic: () => setLoans((prev) => [{ ...loan, id: tempId, created_at: new Date().toISOString() }, ...prev]),
      onSynced: () => fetchLoans(),
    })
  }

  async function updateLoan(id, fields) {
    if (isTempId(id)) {
      updateQueuedInsert('loans', id, fields)
      setLoans((prev) => prev.map((l) => (l.id === id ? { ...l, ...fields } : l)))
      return
    }
    await runWrite({
      write: { table: 'loans', operation: 'update', payload: fields, match: { id } },
      optimistic: () => setLoans((prev) => prev.map((l) => (l.id === id ? { ...l, ...fields } : l))),
      onSynced: () => fetchLoans(),
    })
  }

  async function deleteLoan(id) {
    if (isTempId(id)) {
      removeQueuedInsert('loans', id)
      setLoans((prev) => prev.filter((l) => l.id !== id))
      return
    }
    await runWrite({
      write: { table: 'loans', operation: 'delete', match: { id } },
      optimistic: () => setLoans((prev) => prev.filter((l) => l.id !== id)),
      onSynced: () => setLoans((prev) => prev.filter((l) => l.id !== id)),
    })
  }

  // No-spend marks — explicit "I had nothing to spend today" days, the one piece
  // of streak state that can't be derived (a zero-transaction day is otherwise
  // indistinguishable from an untracked one). Cached like the rest for offline.
  async function fetchNoSpendDays() {
    if (!navigator.onLine) {
      const cached = loadCache(session.user.id, 'no_spend_days')
      if (cached) setNoSpendDays(cached)
      return
    }
    const { data, error } = await supabase.from("no_spend_days").select("*")
    if (error) {
      setError(error.message)
      const cached = loadCache(session.user.id, 'no_spend_days')
      if (cached) setNoSpendDays(cached)
      return
    }
    setNoSpendDays(data)
    saveCache(session.user.id, 'no_spend_days', data)
  }

  // Mark today as a no-spend day. Idempotent: keyed on (user_id, day) with an
  // upsert, so a double-tap or a twice-replayed offline write collapses to one
  // row. Guarded so it no-ops if today already has a transaction or a mark — the
  // button shouldn't show then, but an offline same-day spend could race it.
  async function markNoSpendToday() {
    if (!canMarkNoSpend(transactions, noSpendDays.map((r) => r.day))) return
    const day = dayKey(new Date())
    await runWrite({
      write: { table: 'no_spend_days', operation: 'upsert', payload: { user_id: uid(), day }, onConflict: 'user_id,day' },
      optimistic: () => setNoSpendDays((prev) => (prev.some((r) => r.day === day) ? prev : [...prev, { user_id: uid(), day }])),
      onSynced: () => fetchNoSpendDays(),
    })
  }

  // Record a debt payment: log it as an expense (which lowers the balance), then
  // update the debt by kind:
  //   recurring — drop one month, advance the due date
  //   lump sum   — settle it by removing it
  //   credit     — reduce the balance by the amount paid (settles when it hits 0)
  // `payAmount` overrides the amount paid (used for credit cards, where you can
  // pay more than the minimum); defaults to the debt's standard amount.
  async function payDebt(debt, payAmount) {
    const paid = Number(payAmount) > 0 ? Number(payAmount) : Number(debt.amount)

    // Work out the debt-side change up front so we can apply it both to the live
    // call and to the optimistic local state / queue.
    const txRow = { name: `Debt: ${debt.name}`, amount: paid, type: "expense", is_debt_payment: true, category: DEBT_CATEGORY }
    let debtOp // { kind: 'delete' } | { kind: 'update', fields }
    if (debt.kind === "lumpsum") {
      debtOp = { kind: "delete" }
    } else if (debt.kind === "credit") {
      const newBalance = Math.max(0, (Number(debt.balance) || 0) - paid)
      const fields = { balance: newBalance }
      if (debt.due_day && debt.next_due_date && newBalance > 0) {
        fields.next_due_date = advanceDue(debt.next_due_date, debt.due_day)
      }
      debtOp = { kind: "update", fields }
    } else {
      const monthsLeft = Math.max(0, (Number(debt.months_left) || 0) - 1)
      debtOp = {
        kind: "update",
        fields: {
          months_left: monthsLeft,
          next_due_date: monthsLeft > 0 ? advanceDue(debt.next_due_date, debt.due_day) : debt.next_due_date,
        },
      }
    }

    // Optimistic local update for the debt side (used when queued offline).
    const applyDebtLocal = () => {
      if (debtOp.kind === "delete") {
        setDebts((prev) => prev.filter((d) => d.id !== debt.id))
      } else {
        setDebts((prev) => prev.map((d) => (d.id === debt.id ? { ...d, ...debtOp.fields } : d)))
      }
    }

    // 1) The payment transaction (always an insert; offline gets a temp id).
    const tempId = newTempId()
    await runWrite({
      write: { table: 'transactions', operation: 'insert', payload: txRow, tempId },
      optimistic: () => setTransactions((prev) => [{ ...txRow, id: tempId, created_at: new Date().toISOString() }, ...prev]),
      onSynced: () => fetchTransactions(),
    })

    // 2) The debt mutation. If the debt itself is an unsynced offline row, amend
    // its queued insert / local row instead of hitting the DB with a temp id.
    if (isTempId(debt.id)) {
      if (debtOp.kind === "delete") {
        removeQueuedInsert('debts', debt.id)
        setDebts((prev) => prev.filter((d) => d.id !== debt.id))
      } else {
        updateQueuedInsert('debts', debt.id, debtOp.fields)
        setDebts((prev) => prev.map((d) => (d.id === debt.id ? { ...d, ...debtOp.fields } : d)))
      }
    } else if (debtOp.kind === "delete") {
      await runWrite({
        write: { table: 'debts', operation: 'delete', match: { id: debt.id } },
        optimistic: applyDebtLocal,
        onSynced: () => fetchDebts(),
      })
    } else {
      await runWrite({
        write: { table: 'debts', operation: 'update', payload: debtOp.fields, match: { id: debt.id } },
        optimistic: applyDebtLocal,
        onSynced: () => fetchDebts(),
      })
    }
  }

  // On first load: check for an existing session, then keep it in sync.
  // onAuthStateChange fires on sign in, sign out, and token refresh.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    // Clean up the subscription when App unmounts.
    return () => listener.subscription.unsubscribe()
  }, [])

  // Load (or clear) the user's data whenever the logged-in USER changes.
  //
  // We key this on the user id, not the whole session object: Supabase fires
  // onAuthStateChange (with a fresh session object) on every token refresh —
  // including the refresh that happens the moment you reconnect after being
  // offline. If we reloaded on the object identity, that refetch would race the
  // offline-write flush and overwrite the optimistic rows before they sync,
  // making the transaction vanish. Keying on the id means a refresh for the
  // same user is a no-op here.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTransactions()
      fetchSalarySettings()
      fetchDebts()
      fetchBudgetLimits()
      fetchLoans()
      fetchNoSpendDays()
    } else {
      setTransactions([])
      setSalarySettings(null)
      setDebts([])
      setBudgetLimits([])
      setLoans([])
      setNoSpendDays([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Flush queued offline writes. Triggered by several signals so we don't miss
  // reconnects on mobile: the `online` event, `visibilitychange` (app comes to
  // foreground), session load, and an automatic retry timer. All check
  // navigator.onLine directly rather than going through React state, avoiding
  // the timing gap between the browser event and the React state update.
  useEffect(() => {
    if (!userId) return

    // iOS Safari fires `online` a beat before the network is actually usable, so
    // the first fetch after reconnect often dies with "Load failed". We treat
    // that as transient and retry on a short backoff rather than surfacing it.
    let flushing = false        // re-entrancy guard (triggers can overlap)
    let retryTimer = null
    let attempt = 0
    const BACKOFFS = [1000, 3000, 6000, 12000] // ms

    // A failure we should retry (network not ready, token not refreshed) vs.
    // report (a real rejection — retrying the same payload won't help).
    function isTransient(message) {
      const m = (message || '').toLowerCase()
      return isNetworkError({ message }) || m.includes('jwt') || m.includes('token')
    }

    async function tryFlush() {
      if (flushing || !navigator.onLine) return
      const pending = getPendingWrites()
      if (!pending.length) return
      flushing = true

      try {
        // Refresh the token first — on reconnect the JWT may have expired offline.
        try { await supabase.auth.getSession() } catch { /* retried below */ }

        const stillFailing = []
        let hardError = null
        for (const write of pending) {
          // Supabase reports failures in the result object, not by throwing — but
          // a dead network DOES throw, so we handle both. replayWrite knows how to
          // turn any queued op (insert/update/delete/upsert, matched on any
          // columns) back into the right Supabase call.
          let result
          try {
            result = await replayWrite(supabase, write)
          } catch (e) {
            result = { error: e }
          }
          if (result?.error) {
            const message = result.error.message || String(result.error)
            stillFailing.push(write)
            if (!isTransient(message)) hardError = message // a real, non-retryable error
          }
        }

        if (stillFailing.length > 0) {
          localStorage.setItem('pahirap_pending_writes', JSON.stringify(stillFailing))
          if (hardError) {
            // Won't fix itself — tell the user and stop the retry loop.
            setError(`Couldn't sync an offline change: ${hardError}`)
          } else {
            // Transient network blip — schedule an automatic retry, no scary error.
            setError(null)
            if (attempt < BACKOFFS.length) {
              const delay = BACKOFFS[attempt++]
              clearTimeout(retryTimer)
              retryTimer = setTimeout(() => { flushing = false; tryFlush() }, delay)
              flushing = false
              return
            }
          }
          flushing = false
          return // don't refetch — would wipe unsynced optimistic rows
        }

        // Success: reset retry state, clear the queue, replace optimistic rows.
        attempt = 0
        clearTimeout(retryTimer)
        clearPendingWrites()
        setError(null)
        fetchTransactions()
        fetchSalarySettings()
        fetchDebts()
        fetchBudgetLimits()
        fetchLoans()
        fetchNoSpendDays()
      } finally {
        flushing = false
      }
    }

    // Run immediately — catches pending writes from a previous offline session.
    tryFlush()

    function onOnline() { attempt = 0; tryFlush() }
    function onVisible() { if (!document.hidden) { attempt = 0; tryFlush() } }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(retryTimer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function signOut() {
    if (session) clearUserCache(session.user.id)
    await supabase.auth.signOut()
  }

  // Pull-to-refresh: re-pull everything from the server. Runs in parallel so the
  // spinner doesn't drag on. (The flush effect already handles syncing queued
  // offline writes; this is purely a manual "get me the latest" gesture.)
  async function refreshAll() {
    await Promise.all([
      fetchTransactions(),
      fetchSalarySettings(),
      fetchDebts(),
      fetchBudgetLimits(),
      fetchLoans(),
      fetchNoSpendDays(),
    ])
  }

  const { containerRef: scrollRef, distance: pullDistance, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh(refreshAll)

  // Still checking the session — show nothing rather than a flash of the login form.
  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-900 text-gray-400">
        Loading…
      </div>
    )
  }

  // Logged out -> show the sign in / sign up screen.
  if (!session) {
    return <Auth />
  }

  // Picks which view component to render for the active sidebar section.
  function renderView() {
    switch (view) {
      case "dashboard":
        return (
          <Dashboard
            transactions={transactions}
            debts={debts}
            budgetLimits={budgetLimits}
            loans={loans}
            salarySettings={salarySettings}
            noSpendDays={noSpendDays}
            onMarkNoSpend={markNoSpendToday}
          />
        )
      case "transactions":
        return (
          <Transactions
            transactions={transactions}
            loading={loading}
            categories={budgetLimits.map((b) => b.category)}
            debts={debts}
            loans={loans}
            budgetLimits={budgetLimits}
            salarySettings={salarySettings}
            onDelete={deleteTransaction}
            onUpdate={updateTransaction}
            onAddClick={() => setAddOpen(true)}
          />
        )
      case "income":
        return (
          <Income
            // Remount when settings change so the form re-seeds from fresh props.
            key={salarySettings?.updated_at ?? "new"}
            settings={salarySettings}
            transactions={transactions}
            debts={debts}
            loans={loans}
            budgetLimits={budgetLimits}
            onSaveSettings={saveSalarySettings}
            onRecordSalary={recordSalary}
            onSkipPayday={skipPayday}
            onUnskipPayday={unskipPayday}
          />
        )
      case "debts":
        return (
          <Debts
            debts={debts}
            loading={loading}
            salarySettings={salarySettings}
            onAdd={addDebt}
            onDelete={deleteDebt}
            onPay={payDebt}
            onUpdate={updateDebt}
          />
        )
      case "budget":
        return (
          <Budget
            transactions={transactions}
            budgetLimits={budgetLimits}
            debts={debts}
            loans={loans}
            salarySettings={salarySettings}
            onSaveLimit={saveBudgetLimit}
            onApplyBudget={applyBudgetLimits}
            onSetAutoBudget={setCategoryAutoBudget}
            onSetCadence={setCategoryCadence}
            onAddCategory={addBudgetCategory}
            onRemoveCategory={removeBudgetCategory}
          />
        )
      case "history":
        return (
          <History
            transactions={transactions}
            budgetLimits={budgetLimits}
            salarySettings={salarySettings}
          />
        )
      case "lent":
        return (
          <LentMoney
            loans={loans}
            onAdd={addLoan}
            onUpdate={updateLoan}
            onDelete={deleteLoan}
          />
        )
    }
  }

  const activeTitle = NAV_ITEMS.find((item) => item.key === view)?.label ?? ""

  // Logged in -> the sidebar + main content layout.
  return (
    <div className="flex min-h-dvh bg-gray-950">
      <Sidebar
        view={view}
        onChange={setView}
        email={session.user.email}
        onSignOut={signOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <main ref={scrollRef} className="relative min-w-0 flex-1 overflow-y-auto">
        {/* Pull-to-refresh indicator — a spinner that follows the finger on
            mobile, then spins while data reloads. Hidden at rest (distance 0). */}
        {pullDistance > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
            style={{ transform: `translateY(${pullDistance - 28}px)`, transition: pullRefreshing ? "none" : "transform 0.15s ease-out" }}
          >
            <div className="rounded-full bg-gray-800 p-2 shadow-lg">
              <svg
                className={`h-5 w-5 text-blue-400 ${pullRefreshing ? "animate-spin" : ""}`}
                style={pullRefreshing ? undefined : { transform: `rotate(${(pullDistance / pullThreshold) * 270}deg)` }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          </div>
        )}
        {!isOnline && (
          <div className="flex items-center gap-2 border-b border-amber-700/40 bg-amber-950/60 px-6 py-2 text-sm text-amber-300">
            <span>●</span>
            <span>
              You&apos;re offline — showing cached data.
              {getPendingWrites().length > 0 && ` ${getPendingWrites().length} change${getPendingWrites().length === 1 ? '' : 's'} will sync when you reconnect.`}
            </span>
          </div>
        )}
        <div className="p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full min-w-0 max-w-7xl">
          <div className="mb-6 flex items-center gap-3">
            {/* Mobile: open the slide-over. */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 md:hidden"
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
            {/* Desktop: show the collapsed sidebar again. Only visible when hidden. */}
            {sidebarCollapsed && (
              <button
                onClick={toggleSidebarCollapsed}
                className="hidden rounded-lg p-2 text-gray-400 hover:bg-gray-800 md:inline-flex"
                aria-label="Show sidebar"
              >
                <MenuIcon />
              </button>
            )}
            <h2 className="text-2xl font-bold text-gray-100">{activeTitle}</h2>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {renderView()}
        </div>
        </div>
      </main>

      {/* Quick-add: a floating button on the Dashboard so you can log a spend the
          moment it happens. The Transactions tab has its own inline "Add
          transaction" button, so the FAB would be redundant there. */}
      {view === "dashboard" && <AddFab onClick={() => setAddOpen(true)} />}
      <AddTransactionSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addTransaction}
        categories={budgetLimits.map((b) => b.category)}
        transactions={transactions}
      />

      <SpeedInsights />
      <Analytics />
    </div>
  )
}

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
