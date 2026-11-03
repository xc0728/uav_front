const PLANNING_ROOT = 'data/deqing_map/deqing_map_shp1/规划适宜性/'
export const PLANNING_OVERALL_INPUT = `${PLANNING_ROOT}02_适宜性整体评价结果.parquet`
const mapping = (sourceField, attributeCode, attributeName, valueType = 'float') => ({
  sourceField, attributeCode, attributeName, category: 'planning_suitability', valueType, unit: '',
})
export const PLANNING_PARQUET_FILES = [
  { value: 'layers', label: '01 分层评价：要素层与准则层（13项）', input: `${PLANNING_ROOT}01_适宜性分层评价结果_要素层与准则层.parquet`, mappings: [
    mapping('elem__交通专项规划协调', 'planning_elem_transport_coordination', '交通专项规划协调'),
    mapping('elem__人员暴露风险', 'planning_elem_personnel_exposure_risk', '人员暴露风险'),
    mapping('elem__噪声敏感性', 'planning_elem_noise_sensitivity', '噪声敏感性'),
    mapping('elem__国土空间用途协调', 'planning_elem_land_use_coordination', '国土空间用途协调'),
    mapping('elem__地面坠落后果', 'planning_elem_ground_impact_consequence', '地面坠落后果'),
    mapping('elem__常态气象条件', 'planning_elem_weather_conditions', '常态气象条件'),
    mapping('elem__空间障碍风险', 'planning_elem_obstacle_risk', '空间障碍风险'),
    mapping('elem__通信导航监视保障', 'planning_elem_cns_support', '通信导航监视保障'),
    mapping('elem__隐私敏感性', 'planning_elem_privacy_sensitivity', '隐私敏感性'),
    mapping('crit__安全性', 'planning_crit_safety', '安全性准则评价'),
    mapping('crit__社会影响', 'planning_crit_social_impact', '社会影响准则评价'),
    mapping('crit__规划协调', 'planning_crit_planning_coordination', '规划协调准则评价'),
    mapping('crit__运行保障', 'planning_crit_operational_support', '运行保障准则评价'),
  ] },
  { value: 'overall', label: '02 整体规划适宜性：得分与等级（2项）', input: PLANNING_OVERALL_INPUT, mappings: [
    mapping('suitability_score', 'planning_suitability_score', '整体规划适宜性得分'),
    mapping('suitability_level', 'planning_suitability_level', '整体规划适宜性等级', 'int'),
  ] },
  { value: 'zones', label: '03 结晶生长分区（4项，得分沿用02）', input: `${PLANNING_ROOT}03_结晶生长分区结果.parquet`, mappings: [
    mapping('fly_class', 'planning_fly_class', '飞行分类编码', 'int'),
    mapping('subarea', 'planning_subarea', '子区编码', 'int'),
    mapping('zone_id', 'planning_zone_id', '结晶生长分区编号', 'int'),
    mapping('growth_cost', 'planning_growth_cost', '结晶生长代价'),
  ] },
]

export function planningParquetPreset(file = 'overall') {
  const definition = PLANNING_PARQUET_FILES.find(item => item.value === file)
  if (!definition) throw new Error('请选择有效的规划评价文件')
  return {
    planningFile: file, importMode: 'grid_code_exact', input: definition.input,
    codeField: 'grid_id', levelField: '', validField: '', xField: 'x', yField: 'y', zField: 'z',
    verifyCoordinates: true, unmatchedCodePolicy: 'REJECT', level: 17,
    dryRun: false, autoPreflight: true, nullValuePolicy: file === 'zones' ? 'KEEP_NULL' : 'REJECT', source: `planning_suitability_${file}`,
    batchSize: 100000, maxRows: 30000000, registerMissingAttributes: true,
    preflightJobId: '', exactConfirmation: '', classificationCode: '',
    attributeMappingsText: JSON.stringify(definition.mappings, null, 2),
  }
}
export function planningOverallPreset() { return planningParquetPreset('overall') }

export function parquetAttributePayload(f) {
  const body = {
    datasetId: String(f.datasetId).trim(), datasetVersion: Number(f.datasetVersion),
    input: String(f.input).trim(), level: Number(f.level), dryRun: Boolean(f.dryRun),
    source: String(f.source).trim(), batchSize: Number(f.batchSize), maxRows: Number(f.maxRows),
    registerMissingAttributes: Boolean(f.registerMissingAttributes),
  }
  if (f.importMode === 'dqg_noise_v1') return { ...body, template: 'dqg_noise_v1', heightTolerance: Number(f.heightTolerance) }
  Object.assign(body, {
    inputFormat: 'parquet', codeField: String(f.codeField).trim(),
    levelField: String(f.levelField || '').trim(), validField: String(f.validField || '').trim(),
    unmatchedCodePolicy: f.unmatchedCodePolicy, attributeMappings: JSON.parse(f.attributeMappingsText),
  })
  if (f.importMode === 'grid_code_exact') {
    Object.assign(body, {
      gridKeyMode: 'GRID_CODE_EXACT', codeEncoding: 'DQG_OCTAL_STRING', autoPreflight: Boolean(f.autoPreflight),
      coordinateFields: { x: String(f.xField).trim(), y: String(f.yField).trim(), z: String(f.zField).trim() },
      verifyCoordinates: Boolean(f.verifyCoordinates), duplicateCodePolicy: 'REJECT',
      nullValuePolicy: f.nullValuePolicy || 'REJECT', existingBindingPolicy: 'REJECT',
    })
    if (String(f.classificationCode || '').trim()) body.classificationCode = String(f.classificationCode).trim()
    if (!body.dryRun && !body.autoPreflight) {
      if (!String(f.preflightJobId || '').trim()) throw new Error('正式导入需要成功预检任务编号')
      body.preflightJobId = String(f.preflightJobId).trim()
    }
  } else {
    Object.assign(body, {
      gridKeyMode: 'HORIZONTAL_AGL_RANGE', codeEncoding: 'PACKED_UINT64',
      codeTextField: String(f.codeTextField || '').trim(), minAglField: String(f.minAglField).trim(),
      maxAglField: String(f.maxAglField).trim(), verifyCodeConsistency: Boolean(f.verifyCodeConsistency),
    })
  }
  return body
}
