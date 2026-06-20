import TransactionForm from "../components/TransactionForm"
import TransactionList from "../components/TransactionList"

// The full add + list view. App still owns the data and the add/delete/update
// functions; this view just receives them as props and lays them out.
export default function Transactions({ transactions, loading, categories, onAdd, onDelete, onUpdate }) {
  return (
    <div className="space-y-8">
      <TransactionForm categories={categories} onAdd={onAdd} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-300">All transactions</h2>
        {loading ? (
          <p className="py-8 text-center text-gray-400">Loading…</p>
        ) : (
          <TransactionList
            transactions={transactions}
            categories={categories}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        )}
      </div>
    </div>
  )
}
