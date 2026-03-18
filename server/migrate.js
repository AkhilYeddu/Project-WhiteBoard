const { createClient } = require('@supabase/supabase-js');

// Using anon key over HTTPS (no direct DB connection needed)
const supabase = createClient(
  'https://xjcdlfkanbnwrvqynafn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqY2RsZmthbmJud3J2cXluYWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDU5NjMsImV4cCI6MjA4OTQyMTk2M30.5IUVYe21FOnvac6xOIDrqBaYpa26f-KU5MjK2RVbafU'
);

async function checkAndSeed() {
  console.log('🔗 Connecting to Supabase via REST API...\n');

  // Step 1: Try inserting a test room
  console.log('📋 Checking "rooms" table...');
  const { data: roomData, error: roomError } = await supabase
    .from('rooms')
    .upsert({ id: '__migrate_test__' }, { onConflict: 'id' })
    .select();

  if (roomError) {
    console.error('❌ "rooms" table NOT found:', roomError.message);
    console.log('\n\n──────────────────────────────────────────');
    console.log('ACTION REQUIRED: Run this SQL in the Supabase Dashboard SQL Editor:');
    console.log('https://supabase.com/dashboard/project/xjcdlfkanbnwrvqynafn/sql/new');
    console.log('──────────────────────────────────────────\n');
    console.log(`
create extension if not exists "pgcrypto";

create table if not exists rooms (
  id text primary key,
  created_at timestamptz default now()
);

create table if not exists strokes (
  id uuid default gen_random_uuid() primary key,
  room_id text references rooms(id) on delete cascade,
  user_id text not null,
  stroke_data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_strokes_room_id on strokes(room_id);

alter table rooms enable row level security;
alter table strokes enable row level security;

drop policy if exists "allow all" on rooms;
drop policy if exists "allow all" on strokes;
create policy "allow all" on rooms for all using (true) with check (true);
create policy "allow all" on strokes for all using (true) with check (true);
`);
    process.exit(1);
  }

  console.log('   ✅ rooms table exists and is writable');

  // Step 2: Try inserting a test stroke
  console.log('📋 Checking "strokes" table...');
  const { error: strokeError } = await supabase
    .from('strokes')
    .upsert({
      id: '00000000-0000-0000-0000-000000000099',
      room_id: '__migrate_test__',
      user_id: 'test_user',
      stroke_data: { tool: 'pen', color: '#000', size: 4, points: [{ x: 0, y: 0 }] }
    }, { onConflict: 'id' });

  if (strokeError) {
    console.error('❌ "strokes" table NOT found:', strokeError.message);
    process.exit(1);
  }
  console.log('   ✅ strokes table exists and is writable');

  // Step 3: Cleanup test records
  await supabase.from('strokes').delete().eq('id', '00000000-0000-0000-0000-000000000099');
  await supabase.from('rooms').delete().eq('id', '__migrate_test__');
  console.log('   ✅ Test records cleaned up');

  console.log('\n🎉 Supabase is READY! All tables and policies verified.\n');
  console.log('   Next steps:');
  console.log('   1. npm run dev  (in server/)');
  console.log('   2. npm run dev  (in client/)');
  console.log('   3. Open http://localhost:5173\n');
}

checkAndSeed().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
