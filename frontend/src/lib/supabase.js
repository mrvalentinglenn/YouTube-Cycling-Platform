import { createClient } from '@supabase/supabase-js'

// The publishable key only — this is a public, read-only front end. The
// secret key bypasses Row Level Security and must never appear here; see
// CLAUDE.md's Stack section for why the two keys are kept apart.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Thrown at import time, not left to resolve to undefined: a missing key
// here would otherwise surface much later as a query that silently
// returns zero rows, which is a far harder thing to diagnose than a
// startup crash naming exactly which variable is missing.
if (!supabaseUrl) {
  throw new Error(
    'VITE_SUPABASE_URL is not set. Check frontend/.env against frontend/.env.example.',
  )
}
if (!supabasePublishableKey) {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY is not set. Check frontend/.env against frontend/.env.example.',
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
