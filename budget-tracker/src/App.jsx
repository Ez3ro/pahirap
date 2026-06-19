import { useEffect, useState } from "react"
import { SpeedInsights } from '@vercel/speed-insights/react'
import { supabase } from "./lib/supabase"
import Auth from "./components/Auth"
import Sidebar from "./components/Sidebar"
import { NAV_ITEMS } from "./lib/nav"
import Dashboard from "./views/Dashboard"
import Transactions from "./views/Transactions"
import Income from "./views/Income"
import Debts from "./views/Debts"
import { advanceDue } from "./lib/debts"

export default function App() {
  // `session` is null when logged out, or an object with the user when logged in.
  // `authReady` stops us flashing the login screen before we've checked.
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Which sidebar section is showing.
  const [view, setView] = useState("dashboard")

  const [transactions, setTransactions] = useState([])
  const [salarySettings, setSalarySettings] = useState(null)
  const [debts, setDebts] = useState([])
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

  async function addTransaction(transaction) {
    // We don't pass user_id — the table's default (auth.uid()) fills it in.
    const { error } = await supabase.from("transactions").insert([transaction])
    if (error) {
      setError(error.message)
    } else {
      fetchTransactions()
    }
  }

  async function deleteTransaction(id) {
    const { error } = await supabase.from("transactions").delete().eq("id", id)
    if (error) {
      setError(error.message)
    } else {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
    }
  }

  async function fetchSalarySettings() {
    // maybeSingle() returns one row or null (rather than erroring when none exists).
    const { data, error } = await supabase
      .from("salary_settings")
      .select("*")
      .maybeSingle()

    if (!error) setSalarySettings(data)
  }

  async function saveSalarySettings({ periodA, periodB }) {
    // upsert = insert a row, or update it if one already exists for this user
    // (user_id is the primary key, so onConflict targets it).
    const { data, error } = await supabase
      .from("salary_settings")
      .upsert(
        {
          user_id: session.user.id,
          period_a_amount: periodA,
          period_b_amount: periodB,
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

  // Record a debt payment: log it as an expense (which lowers the balance), then
  // for a recurring debt drop one month and move the due date forward; for a
  // lump sum, settle it by removing it.
  async function payDebt(debt) {
    const { error: txError } = await supabase.from("transactions").insert([
      { name: `Debt: ${debt.name}`, amount: debt.amount, type: "expense" },
    ])
    if (txError) {
      setError(txError.message)
      return
    }

    if (debt.kind === "lumpsum") {
      await supabase.from("debts").delete().eq("id", debt.id)
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
    } else {
      setTransactions([])
      setSalarySettings(null)
      setDebts([])
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
          <Dashboard transactions={transactions} debts={debts} onPayDebt={payDebt} />
        )
      case "transactions":
        return (
          <Transactions
            transactions={transactions}
            loading={loading}
            onAdd={addTransaction}
            onDelete={deleteTransaction}
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
          />
        )
      default:
        // Budget — built in the next stage.
        return (
          <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-gray-500">
            This section is coming in the next step.
          </div>
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
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto">
          <h2 className="mb-6 text-2xl font-bold text-gray-100">{activeTitle}</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {renderView()}
        </div>
      </main>
      <SpeedInsights />
    </div>
  )
}
