// 来源：《要素中英文对照.xlsx》ATTRIBUTEDEF 工作表。
// 同一字段在不同图层存在别名时采用表中的通用名称；同时兼容 Shapefile 的 10 字符截断字段。
const ATTRIBUTE_LABELS = Object.freeze({
  '3Dcoordinates': '控制区域三维格点坐标',
  Address: '地址',
  AirPressure: '气压',
  AirVelocity: '风速',
  CASID: '标识码',
  CloudCover: '云量',
  Description: '描述',
  Descriptio: '描述',
  EA: '完全出现时间',
  EC: '实体编码',
  ED: '完全消失时间',
  ID: '标识码',
  IsBirdPath: '候鸟迁徙路径',
  IsModified: '动态路径调整',
  Location: '位置',
  LowCloudType: '低云类型',
  MJ: '面积',
  MaxElevation: '顶部高程',
  MaxElevati: '顶部高程',
  MeanElevation: '平均高程',
  MeanElevat: '平均高程',
  MiniElevation: '底部高程',
  MiniElevat: '底部高程',
  Name: '名称',
  OpposDirecInterval: '对向飞行间隔',
  POIID: '标识码',
  PriGrade: '航路规划优先级',
  RadiationIntensity: '辐射强度',
  SA: '开始出现时间',
  SD: '开始消失时间',
  SameDirecInterval: '同向飞行间隔',
  Time: '时间戳',
  TransmitAngle: '发散角度',
  TransmitRadius: '发散半径',
  Type: '类型',
  VerticalProbability: '垂直保护概率要求',
  VerticalWeight: '垂直保护场景加权',
  WindDirection: '风向',
  wind_speed: '风速',
  wind_direction: '风向',
  wind_u: '东西向风速分量',
  wind_v: '南北向风速分量',
  wind_nearest_station_distance: '最近气象站距离',
  wind_support_station_count: '支持气象站数量',
  WindShear: '风切变',
  accessibility: '可达性',
  accesslimit: '可达性限制',
  aerosol: '气溶胶',
  aspect: '坡向',
  averageSpeed: '平均通行速度',
  barrier: '障碍情况',
  barrierLoc: '障碍物位置',
  barrierType: '障碍物类型',
  chemicalPollutants: '污染物化学反应',
  circulation: '大气环流',
  curvature: '曲率',
  data: '控制发布日期',
  edgeID: '标识码',
  elevation: '高程',
  event: '控制内容',
  functionClass: '功能等级',
  giveWay: '让行规则',
  greenhouseGas: '温室气体',
  horizontProbability: '水平保护概率要求',
  horizontWeight: '水平保护场景加权',
  humidity: '湿度',
  lowerBuffer: '垂直保护下侧余度',
  modelid: '唯一标识码',
  nodeID: '标识码',
  ownship: '所有权',
  precipitation: '降水',
  privacy_sensitivity: '隐私敏感度',
  population_concentration: '人口聚集度',
  ground_crash_consequence: '地面坠毁后果',
  restrictions: '通行限制',
  roadGradent: '航路倾斜度',
  sizeLimit: '尺寸限制',
  slope: '坡度',
  specialLimit: '特殊限制',
  speedLimit: '速度限制',
  temperature: '温度',
  trafficDirection: '交通流方向',
  trafficFlow: '交通流量',
  upperBuffer: '垂直保护上侧余度',
  visibility: '能见度',
  weather: '天气系统',
  weightLimit: '重量限制',
  widthLeft: '水平保护左半宽',
  widthRight: '水平保护右半宽',
  '位置': '位置',
  OID: '对象编号',
  tjh_featur: '源数据要素编号',
})

const TRAILING_ATTRIBUTE_KEYS = new Set([
  'privacy_sensitivity',
  'population_concentration',
  'ground_crash_consequence',
])

const NORMALIZED_ATTRIBUTE_LABELS = new Map(
  Object.entries(ATTRIBUTE_LABELS).map(([key, label]) => [key.trim().toLowerCase(), label]),
)

function normalizeAttributeKey(key) {
  return String(key).trim().toLowerCase()
}

export function chartAttributeLabel(key) {
  const rawKey = String(key)
  return ATTRIBUTE_LABELS[rawKey]
    || NORMALIZED_ATTRIBUTE_LABELS.get(normalizeAttributeKey(rawKey))
    || rawKey.trim()
}

export function hasChartAttributeValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized !== '' && normalized !== 'null' && normalized !== 'undefined'
  }
  if (Array.isArray(value)) return value.some(hasChartAttributeValue)
  if (typeof value === 'object') return Object.values(value).some(hasChartAttributeValue)
  return true
}

export function visibleChartAttributes(properties) {
  if (!properties || typeof properties !== 'object') return []
  const regularEntries = []
  const trailingEntries = []

  Object.entries(properties).forEach((entry) => {
    const [key, value] = entry
    if (!hasChartAttributeValue(value)) return
    if (TRAILING_ATTRIBUTE_KEYS.has(normalizeAttributeKey(key))) {
      trailingEntries.push(entry)
    } else {
      regularEntries.push(entry)
    }
  })

  return regularEntries.concat(trailingEntries)
}

export { ATTRIBUTE_LABELS }
