/**
 * 德清建筑白膜模型生成工具
 * 解析 deqing.shp / deqing.dbf，生成可用于 Cesium 可视化及后端路径计算的建筑白膜数据
 *
 * DBF 字段说明（标准 GIS 建筑数据）：
 *   - Objectid / ID        : 建筑物唯一编号
 *   - Shape_Leng           : 建筑轮廓周长
 *   - Shape_Area           : 建筑基底面积
 *   - height / HEIGHT / floor / HEIGHT_bj / HEIGHT_cs / HIGH / HEIGHT_ss
 *                            : 建筑物高度（米）或楼层数
 */

import * as Cesium from 'cesium'

// ====================== 二进制工具函数 ======================

function readUint32BE(buffer, offset) {
  return (buffer[offset] << 24) | (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) | buffer[offset + 3]
}

function readUint32LE(buffer, offset) {
  return (buffer[offset + 3] << 24) | (buffer[offset + 2] << 16) |
    (buffer[offset + 1] << 8) | buffer[offset]
}

function readInt32LE(buffer, offset) {
  const u = readUint32LE(buffer, offset)
  return u > 0x7fffffff ? u - 0x100000000 : u
}

function readFloat64LE(buffer, offset) {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8)
  return view.getFloat64(0, true)
}

function readCString(buffer, offset, maxLen) {
  let end = offset
  while (end < offset + maxLen && buffer[end] !== 0) end++
  return new TextDecoder('utf-8').decode(buffer.slice(offset, end))
}

function decodeText(raw, fieldName) {
  return new TextDecoder('utf-8', { fatal: false }).decode(raw).trim()
}

// ====================== SHP 解析 ======================

/**
 * 解析 Shapefile 主文件 (.shp)
 * 返回建筑多边形数组: [{ id, coordinates: [[lon,lat], ...] }]
 */
async function parseShapefile(shpBuffer) {
  const buffer = shpBuffer

  // SHP Header (100 bytes)
  const code = readUint32BE(buffer, 0)        // 9994
  const version = readInt32LE(buffer, 28)     // 1000
  const shapeType = readInt32LE(buffer, 32)   // 5 = Polygon

  const minX = readFloat64LE(buffer, 36)
  const minY = readFloat64LE(buffer, 44)
  const maxX = readFloat64LE(buffer, 52)
  const maxY = readFloat64LE(buffer, 60)
  const fileLength = readUint32BE(buffer, 100 - 4) // 实际文件长度（含头）

  console.log(`[BuildingModel] SHP 头信息: version=${version}, shapeType=${shapeType}`)
  console.log(`[BuildingModel] 边界: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`)
  console.log(`[BuildingModel] 文件长度: ${fileLength} (单位=2字节words)`)

  if (shapeType !== 5) {
    throw new Error(`不支持的形状类型: ${shapeType}，期望 5 (Polygon)`)
  }

  const records = []
  let offset = 100 // 跳过头部

  let recordIndex = 0
  let lastGoodOffset = 100
  while (offset + 8 <= buffer.length) {
    const recordNumber = readUint32BE(buffer, offset)    // 记录编号
    const contentLength = readUint32BE(buffer, offset + 4) * 2 // 内容长度（字节）

    offset += 8 // 跳过记录头

    if (offset + contentLength > buffer.length) {
      console.warn(`[BuildingModel] 记录 ${recordIndex} contentLength=${contentLength} 超出缓冲，跳过剩余`)
      break
    }

    const shapeTypeVal = readInt32LE(buffer, offset) // 形状类型

    if (shapeTypeVal === 5) {
      const recordMinX = readFloat64LE(buffer, offset + 4)
      const recordMinY = readFloat64LE(buffer, offset + 12)
      const recordMaxX = readFloat64LE(buffer, offset + 20)
      const recordMaxY = readFloat64LE(buffer, offset + 28)
      const numParts  = readInt32LE(buffer, offset + 36)
      const numPoints = readInt32LE(buffer, offset + 40)

      const parts = []
      for (let i = 0; i < numParts; i++) {
        parts.push(readInt32LE(buffer, offset + 44 + i * 4))
      }

      const coordinates = []
      for (let i = 0; i < numPoints; i++) {
        const x = readFloat64LE(buffer, offset + 44 + numParts * 4 + i * 16)
        const y = readFloat64LE(buffer, offset + 44 + numParts * 4 + i * 16 + 8)
        coordinates.push([x, y])
      }

      records.push({
        id: recordIndex,
        coordinates,
        minLon: recordMinX,
        minLat: recordMinY,
        maxLon: recordMaxX,
        maxLat: recordMaxY,
      })
      lastGoodOffset = offset + contentLength
    } else {
      console.warn(`[BuildingModel] 记录 ${recordIndex} shapeType=${shapeTypeVal}，跳过`)
    }

    // 移动到下一条记录（跳过头部已在前面处理，只需跳过内容）
    offset += contentLength
    recordIndex++
  }

  console.log(`[BuildingModel] SHP 解析完成，共 ${records.length} 条记录`)
  return records
}

