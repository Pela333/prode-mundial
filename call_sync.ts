import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Leer y parsear .env.local
const envContent = fs.readFileSync('.env.local', 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    let value = match[2] ? match[2].trim() : ''
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    env[match[1]] = value
  }
})

// Configurar variables de entorno
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
process.env.FOOTBALL_DATA_API_KEY = env.FOOTBALL_DATA_API_KEY

import { syncFromApi } from '@/lib/api/sync'

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  console.log('--- EMPEZANDO SYNC ---')
  try {
    const report = await syncFromApi(supabase, { bypassCache: true })
    console.log('Sync Report:', JSON.stringify(report, null, 2))
  } catch (err) {
    console.error('Error durante el sync:', err)
  }
  console.log('--- SYNC COMPLETADO ---')
}

run()
