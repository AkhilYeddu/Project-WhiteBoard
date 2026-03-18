const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('⚠️ Supabase credentials not found. Strokes will not be saved.');
}

async function saveStroke(roomId, stroke) {
  if (!supabase) return;
  // Ensure room exists
  await supabase.from('rooms').upsert({ id: roomId }, { onConflict: 'id' });

  const { error } = await supabase.from('strokes').insert({
    id: stroke.id,
    room_id: roomId,
    user_id: stroke.userId,
    stroke_data: stroke
  });
  if (error) console.error('Save stroke error:', error.message);
}

async function loadStrokes(roomId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('strokes')
    .select('stroke_data')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) { console.error('Load strokes error:', error.message); return []; }
  return data.map(row => row.stroke_data);
}

async function deleteStroke(strokeId) {
  if (!supabase) return;
  const { error } = await supabase.from('strokes').delete().eq('id', strokeId);
  if (error) console.error('Delete stroke error:', error.message);
}

async function clearRoomStrokes(roomId) {
  if (!supabase) return;
  const { error } = await supabase.from('strokes').delete().eq('room_id', roomId);
  if (error) console.error('Clear room error:', error.message);
}

module.exports = { saveStroke, loadStrokes, deleteStroke, clearRoomStrokes };