// ====================== DBF 解析 ======================

/**
 * 解析 DBF 文件，返回字段定义 + 记录数组
 */
async function parseDBF(dbfBuffer) {
  const originalBuffer = dbfBuffer

  // 检测 UTF-8 BOM (0xEF 0xBB 0xBF)，DBF 文件通常不带 BOM，
  // 但某些 GIS 工具导出的文件会附加 BOM，需跳过
  const hasBOM = dbfBuffer[0] === 0xEF && dbfBuffer[1] === 0xBB && dbfBuffer[2] === 0xBF
  const bomOffset = hasBOM ? 3 : 0

  if (hasBOM) {
    console.log('[BuildingModel] 检测到 UTF-8 BOM，已跳过前3字节')
  }

  // 头部字段从 bomOffset 之后开始读取
  const version = originalBuffer[bomOffset]       // 0x03
  const numRecords = readInt32LE(originalBuffer, bomOffset + 4)
  const headerSize = originalBuffer[bomOffset + 8] | (originalBuffer[bomOffset + 9] << 8)
  const recordSize = originalBuffer[bomOffset + 10] | (originalBuffer[bomOffset + 11] << 8)

  console.log(`[BuildingModel] DBF: version=${version}, records=${numRecords}, headerSize=${headerSize}, recordSize=${recordSize}`)

  // 解析字段描述符（从第 32 字节开始，每字段 32 字节）
  const numFields = Math.floor((headerSize - 32 - 1) / 32)
  const fields = []
  let recordOffset = 1 // 删除标记占 1 字节
  for (let i = 0; i < numFields; i++) {
    const fieldOffset = bomOffset + 32 + i * 32
    const name = readCString(originalBuffer, fieldOffset, 11).replace(/\x00/g, '').trim()
    const type = String.fromCharCode(originalBuffer[fieldOffset + 11])
    const len = originalBuffer[fieldOffset + 16]
    const decimal = originalBuffer[fieldOffset + 17]

    fields.push({ name, type, len, decimal, offset: recordOffset })
    recordOffset += len
  }

  // 找到高度字段（支持多种常见字段名）
  const heightFieldNames = ['HEIGHT', 'HEIGHT_BJ', 'HEIGHT_CS', 'HIGH', 'HEIGHT_SS', 'BUILD_H', 'HEIGHT_BM', 'H', 'FLOOR', 'FLOORS', 'LAYERS', 'BUILDHEIGH', 'HEIGHT_WD', 'HEIGHT_JZ', 'HEI', 'height', 'Height', 'HEI_BJ', 'HEI_JZ']
  let heightField = fields.find(f => heightFieldNames.includes(f.name.toUpperCase()))

  // 如果找不到高度字段，尝试从所有字段推断
  if (!heightField) {
    // 取面积字段Shape_Area/AREA附近的字段作为高度
    const areaField = fields.find(f => f.name.toUpperCase().includes('AREA') || f.name.toUpperCase().includes('SHAPE'))
    if (areaField) {
      const areaIdx = fields.indexOf(areaField)
      for (let i = areaIdx + 1; i < fields.length; i++) {
        if (fields[i].type === 'N' || fields[i].type === 'F') {
          heightField = fields[i]
          console.log(`[BuildingModel] 尝试使用字段 "${heightField.name}" 作为高度`)
          break
        }
      }
    }
  }

  if (!heightField) {
    // 没有高度字段，给所有建筑一个默认高度
    console.warn('[BuildingModel] 未找到高度字段，使用默认高度 15m')
    return { fields, records: [], heightField: null, defaultHeight: 15 }
  }

  console.log(`[BuildingModel] 高度字段: "${heightField.name}", 类型=${heightField.type}, 长度=${heightField.len}`)

  // 解析记录（从 headerSize 开始，每条记录以 0x20 开头）
  const records = []
  for (let r = 0; r < numRecords; r++) {
    const recordOffset = bomOffset + headerSize + r * recordSize
    if (recordOffset + recordSize > originalBuffer.length) break

    // 删除标记 (0x20=正常, 0x2A=删除)
    const deleted = originalBuffer[recordOffset] === 0x2A
    if (deleted) continue

    const record = {}
    for (const field of fields) {
      const raw = originalBuffer.slice(recordOffset + 1 + field.offset, recordOffset + 1 + field.offset + field.len)
      let value = decodeText(raw, field.name)

      if (field.name === heightField.name) {
        // 高度字段：尝试解析为数值
        if (field.type === 'N' || field.type === 'F' || field.type === 'I') {
          value = parseFloat(value) || 0
        } else if (field.type === 'C') {
          value = parseFloat(value) || 0
        }
      }

      record[field.name] = value
    }

    records.push(record)
  }

  console.log(`[BuildingModel] DBF 解析完成，${records.length} 条记录`)
  console.log(`[BuildingModel] DBF 字段列表:`, fields.map(f => f.name))
  return { fields, records, heightField, defaultHeight: 0 }
}

