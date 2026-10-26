import {
  chartAttributeLabel,
  visibleChartAttributes,
} from './chartAttributeLabels.js'

const SURVEILLANCE_EMF_LEGEND = Object.freeze([
  { min: -Infinity, label: '<110', color: '#64748b' },
  { min: 110, label: '110–115', color: '#4f46e5' },
  { min: 115, label: '115–120', color: '#3b82f6' },
  { min: 120, label: '120–125', color: '#06b6d4' },
  { min: 125, label: '125–130', color: '#22c55e' },
  { min: 130, label: '130–135', color: '#facc15' },
  { min: 135, label: '135–140', color: '#f97316' },
  { min: 140, label: '≥140 dBμV/m', color: '#dc2626' },
])

// 数值分档仅用于显示场强，不是通信可用性或导航精度的判定阈值。
const COMMUNICATION_EMF_LEGEND = Object.freeze([
  { min: -Infinity, label: '<120', color: '#64748b' },
  { min: 120, label: '120–124', color: '#3b82f6' },
  { min: 124, label: '124–128', color: '#06b6d4' },
  { min: 128, label: '128–132', color: '#22c55e' },
  { min: 132, label: '132–136', color: '#facc15' },
  { min: 136, label: '136–140', color: '#f97316' },
  { min: 140, label: '≥140 dBμV/m', color: '#dc2626' },
])
const NAVIGATION_EMF_LEGEND = Object.freeze([
  { min: -Infinity, label: '<100', color: '#64748b' },
  { min: 100, label: '100–105', color: '#4f46e5' },
  { min: 105, label: '105–110', color: '#3b82f6' },
  { min: 110, label: '110–120', color: '#06b6d4' },
  { min: 120, label: '120–130', color: '#22c55e' },
  { min: 130, label: '130–135', color: '#facc15' },
  { min: 135, label: '135–140', color: '#f97316' },
  { min: 140, label: '≥140 dBμV/m', color: '#dc2626' },
])

export const GRID_ATTRIBUTE_TOPICS = Object.freeze([
  { code: '', label: '航图实体要素' },
  { code: 'noise_zone_day', label: '昼间噪声分区', kind: 'zone' },
  { code: 'noise_margin_day', label: '昼间噪声裕度', kind: 'margin', unit: 'dB(A)' },
  { code: 'noise_zone_night', label: '夜间噪声分区', kind: 'zone' },
  { code: 'noise_margin_night', label: '夜间噪声裕度', kind: 'margin', unit: 'dB(A)' },
  { code: 'emf_strength_dbuv_m', label: '通信设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: COMMUNICATION_EMF_LEGEND },
  { code: 'navigation_emf_dbuv_m', label: '导航设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: NAVIGATION_EMF_LEGEND },
  { code: 'surveillance_emf_dbuv_m', label: '监视设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: SURVEILLANCE_EMF_LEGEND },
])

const ATTRIBUTE_BY_CODE = new Map(GRID_ATTRIBUTE_TOPICS.map(item => [item.code, item]))

export function noiseAttributeLabel(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.label || chartAttributeLabel(code)
}

export function gridAttributeLegend(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.legend || []
}

export function noiseZoneLabel(value) {
  const normalized = Number(value)
  if (normalized === 0) return '不满足'
  if (normalized === 1) return '满足'
  if (normalized === 2) return '优秀'
  return String(value ?? '—')
}

export function formatNoiseAttribute(code, value) {
  if (value === null || value === undefined || value === '') return '—'
  const definition = ATTRIBUTE_BY_CODE.get(code)
  if (definition?.kind === 'zone') return `${noiseZoneLabel(value)}（${value}）`
  if (definition?.kind === 'margin') return `${Number(value).toFixed(2)} ${definition.unit}`
  if (definition?.kind === 'emf') return `${Number(value).toFixed(2)} ${definition.unit}`
  return String(value)
}

export function noiseGridColor(code, value) {
  if (value === null || value === undefined || value === '') return '#64748b'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '#64748b'
  const legend = ATTRIBUTE_BY_CODE.get(code)?.legend
  if (legend) {
    for (let index = legend.length - 1; index >= 0; index--) {
      if (numeric >= legend[index].min) return legend[index].color
    }
  }
  if (ATTRIBUTE_BY_CODE.get(code)?.kind === 'zone') {
    if (numeric === 0) return '#ef4444'
    if (numeric === 1) return '#f59e0b'
    if (numeric === 2) return '#22c55e'
    return '#64748b'
  }
  if (ATTRIBUTE_BY_CODE.get(code)?.kind === 'emf') {
    if (numeric >= 140) return '#dc2626'
    if (numeric >= 136) return '#f97316'
    if (numeric >= 132) return '#facc15'
    if (numeric >= 128) return '#22c55e'
    if (numeric >= 124) return '#06b6d4'
    if (numeric >= 120) return '#3b82f6'
    return '#64748b'
  }
  // 裕度大于 0 表示超标；负值越大，噪声余量越充足。
  if (numeric > 0) return '#ef4444'
  if (numeric > -5) return '#f59e0b'
  if (numeric > -10) return '#84cc16'
  return '#16a34a'
}

export function visibleNoiseAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object') return []
  const entries = visibleChartAttributes(attributes)
  const entriesByCode = new Map(entries.map(entry => [String(entry[0]).trim().toLowerCase(), entry]))
  const topicCodes = new Set(GRID_ATTRIBUTE_TOPICS.filter(item => item.code).map(item => item.code.toLowerCase()))
  const topicAttributes = GRID_ATTRIBUTE_TOPICS.flatMap((item) => {
    if (!item.code) return []
    const entry = entriesByCode.get(item.code.toLowerCase())
    return entry ? [{ ...item, value: entry[1] }] : []
  })
  const otherAttributes = entries
    .filter(([key]) => !topicCodes.has(String(key).trim().toLowerCase()))
    .map(([code, value]) => ({ code, label: chartAttributeLabel(code), value }))

  return topicAttributes.concat(otherAttributes)
}
