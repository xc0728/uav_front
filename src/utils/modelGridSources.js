// 来源同时决定后端的独立模型网格表；须与 ModelGridSupport.h 保持一致。
export const MODEL_GRID_SOURCES = [
  { value: 'osgb', label: '倾斜摄影', tablePrefix: 'osgbgrid_', theme: 'structure', featureType: 'osgb_model' },
  // 保留历史来源与建筑类型编码，只统一业务名称，旧数据无需迁移。
  { value: 'lod13', label: '建筑物（原 LOD1.3）', tablePrefix: 'lod13grid_', theme: 'structure', featureType: 'lod13_building' },
  { value: 'communication', label: '通信设施', tablePrefix: 'communicationgrid_', theme: 'communication', featureType: 'communication_facility' },
  { value: 'navigation', label: '导航设施', tablePrefix: 'navigationgrid_', theme: 'navigation', featureType: 'navigation_facility' },
  { value: 'surveillance', label: '监视设施', tablePrefix: 'surveillancegrid_', theme: 'surveillance', featureType: 'surveillance_facility' },
  { value: 'power', label: '输电设施', tablePrefix: 'powergrid_', theme: 'utility', featureType: 'power_facility' },
]

export const LEGACY_BUILDING_MODEL_SOURCE = MODEL_GRID_SOURCES.find(source => source.value === 'lod13')