// ====================== 白膜数据生成 ======================

/**
 * 生成白膜数据（供 Cesium 可视化使用）
 * @param {Array} geometries - SHP 解析的建筑轮廓
 * @param {Array} attributes - DBF 解析的建筑属性
 * @param {Object} heightField - 高度字段定义
 * @param {Object} options - 配置选项
 * @returns {Array} 白膜建筑数组
 */
function generateBuildingModels(geometries, attributes, heightField, options = {}) {
  const {
    defaultHeight = 15,     // 无高度时的默认高度（米）
    minHeight = 3,          // 最小建筑高度（米），避免过矮
    maxHeight = 300,        // 最大建筑高度（米）
    heightScale = 1,        // 高度缩放系数（用于楼层数→米转换，如每层3米）
    heightUnit = 'meter',   // 'meter' | 'floor' (楼层)
  } = options

  // 如果 DBF 记录数和 SHP 几何数不匹配，尝试按索引对齐
  const buildingModels = []

  geometries.forEach((geom, idx) => {
    let height = defaultHeight

    if (attributes && attributes.length > 0) {
      const attr = attributes[idx % attributes.length]
      if (attr && heightField) {
        const rawHeight = attr[heightField.name]
        if (typeof rawHeight === 'number' && !isNaN(rawHeight) && rawHeight > 0) {
          if (heightUnit === 'floor') {
            height = rawHeight * heightScale
          } else {
            height = rawHeight
          }
        }
      }
    }

    // 限制高度范围
    height = Math.max(minHeight, Math.min(maxHeight, height))

    // 计算建筑中心点
    let sumLon = 0, sumLat = 0
    geom.coordinates.forEach(coord => {
      sumLon += coord[0]
      sumLat += coord[1]
    })
    const centerLon = sumLon / geom.coordinates.length
    const centerLat = sumLat / geom.coordinates.length

    // 计算基底高程（地表高程，Cesium 会自动处理）
    const baseHeight = 0

    // 从 DBF 属性中提取 type 和 name
    let buildingType = 0
    let buildingName = null
    if (attributes && attributes.length > 0) {
      const attr = attributes[idx % attributes.length]
      if (attr) {
        buildingType = parseInt(attr['type'] || attr['TYPE'] || attr['Type'] || 0) || 0
        let raw = attr['name_poi'] || attr['NAME_POI'] || attr['Name_Poi'] || null
        // 去掉开头的乱码替换字符（U+FFFD），通常是编码问题导致
        if (raw) {
          raw = raw.replace(/^\uFFFD+/, '').trim()
          // DBF 编码导致医院名称第一个字丢失，根据截断后的名称补全
          const hospitalNamePatch = {
            '丰社区卫生服务站': '新丰社区卫生服务站',
            '阳社区卫生服务站': '舞阳社区卫生服务站',
            '康路街道春晖社区卫生服务站': '武康路街道春晖社区卫生服务站',
            '康街道祥和永兴社区卫生服务站': '武康街道祥和永兴社区卫生服务站',
            '山社区卫生服务站': '狮山社区卫生服务站',
            '琳安宁疗护医院': '福琳安宁疗护医院',
            '桥社区卫生服务站': '丰桥社区卫生服务站',
            '清长德医院': '德清长德医院',
            '清友好医院': '德清友好医院',
            '清县中医院': '德清县中医院',
            '清县武康街道社区卫生服务中心': '德清县武康街道社区卫生服务中心',
            '清县人民医院': '德清县人民医院',
            '清康富医院': '德清康富医院',
          }
          if (hospitalNamePatch[raw]) {
            raw = hospitalNamePatch[raw]
          }
          buildingName = raw || null
        }
      }
    }

    buildingModels.push({
      id: `building_${idx}`,
      index: idx,
      type: buildingType,      // 1=医院
      name: buildingName,      // 医院名称
      height: Math.round(height * 100) / 100,  // 保留2位小数
      baseHeight,
      center: [
        Math.round(centerLon * 1e6) / 1e6,
        Math.round(centerLat * 1e6) / 1e6,
      ],
      // 闭合的建筑轮廓坐标（首尾相连，用于 Cesium）
      coordinates: (() => {
        const coords = geom.coordinates.map(c => [
          Math.round(c[0] * 1e6) / 1e6,
          Math.round(c[1] * 1e6) / 1e6,
        ])
        // 确保闭合
        if (coords.length > 0) {
          const first = coords[0]
          const last = coords[coords.length - 1]
          if (first[0] !== last[0] || first[1] !== last[1]) {
            coords.push([...first])
          }
        }
        return coords
      })(),
      // 原始边界
      bounds: {
        minLon: geom.minLon,
        minLat: geom.minLat,
        maxLon: geom.maxX || geom.maxLon,
        maxLat: geom.maxY || geom.maxLat,
      },
    })
  })

  return buildingModels
}

