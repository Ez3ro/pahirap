import { createClient } from '@supabase/supabase-js'

// Vite exposes env vars prefixed with VITE_ on import.meta.env.
// These live in .env (which is git-ignored) so secrets stay out of source control.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
