export default function UserCursors({ cursors }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Object.entries(cursors).map(([userId, { x, y, userName, color }]) => (
        <div
          key={userId}
          className="absolute transition-all duration-75"
          style={{ left: x, top: y, transform: 'translate(-4px, -4px)' }}
        >
          {/* Cursor dot */}
          <div className="w-3 h-3 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: color }} />
          {/* Name label */}
          <div
            className="absolute top-4 left-2 text-xs text-white px-1.5 py-0.5 rounded-md shadow whitespace-nowrap font-medium"
            style={{ backgroundColor: color }}
          >
            {userName}
          </div>
        </div>
      ))}
    </div>
  );
}
