const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('--- CHECKING EXTENSIONS AND DB METADATA ---');

  // Let's run a query to check active extensions
  const { data, error } = await supabase.rpc('get_email_by_username', { p_username: 'dummy' }); // just testing RPC execution
  
  // We can execute SQL queries by creating an RPC or checking system catalogs if RLS/security permits.
  // Wait, does Supabase have a way to run arbitrary SQL through an RPC? Let's check existing RPCs.
  const { data: rpcs, error: rpcErr } = await supabase
    .from('pg_proc') // checking if we have permission to read system catalogs
    .select('proname')
    .limit(5);

  if (rpcErr) {
    console.log('Cannot query pg_proc directly:', rpcErr.message);
  } else {
    console.log('Querying catalogs works!', rpcs);
  }
}

run();
