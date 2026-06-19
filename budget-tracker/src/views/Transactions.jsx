import TransactionForm from "../components/TransactionForm"
import TransactionList from "../components/TransactionList"

// The full add + list view. App still owns the data and the add/delete
// functions; this view just receives them as props and lays them out.
export default function Transactions({ transactions, loading, onAdd, onDelete }) {
  return (
    <div>
      <TransactionForm onAdd={onAdd} />

      <h2 className="mb-3 mt-8 text-lg font-semibold text-gray-300">
        All transactions
      </h2>
      {loading ? (
        <p className="py-8 text-center text-gray-400">Loading…</p>
      ) : (
        <TransactionList transactions={transactions} onDelete={onDelete} />
      )}
    </div>
  )
}
