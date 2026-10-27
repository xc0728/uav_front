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
const WIND_SPEED_LEGEND = Object.freeze([
  { min: -Infinity, label: '<1.5', color: '#94a3b8' },
  { min: 1.5, label: '1.5–3', color: '#38bdf8' },
  { min: 3, label: '3–5', color: '#22c55e' },
  { min: 5, label: '5–8', color: '#facc15' },
  { min: 8, label: '8–12', color: '#f97316' },
  { min: 12, label: '≥12 m/s', color: '#dc2626' },
])
const WIND_COMPONENT_LEGEND = Object.freeze([
  { min: -Infinity, label: '<-8', color: '#312e81' },
  { min: -8, label: '-8–-3', color: '#2563eb' },
  { min: -3, label: '-3–3', color: '#94a3b8' },
  { min: 3, label: '3–8', color: '#f97316' },
  { min: 8, label: '≥8 m/s', color: '#b91c1c' },
])
const WIND_DIRECTION_LEGEND = Object.freeze([
  { min: -Infinity, label: '北 0–45°', color: '#3b82f6' },
  { min: 45, label: '东 45–135°', color: '#22c55e' },
  { min: 135, label: '南 135–225°', color: '#f97316' },
  { min: 225, label: '西 225–315°', color: '#a855f7' },
  { min: 315, label: '北 315–360°', color: '#3b82f6' },
])
const TEMPERATURE_LEGEND = Object.freeze([
  { min: -Infinity, label: '<0 ℃', color: '#4338ca' },
  { min: 0, label: '0–10 ℃', color: '#2563eb' },
  { min: 10, label: '10–20 ℃', color: '#06b6d4' },
  { min: 20, label: '20–30 ℃', color: '#22c55e' },
  { min: 30, label: '30–35 ℃', color: '#f97316' },
  { min: 35, label: '≥35 ℃', color: '#dc2626' },
])
const HUMIDITY_LEGEND = Object.freeze([
  { min: -Infinity, label: '<20%', color: '#d97706' },
  { min: 20, label: '20–40%', color: '#facc15' },
  { min: 40, label: '40–60%', color: '#84cc16' },
  { min: 60, label: '60–80%', color: '#06b6d4' },
  { min: 80, label: '≥80%', color: '#2563eb' },
])
const PRECIPITATION_LEGEND = Object.freeze([
  { min: -Infinity, label: '0 mm', color: '#e2e8f0' },
  { min: 0.1, label: '0.1–10 mm', color: '#7dd3fc' },
  { min: 10, label: '10–25 mm', color: '#38bdf8' },
  { min: 25, label: '25–50 mm', color: '#2563eb' },
  { min: 50, label: '50–100 mm', color: '#7c3aed' },
  { min: 100, label: '≥100 mm', color: '#be123c' },
])
const STATION_PRESSURE_LEGEND = Object.freeze([
  { min: -Infinity, label: '<940 hPa', color: '#4338ca' },
  { min: 940, label: '940–960 hPa', color: '#2563eb' },
  { min: 960, label: '960–980 hPa', color: '#06b6d4' },
  { min: 980, label: '980–1000 hPa', color: '#22c55e' },
  { min: 1000, label: '1000–1020 hPa', color: '#facc15' },
  { min: 1020, label: '≥1020 hPa', color: '#f97316' },
])

export const GRID_ATTRIBUTE_TOPICS = Object.freeze([
  { code: '', label: '航图实体要素' },
  { code: 'noise_zone_day', label: '昼间噪声分区', kind: 'zone', lodAggregation: 'min', lodAggregationLabel: '最不利分区' },
  { code: 'noise_margin_day', label: '昼间噪声裕度', kind: 'margin', unit: 'dB(A)', lodAggregation: 'max', lodAggregationLabel: '最大超标裕度' },
  { code: 'noise_zone_night', label: '夜间噪声分区', kind: 'zone', lodAggregation: 'min', lodAggregationLabel: '最不利分区' },
  { code: 'noise_margin_night', label: '夜间噪声裕度', kind: 'margin', unit: 'dB(A)', lodAggregation: 'max', lodAggregationLabel: '最大超标裕度' },
  { code: 'emf_strength_dbuv_m', label: '通信设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: COMMUNICATION_EMF_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'navigation_emf_dbuv_m', label: '导航设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: NAVIGATION_EMF_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'surveillance_emf_dbuv_m', label: '监视设施电磁场强', kind: 'emf', unit: 'dBμV/m', legend: SURVEILLANCE_EMF_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'wind_speed', label: '风速', kind: 'weather', unit: 'm/s', legend: WIND_SPEED_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'wind_direction', label: '风向', kind: 'weather', unit: '°', legend: WIND_DIRECTION_LEGEND },
  { code: 'wind_u', label: '东西向风速分量', kind: 'weather', unit: 'm/s', legend: WIND_COMPONENT_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'wind_v', label: '南北向风速分量', kind: 'weather', unit: 'm/s', legend: WIND_COMPONENT_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'weather_daily_mean_temperature', label: '日平均气温', kind: 'weather', unit: '℃', legend: TEMPERATURE_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'weather_daily_mean_humidity', label: '日平均相对湿度', kind: 'weather', unit: '%', legend: HUMIDITY_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'weather_daily_precipitation', label: '日累计降水量', kind: 'weather', unit: 'mm', legend: PRECIPITATION_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'weather_daily_mean_wind_speed', label: '日平均风速', kind: 'weather', unit: 'm/s', legend: WIND_SPEED_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
  { code: 'weather_daily_mean_station_pressure', label: '日均本站气压', kind: 'weather', unit: 'hPa', legend: STATION_PRESSURE_LEGEND, lodAggregation: 'avg', lodAggregationLabel: '源格元平均值' },
])

const ATTRIBUTE_BY_CODE = new Map(GRID_ATTRIBUTE_TOPICS.map(item => [item.code, item]))

export function noiseAttributeLabel(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.label || chartAttributeLabel(code)
}

export function gridAttributeLegend(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.legend || []
}

export function gridAttributeLodAggregation(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.lodAggregation || ''
}

export function gridAttributeLodAggregationLabel(code) {
  return ATTRIBUTE_BY_CODE.get(code)?.lodAggregationLabel || ''
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
  if (definition?.kind === 'weather') {
    return `${Number(value).toFixed(2)} ${definition.unit}`
  }
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
