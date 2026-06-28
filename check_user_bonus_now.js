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
  const userId = '18f03477-3340-4956-9c4f-54b416d79af3';

  // Check finalized count
  const { data: standings } = await supabase
    .from('group_standings')
    .select('finalized');
  const finalizedCount = standings ? standings.filter(s => s.finalized).length : 0;
  console.log(`Finalized group standings rows: ${finalizedCount} / 48`);

  // Check user bonus for Nacho
  const { data: bonus } = await supabase
    .from('user_bonus')
    .select('*')
    .eq('user_id', userId);
  console.log('Nacho user_bonus:', bonus);

  // Check all user_bonus rows
  const { data: allBonus } = await supabase
    .from('user_bonus')
    .select('*');
  console.log(`Total user_bonus rows in DB: ${allBonus ? allBonus.length : 0}`);
  if (allBonus && allBonus.length > 0) {
    console.log('Sample bonus rows:', allBonus.slice(0, 5));
  }

  // Check Nacho's ranking view record
  const { data: rankingRow } = await supabase
    .from('ranking')
    .select('*')
    .eq('user_id', userId)
    .single();
  console.log('Nacho ranking view row:', rankingRow);
}

run();
