// ─── Priority Badge Component ──────────────────────────────

type Priority = 'critical' | 'high' | 'medium' | 'low' | 'info';

const colors: Record<Priority, { bg: string; text: string; ring: string }> = {
  critical: { bg: 'rgba(220,38,38,0.15)', text: '#fca5a5', ring: '#dc2626' },
  high: { bg: 'rgba(234,88,12,0.15)', text: '#fdba74', ring: '#ea580c' },
  medium: { bg: 'rgba(202,138,4,0.15)', text: '#fde047', ring: '#ca8a04' },
  low: { bg: 'rgba(37,99,235,0.15)', text: '#93c5fd', ring: '#2563eb' },
  info: { bg: 'rgba(107,114,128,0.15)', text: '#d1d5db', ring: '#6b7280' },
};

const labels: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export default function PriorityBadge({ priority, size = 'sm' }: { priority: Priority; size?: 'sm' | 'lg' }) {
  const c = colors[priority];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.ring}33`,
        fontSize: size === 'lg' ? '0.75rem' : '0.6875rem',
        padding: size === 'lg' ? '3px 10px' : '2px 8px',
        borderRadius: '9999px',
        fontWeight: 600,
        letterSpacing: '0.025em',
        whiteSpace: 'nowrap',
      }}
    >
      {labels[priority]}
    </span>
  );
}
