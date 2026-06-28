import TransactionList from "../components/TransactionList"

// List-first transactions view. Adding happens via the bottom sheet (App owns its
// state); this screen shows the history plus a clear "Add transaction" button at
// the top that opens the sheet. `onAddClick` triggers it.
export default function Transactions({ transactions, loading, categories, debts = [], loans = [], budgetLimits = [], salarySettings, onDelete, onUpdate, onAddClick }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-300">All transactions</h2>
        <button
          onClick={onAddClick}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Add transaction
        </button>
      </div>
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading…</p>
      ) : (
        <TransactionList
          transactions={transactions}
          categories={categories}
          debts={debts}
          loans={loans}
          budgetLimits={budgetLimits}
          salarySettings={salarySettings}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      )}
    </div>
  )
}
