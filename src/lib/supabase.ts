import { createClient } from '@supabase/supabase-js'

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://omrcddyrpbjsnvqwpsjq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_3zfHtNM_g3sIym0Gzgyj9A_MLfdTkaa',
)

export type Role = 'admin' | 'client'

export interface AppUser {
  id: string
  email: string
  role: Role
  client_id: string | null
  name: string
}
