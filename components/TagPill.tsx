// ─── Tag Pill Component ────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  TODO: '#3b82f6',
  FIXME: '#ef4444',
  HACK: '#f59e0b',
  NOTE: '#6b7280',
  OBS: '#8b5cf6',
  DEBT: '#dc2626',
};

export default function TagPill({ tag, count, active, onClick }: {
  tag: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const color = TAG_COLORS[tag] || '#6b7280';
  return (
    <button
      onClick={onClick}
      className="tag-pill"
      style={{
        background: active ? `${color}22` : 'transparent',
        color: active ? color : '#a1a1aa',
        border: `1px solid ${active ? color + '66' : '#333'}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.background = `${color}22`;
        e.currentTarget.style.borderColor = `${color}66`;
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = '#333';
        }
      } : undefined}
    >
      {tag}
      {count !== undefined && (
        <span style={{ opacity: 0.6, fontSize: '0.6875rem' }}>{count}</span>
      )}
    </button>
  );
}