// ====================== Cesium 可视化 ======================

/**
 * 在 Cesium Viewer 上绘制建筑白膜
 * @param {Cesium.Viewer} viewer
 * @param {Array} buildingModels - 白膜建筑数据
 * @param {Object} options - 样式配置
 */
function drawBuildingModelsOnMap(viewer, buildingModels, options = {}) {
  const {
    color = Cesium.Color.CYAN,
    opacity = 0.55,
    outline = true,
    outlineColor = Cesium.Color.CYAN,
    outlineOpacity = 0.9,
    outlineWidth = 1.5,
    showLabels = false,
    minHeightToShow = 0,
    maxHeightToShow = Infinity,
    hospitalColor = Cesium.Color.RED,
    hospitalOpacity = 0.7,
    hospitalLabelFont = '13px sans-serif',
    hospitalLabelColor = Cesium.Color.YELLOW,
  } = options

  const entityIds = []

  buildingModels.forEach((building, idx) => {
    // 按高度过滤
    if (building.height < minHeightToShow || building.height > maxHeightToShow) return
    if (!building.coordinates || building.coordinates.length < 3) return

    // 构建 Cesium 层级
    const positions = building.coordinates.map(coord =>
      Cesium.Cartesian3.fromDegrees(coord[0], coord[1], building.baseHeight)
    )

    // 区分医院（type===1）和普通建筑
    const isHospital = building.type === 1
    const fillColor = isHospital ? hospitalColor : color
    const fillOpacity = isHospital ? hospitalOpacity : opacity

    const entityId = `building_model_${idx}`
    const entity = viewer.entities.add({
      id: entityId,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: fillColor.withAlpha(fillOpacity),
        outline: false,
        height: building.baseHeight,
        extrudedHeight: building.height,
        closeTop: true,
        closeBottom: true,
      },
      properties: {
        buildingId: building.id,
        height: building.height,
        type: building.type,
        name: building.name,
      },
    })
    entityIds.push(entityId)

    // 标签：普通建筑高度标签 / 医院名称标签
    if (isHospital && building.name) {
      // 医院：显示医院名称
      viewer.entities.add({
        id: `${entityId}_hospital_label`,
        position: Cesium.Cartesian3.fromDegrees(
          building.center[0],
          building.center[1],
          building.height + 5
        ),
        label: {
          text: building.name,
          font: 'bold 18px Microsoft YaHei',
          fillColor: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1000, 1.0, 8000, 0.5),
        },
      })
      entityIds.push(`${entityId}_hospital_label`)
    } else if (showLabels && building.height > 20) {
      // 普通建筑：显示高度
      viewer.entities.add({
        id: `${entityId}_label`,
        position: Cesium.Cartesian3.fromDegrees(
          building.center[0],
          building.center[1],
          building.height
        ),
        label: {
          text: `${building.height.toFixed(1)}m`,
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -5),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      entityIds.push(`${entityId}_label`)
    }
  })

  console.log(`[BuildingModel] 已在地图上绘制 ${entityIds.length / (showLabels ? 2 : 1)} 个建筑`)
  return entityIds
}

