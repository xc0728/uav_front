// 来源同时决定后端的独立模型网格表；须与 ModelGridSupport.h 保持一致。
export const MODEL_GRID_SOURCES = [
  { value: 'osgb', label: '倾斜摄影', tablePrefix: 'osgbgrid_', theme: 'structure', featureType: 'osgb_model', color: '#64748b', queryLevel: 18 },
  // 保留历史来源与建筑类型编码，只统一业务名称，旧数据无需迁移。
  { value: 'lod13', label: '建筑物', tablePrefix: 'lod13grid_', theme: 'structure', featureType: 'lod13_building', color: '#2563eb', queryLevel: 17 },
  { value: 'communication', label: '通信设施', tablePrefix: 'communicationgrid_', theme: 'communication', featureType: 'communication_facility', color: '#14b8a6', queryLevel: 17 },
  { value: 'navigation', label: '导航设施', tablePrefix: 'navigationgrid_', theme: 'navigation', featureType: 'navigation_facility', color: '#8b5cf6', queryLevel: 17 },
  { value: 'surveillance', label: '监视设施', tablePrefix: 'surveillancegrid_', theme: 'surveillance', featureType: 'surveillance_facility', color: '#f43f5e', queryLevel: 17 },
  { value: 'power', label: '输电设施', tablePrefix: 'powergrid_', theme: 'utility', featureType: 'power_facility', color: '#f59e0b', queryLevel: 17 },
]

export function getModelGridSource(value) {
  return MODEL_GRID_SOURCES.find(source => source.value === value) || MODEL_GRID_SOURCES[0]
}

export const LEGACY_BUILDING_MODEL_SOURCE = MODEL_GRID_SOURCES.find(source => source.value === 'lod13')
