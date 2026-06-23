import { useState } from "react"
import { supabase } from "../lib/supabase"
import InstallButton from "./InstallButton"

// One screen that handles both signing in and signing up.
// We flip between the two with the `mode` state instead of a second component.
export default function Auth() {
  const [mode, setMode] = useState("signin") // "signin" | "signup"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage("Account created. Check your email to confirm, then sign in.")
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      // On success we do nothing here — the auth listener in App.jsx notices
      // the new session and swaps this screen for the tracker automatically.
    }

    setLoading(false)
  }

  // Google OAuth: hand off to Google, then Supabase redirects back to our app
  // (redirectTo = wherever we're running, so it works on both localhost and the
  // live site). On return, the auth listener in App.jsx picks up the session and
  // swaps this screen for the tracker — same as a password sign-in.
  async function handleGoogle() {
    setError(null)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
    if (error) setError(error.message)
  }

  return (
    // Mobile: a single non-scrolling screen (h-screen + overflow-hidden), tightened
    // so the hook, the 4 features and the form all fit one phone viewport.
    // Desktop: the same centred pitch + login, with room to breathe.
    <div className="flex h-screen items-center justify-center overflow-hidden bg-gray-100 px-4 dark:bg-gray-900 md:h-auto md:min-h-screen md:overflow-visible md:py-10">
      <div className="w-full max-w-md">
        <div>
          {/* Pitch — explains the product before asking anyone to sign up. */}
          <div className="text-gray-900 dark:text-gray-100">
            <h1 className="text-2xl font-bold sm:text-3xl">A payday budget planner</h1>
            <p className="mt-2 text-base font-medium text-gray-700 dark:text-gray-300 sm:text-lg">
              Most budgeting apps assume you get paid monthly.
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              This one budgets <span className="font-semibold text-blue-600 dark:text-blue-400">payday to payday</span> — so you
              know exactly how much you can spend before your next sweldo.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-1.5 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-2">
              {[
                "Payday-to-payday budgeting",
                "Debt snowball & avalanche",
                "Track money you've lent out",
                "Install it on your phone",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="text-green-500" aria-hidden>✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Login / signup card */}
          <div className="mt-5 w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
            {mode === "signin" ? "Welcome back" : "Create your free account"}
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {mode === "signin" ? "Sign in to your account" : "Takes a few seconds — no card needed"}
          </p>

          {/* Google OAuth — the fast path. */}
          <button
            type="button"
            onClick={handleGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            or
            <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin")
            setError(null)
            setMessage(null)
          }}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
          </button>
          </div>

          {/* Install the PWA — a quiet secondary action below the card, so it
              doesn't compete with sign in. Renders nothing when the app is
              already installed or not installable. */}
          <InstallButton alwaysShow className="mt-4" />
        </div>
      </div>
    </div>
  )
}