// ====================== 主入口 ======================

/**
 * 加载并生成德清建筑白膜模型
 * @param {Object} options
 * @returns {Promise<{ buildings: Array, summary: Object }>}
 */
export async function loadDeqingBuildings(options = {}) {
  const shpUrl = options.shpUrl || '/deqing/deqing4.shp'
  const dbfUrl = options.dbfUrl || '/deqing/deqing4.dbf'

  console.log('[BuildingModel] 开始加载德清建筑数据...')
  console.log('[BuildingModel] SHP URL:', shpUrl)
  console.log('[BuildingModel] DBF URL:', dbfUrl)

  // 并行加载 SHP 和 DBF
  const [shpResp, dbfResp] = await Promise.all([
    fetch(shpUrl),
    fetch(dbfUrl),
  ])

  if (!shpResp.ok) throw new Error(`SHP 文件加载失败: ${shpUrl}`)
  if (!dbfResp.ok) throw new Error(`DBF 文件加载失败: ${dbfUrl}`)

  const [shpBuffer, dbfBuffer] = await Promise.all([
    shpResp.arrayBuffer(),
    dbfResp.arrayBuffer(),
  ])

  console.log('[BuildingModel] SHP buffer 大小:', shpBuffer.byteLength)
  console.log('[BuildingModel] DBF buffer 大小:', dbfBuffer.byteLength)

  // 解析
  const geometries = await parseShapefile(new Uint8Array(shpBuffer))
  const { records, heightField, defaultHeight } = await parseDBF(new Uint8Array(dbfBuffer))

  // 生成白膜
  const buildings = generateBuildingModels(geometries, records, heightField, {
    defaultHeight: options.defaultHeight || 15,
    minHeight: options.minHeight || 0,
    maxHeight: options.maxHeight || 300,
    heightScale: options.heightScale || 1,
    heightUnit: options.heightUnit || 'meter',
  })

  const heights = buildings.map(b => b.height)
  const summary = {
    totalBuildings: buildings.length,
    avgHeight: heights.reduce((a, b) => a + b, 0) / heights.length,
    minHeight: Math.min(...heights),
    maxHeight: Math.max(...heights),
    hasHeightField: !!heightField,
    heightFieldName: heightField?.name || null,
    defaultHeight,
  }

  console.log('[BuildingModel] 白膜生成完成:', summary)

  return { buildings, summary, heightField, defaultHeight }
}

/**
 * 导出白膜数据为 JSON 文件（用于后端路径计算）
 * @param {Array} buildings
 * @param {string} outputPath - 保存路径（相对 public/）
 */
export function exportBuildingModelJSON(buildings, outputPath = 'deqing/deqing-building-model.json') {
  const data = {
    type: 'FeatureCollection',
    metadata: {
      source: 'deqing shp/dbf',
      buildingCount: buildings.length,
      coordinateSystem: 'WGS84',
      heightUnit: 'meter',
      generatedAt: new Date().toISOString(),
    },
    features: buildings.map(b => ({
      type: 'Feature',
      id: b.id,
      properties: {
        id: b.id,
        height: b.height,
        baseHeight: b.baseHeight,
        center: b.center,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [b.coordinates],
      },
    })),
  }

  // 转为 Blob 并触发下载（前端用）
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outputPath.split('/').pop()
  a.click()
  URL.revokeObjectURL(url)

  console.log(`[BuildingModel] 已导出白膜 JSON 到 ${outputPath}，共 ${buildings.length} 个建筑`)
  return data
}

export {
  parseShapefile,
  parseDBF,
  generateBuildingModels,
  drawBuildingModelsOnMap,
}
