// 网格层级颜色：粗网格使用暖色，细网格使用冷色。
const GRID_LEVEL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#65a30d', '#22c55e', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899', '#c084fc',
  '#a78bfa', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3',
  '#312e81', '#1e1b4b', '#0f172a', '#020617',
]

export function getGridColorByLevel(level, fallback = '#3b82f6') {
  const numericLevel = Number(level)
  if (!Number.isInteger(numericLevel) || numericLevel < 0) return fallback
  return GRID_LEVEL_COLORS[numericLevel] || fallback
}

export function resolveGridColor(cell, fallback = '#3b82f6') {
  if (typeof cell?.color === 'string' && cell.color.trim()) return cell.color
  return getGridColorByLevel(cell?.level ?? cell?.z, fallback)
}

export function colorizeGridCells(cells, fallback = '#3b82f6') {
  return (Array.isArray(cells) ? cells : []).map(cell => ({
    ...cell,
    color: resolveGridColor(cell, fallback),
  }))
}

