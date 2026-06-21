import { useEffect, useState } from "react"
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from "./lib/supabase"
import Auth from "./components/Auth"
import Sidebar from "./components/Sidebar"
import { NAV_ITEMS } from "./lib/nav"
import Dashboard from "./views/Dashboard"
import Transactions from "./views/Transactions"
import Income from "./views/Income"
import Debts from "./views/Debts"
import Budget from "./views/Budget"
import LentMoney from "./views/LentMoney"
import { advanceDue } from "./lib/debts"
import { DEFAULT_CATEGORIES, DEBT_CATEGORY } from "./lib/categories"
import { triggerInstantCheck } from "./lib/notifications"
import AddFab from "./components/AddFab"
import AddTransactionSheet from "./components/AddTransactionSheet"

export default function App() {
  // `session` is null when logged out, or an object with the user when logged in.
  // `authReady` stops us flashing the login screen before we've checked.
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchTransactions() {
    setLoading(true)
    // No need to filter by user here — Row Level Security only returns the
    // logged-in user's own rows, so "select *" is already scoped to them.
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setTransactions(data)
      setError(null)
    }
    setLoading(false)
  }

  // Returns true on success so callers (e.g. the add sheet) know whether to close.
  async function addTransaction(transaction) {
    // We don't pass user_id — the table's default (auth.uid()) fills it in.
    const { error } = await supabase.from("transactions").insert([transaction])
    if (error) {
      setError(error.message)
      return false
    }
    fetchTransactions()
    // Nudge the push function to check budgets now, so an overspend pings you
    // immediately rather than waiting for the next hourly cron run. Fire-and-
    // forget: the server makes the real (de-duped) decision, and any failure
    // here is swallowed so it never affects saving the transaction.
    triggerInstantCheck()
    return true
  }

  async function deleteTransaction(id) {
    const { error } = await supabase.from("transactions").delete().eq("id", id)
    if (error) {
      setError(error.message)
    } else {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
    }
  }

  async function updateTransaction(id, fields) {
    const { error } = await supabase.from("transactions").update(fields).eq("id", id)
    if (error) setError(error.message)
    else fetchTransactions()
  }

  async function fetchSalarySettings() {
    // maybeSingle() returns one row or null (rather than erroring when none exists).
    const { data, error } = await supabase
      .from("salary_settings")
      .select("*")
      .maybeSingle()

    if (!error) setSalarySettings(data)
  }

  async function saveSalarySettings({ periodA, periodB, paydayA, paydayB }) {
    // upsert = insert a row, or update it if one already exists for this user
    // (user_id is the primary key, so onConflict targets it).
    const { data, error } = await supabase
      .from("salary_settings")
      .upsert(
        {
          user_id: session.user.id,
          period_a_amount: periodA,
          period_b_amount: periodB,
          payday_a: paydayA,
          payday_b: paydayB,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .maybeSingle()

    if (error) setError(error.message)
    else setSalarySettings(data)
  }

  async function skipPayday(dateISO) {
    // Mark a payday as "didn't get paid" by appending it to the skip list.
    // upsert only touches the columns we pass, so the amounts are left alone.
    const current = salarySettings?.skipped_paydays ?? []
    if (current.includes(dateISO)) return

    const { data, error } = await supabase
      .from("salary_settings")
      .upsert(
        {
          user_id: session.user.id,
          skipped_paydays: [...current, dateISO],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .maybeSingle()

    if (error) setError(error.message)
    else setSalarySettings(data)
  }

  async function unskipPayday(dateISO) {
    // Undo a skip: drop the date from the skip list.
    const current = salarySettings?.skipped_paydays ?? []
    const { data, error } = await supabase
      .from("salary_settings")
      .upsert(
        {
          user_id: session.user.id,
          skipped_paydays: current.filter((d) => d !== dateISO),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .maybeSingle()

    if (error) setError(error.message)
    else setSalarySettings(data)
  }

  async function recordSalary({ dateISO, amount, label }) {
    // paid_for tags this as the salary for a specific payday. The unique index
    // means a second attempt at the same payday will error instead of duplicating.
    const { error } = await supabase.from("transactions").insert([
      {
        name: `Salary (${label})`,
        amount,
        type: "income",
        paid_for: dateISO,
      },
    ])
    if (error) setError(error.message)
    else fetchTransactions()
  }

  async function fetchDebts() {
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) setError(error.message)
    else setDebts(data)
  }

  async function addDebt(debt) {
    const { error } = await supabase.from("debts").insert([debt])
    if (error) setError(error.message)
    else fetchDebts()
  }

  async function deleteDebt(id) {
    const { error } = await supabase.from("debts").delete().eq("id", id)
    if (error) setError(error.message)
    else setDebts((prev) => prev.filter((d) => d.id !== id))
  }

  async function updateDebt(id, fields) {
    const { error } = await supabase.from("debts").update(fields).eq("id", id)
    if (error) setError(error.message)
    else fetchDebts()
  }

  async function fetchBudgetLimits() {
    const { data, error } = await supabase.from("budget_limits").select("*")
    if (error) { setError(error.message); return }

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
      return
    }

    setBudgetLimits(data)
  }

  async function saveBudgetLimit(category, limit) {
    const { error } = await supabase
      .from("budget_limits")
      .upsert(
        { user_id: session.user.id, category, monthly_limit: limit },
        { onConflict: "user_id,category" }
      )
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  // Toggle whether a category takes part in the auto-budget. Off = the auto-split
  // skips it and shares its money among the rest.
  async function setCategoryAutoBudget(category, autoBudget) {
    const { error } = await supabase
      .from("budget_limits")
      .update({ auto_budget: autoBudget })
      .eq("user_id", session.user.id)
      .eq("category", category)
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  // Set how often a category's budget resets (daily / weekly / monthly).
  async function setCategoryCadence(category, cadence) {
    const { error } = await supabase
      .from("budget_limits")
      .update({ cadence })
      .eq("user_id", session.user.id)
      .eq("category", category)
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  // Apply an auto-budget: write a batch of { category, monthly_limit } rows in one
  // upsert. Used by the Budget page's "Apply suggested budget" button.
  async function applyBudgetLimits(rows) {
    if (!rows.length) return
    const { error } = await supabase.from("budget_limits").upsert(
      rows.map((r) => ({
        user_id: session.user.id,
        category: r.category,
        monthly_limit: r.monthly_limit,
      })),
      { onConflict: "user_id,category" }
    )
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  async function addBudgetCategory(name) {
    // "Debt" is reserved — it's a passthrough category the budget deliberately
    // ignores, so it must never become a budgetable card.
    if (name.trim().toLowerCase() === DEBT_CATEGORY.toLowerCase()) {
      setError(`"${DEBT_CATEGORY}" is reserved for debt payments and can't be a budget category.`)
      return
    }
    const { error } = await supabase
      .from("budget_limits")
      .insert({ user_id: session.user.id, category: name, monthly_limit: 0 })
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  async function removeBudgetCategory(category) {
    const { error } = await supabase
      .from("budget_limits")
      .delete()
      .eq("user_id", session.user.id)
      .eq("category", category)
    if (error) setError(error.message)
    else fetchBudgetLimits()
  }

  async function fetchLoans() {
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) setError(error.message)
    else setLoans(data)
  }

  async function addLoan(loan) {
    const { error } = await supabase.from("loans").insert([loan])
    if (error) setError(error.message)
    else fetchLoans()
  }

  async function updateLoan(id, fields) {
    const { error } = await supabase.from("loans").update(fields).eq("id", id)
    if (error) setError(error.message)
    else fetchLoans()
  }

  async function deleteLoan(id) {
    const { error } = await supabase.from("loans").delete().eq("id", id)
    if (error) setError(error.message)
    else setLoans((prev) => prev.filter((l) => l.id !== id))
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

    const { error: txError } = await supabase.from("transactions").insert([
      { name: `Debt: ${debt.name}`, amount: paid, type: "expense", is_debt_payment: true, category: DEBT_CATEGORY },
    ])
    if (txError) {
      setError(txError.message)
      return
    }

    if (debt.kind === "lumpsum") {
      await supabase.from("debts").delete().eq("id", debt.id)
    } else if (debt.kind === "credit") {
      const newBalance = Math.max(0, (Number(debt.balance) || 0) - paid)
      const update = { balance: newBalance }
      // If the card tracks a due day, roll it to next month so it stops showing
      // as "due this period" until the next statement (while a balance remains).
      if (debt.due_day && debt.next_due_date && newBalance > 0) {
        update.next_due_date = advanceDue(debt.next_due_date, debt.due_day)
      }
      await supabase.from("debts").update(update).eq("id", debt.id)
    } else {
      const monthsLeft = Math.max(0, (Number(debt.months_left) || 0) - 1)
      await supabase
        .from("debts")
        .update({
          months_left: monthsLeft,
          // Advance the due date only while payments remain.
          next_due_date:
            monthsLeft > 0
              ? advanceDue(debt.next_due_date, debt.due_day)
              : debt.next_due_date,
        })
        .eq("id", debt.id)
    }

    fetchTransactions()
    fetchDebts()
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

  // Load (or clear) the user's data whenever the logged-in user changes.
  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTransactions()
      fetchSalarySettings()
      fetchDebts()
      fetchBudgetLimits()
      fetchLoans()
    } else {
      setTransactions([])
      setSalarySettings(null)
      setDebts([])
      setBudgetLimits([])
      setLoans([])
    }
  }, [session])

  async function signOut() {
    await supabase.auth.signOut()
  }

  // Still checking the session — show nothing rather than a flash of the login form.
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-400">
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
          <Dashboard transactions={transactions} debts={debts} budgetLimits={budgetLimits} loans={loans} salarySettings={salarySettings} />
        )
      case "transactions":
        return (
          <Transactions
            transactions={transactions}
            loading={loading}
            categories={budgetLimits.map((b) => b.category)}
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
    <div className="flex min-h-screen bg-gray-950">
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

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto">
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
