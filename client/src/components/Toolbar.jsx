const COLORS = ['#1a1a1a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const SIZES = [2, 5, 10, 20, 40];

export default function Toolbar({ tool, setTool, color, setColor, brushSize, setBrushSize, onUndo, onClear, onExport, users }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white border-b border-gray-200 shadow-sm">
      {/* Tool selector */}
      <div className="flex gap-1">
        <button
          onClick={() => setTool('pen')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tool === 'pen' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >✏️ Pen</button>
        <button
          onClick={() => setTool('eraser')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tool === 'eraser' ? 'bg-gray-900 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >🧹 Eraser</button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Color palette */}
      <div className="flex gap-1">
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('pen'); }}
            style={{ backgroundColor: c, border: color === c ? '2.5px solid #6366f1' : '2px solid #e5e7eb' }}
            className="w-6 h-6 rounded-full transition-transform hover:scale-110 active:scale-95"
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => { setColor(e.target.value); setTool('pen'); }}
          className="w-6 h-6 rounded-full cursor-pointer border-2 border-gray-200 p-0"
          title="Custom color"
        />
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Brush size */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Size</span>
        <input
          type="range"
          min="1"
          max="60"
          value={brushSize}
          onChange={e => setBrushSize(Number(e.target.value))}
          className="w-20 accent-gray-800"
        />
        <span className="text-xs text-gray-500 w-5">{brushSize}</span>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Actions */}
      <button onClick={onUndo} className="px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all">↩ Undo</button>
      <button onClick={onClear} className="px-3 py-1.5 rounded-md text-sm bg-red-50 hover:bg-red-100 text-red-600 transition-all">🗑 Clear</button>
      <button onClick={onExport} className="px-3 py-1.5 rounded-md text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all">💾 Export PNG</button>

      {/* Online users */}
      <div className="ml-auto flex items-center gap-2">
        {users && users.map(u => (
          <span key={u.userId} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            🟢 {u.userName}
          </span>
        ))}
      </div>
    </div>
  );
}
