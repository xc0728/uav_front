import * as Cesium from 'cesium'
import InstancedGridRenderer from './InstancedGridRenderer.js'
import { toAirspaceMapCells } from '../trueAltitudeGrid.js'
import { planningColor } from '../coneRegionQuery.js'

/// 圆锥台专属图层；不操作已有网格、模型或航图集合。
export default class ConeRegionRenderer {
  constructor(viewer) { this.viewer = viewer; this.layers = new Map() }
  remove(id) {
    const layer = this.layers.get(id)
    if (!layer) return
    layer.entities.forEach(e => this.viewer.entities.remove(e))
    layer.primitives.forEach(p => this.viewer.scene.primitives.remove(p))
    this.layers.delete(id)
    this.viewer.scene.requestRender()
  }
  clear() { [...this.layers.keys()].forEach(id => this.remove(id)) }
  point({ id, longitude, latitude, height, labelText = id }) {
    const absolute = Number.isFinite(height)
    const heightReference = absolute ? Cesium.HeightReference.NONE : Cesium.HeightReference.CLAMP_TO_GROUND
    this.remove(id)
    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, absolute ? height : 0),
      point: { pixelSize: 9, color: Cesium.Color.DODGERBLUE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference,
        disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: labelText, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -18),
        heightReference, fillColor: Cesium.Color.WHITE,
        showBackground: true, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    })
    entity.coneRegionId = id
    this.layers.set(id, { entities: [entity], primitives: [] })
  }
  region({ id, region, cells = [], mode = 'surface', selected = false, cellColor = null, labelText = id }) {
    this.remove(id)
    const layer = { entities: [], primitives: [], cells }
    this.layers.set(id, layer)
    const phi = Cesium.Math.toRadians(region.latitude), e2 = 0.00669438002290, a = 6378137
    const east = a * Math.cos(phi) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2) * Math.PI / 180
    const north = a * (1 - e2) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5 * Math.PI / 180
    const coordinate = (radius, angle, z) => [region.longitude + radius * Math.cos(angle) / east,
      region.latitude + radius * Math.sin(angle) / north, region.bottomElevation + z]
    const radius = z => region.bottomRadius + (region.topRadius - region.bottomRadius) * z / region.height
    const cartesian = p => Cesium.Cartesian3.fromDegrees(...p)
    const outline = positions => {
      layer.entities.push(this.viewer.entities.add({ polyline: { positions: positions.map(cartesian), width: 1,
        material: (selected ? Cesium.Color.LIGHTCYAN : Cesium.Color.WHITE).withAlpha(0.65) } }))
    }
    const bands = 12, segments = 40
    for (let j = 0; j <= bands; j++) {
      const z = j * region.height / bands
      outline(Array.from({ length: segments + 1 }, (_, i) => coordinate(radius(z), i * 2 * Math.PI / segments, z)))
    }
    for (let i = 0; i < segments; i += 2) {
      const angle = i * 2 * Math.PI / segments
      outline([coordinate(region.bottomRadius, angle, 0), coordinate(region.topRadius, angle, region.height)])
    }
    const marker = this.viewer.entities.add({ position: cartesian([region.longitude, region.latitude, region.bottomElevation]),
      point: { pixelSize: 8, color: Cesium.Color.DODGERBLUE }, label: { text: labelText, font: '12px sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, 18), fillColor: Cesium.Color.WHITE, showBackground: true } })
    marker.coneRegionId = id; layer.entities.push(marker)
    if (mode === 'cells' && cells.length) {
      const mapped = toAirspaceMapCells(cells).map(cell => ({ ...cell, color: cellColor || planningColor(cell.attributeValue) }))
      const renderer = new InstancedGridRenderer({ cells: mapped, fillAlpha: 0.55, enablePicking: true, denseOutline: false })
      layer.boxRenderer = renderer
      layer.primitives.push(this.viewer.scene.primitives.add(renderer))
    } else if (cells.length) {
      // 规则网格建立局部三维索引；每个展示块按采样位置映射到真实格元，未知不插值。
      const origin = cells.reduce((out, c) => [Math.min(out[0], c.minlon), Math.min(out[1], c.minlat), Math.min(out[2], c.bottom)], [Infinity, Infinity, Infinity])
      const size = [cells[0].maxlon - cells[0].minlon, cells[0].maxlat - cells[0].minlat, cells[0].top - cells[0].bottom]
      const key = p => p.map((v, i) => Math.floor((v - origin[i]) / size[i] + 1e-6)).join(':')
      const index = new Map(cells.map(c => [key([(c.minlon+c.maxlon)/2, (c.minlat+c.maxlat)/2, (c.bottom+c.top)/2]), c]))
      const instances = []
      function patch(vertices, sample) {
        const cell = index.get(key(sample))
        const values = new Float64Array(vertices.flatMap(p => { const c = cartesian(p); return [c.x, c.y, c.z] }))
        const geometry = new Cesium.Geometry({ attributes: { position: new Cesium.GeometryAttribute({
          componentDatatype: Cesium.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values,
        }) }, indices: new Uint16Array(vertices.length === 3 ? [0,1,2] : [0,1,2,0,2,3]),
        primitiveType: Cesium.PrimitiveType.TRIANGLES, boundingSphere: Cesium.BoundingSphere.fromVertices(values) })
        instances.push(new Cesium.GeometryInstance({ geometry, id: { coneRegionId: id, coneCell: cell || null },
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(planningColor(cell?.attributeValue)).withAlpha(0.8)) } }))
      }
      for (let j = 0; j < bands; j++) for (let i = 0; i < segments; i++) {
        const z0 = j * region.height / bands, z1 = (j+1) * region.height / bands
        const t0 = i * 2 * Math.PI / segments, t1 = (i+1) * 2 * Math.PI / segments, zm = (z0+z1)/2
        patch([coordinate(radius(z0),t0,z0), coordinate(radius(z0),t1,z0), coordinate(radius(z1),t1,z1), coordinate(radius(z1),t0,z1)], coordinate(radius(zm),(t0+t1)/2,zm))
      }
      // 顶面按同一格元数据采样，不统一填成某个等级。
      for (let ring = 0; ring < 5; ring++) for (let i = 0; i < segments; i++) {
        const r0 = region.topRadius*ring/5, r1 = region.topRadius*(ring+1)/5
        const t0 = i*2*Math.PI/segments,t1=(i+1)*2*Math.PI/segments,z=region.height
        patch([coordinate(r0,t0,z),coordinate(r1,t0,z),coordinate(r1,t1,z),coordinate(r0,t1,z)],coordinate((r0+r1)/2,(t0+t1)/2,z-1e-6))
      }
      layer.primitives.push(this.viewer.scene.primitives.add(new Cesium.Primitive({ geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false }), asynchronous: false })))
    }
    if (selected) {
      this.viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(
        cartesian([region.longitude, region.latitude, region.bottomElevation + region.height / 2]),
        Math.max(region.topRadius, region.bottomRadius, region.height / 2)), {
        duration: 0.7, offset: new Cesium.HeadingPitchRange(0, -0.65, Math.max(region.height, region.topRadius * 2) * 4),
      })
    }
    this.viewer.scene.requestRender()
  }
  pick(picked, ray) {
    const reference = picked?.id
    if (reference?.coneRegionId) return { regionId: reference.coneRegionId, cell: reference.coneCell || null }
    let nearest = null
    for (const [id, layer] of this.layers) {
      if (!layer.boxRenderer || !ray) continue
      const hit = layer.boxRenderer.pickCell(ray)
      if (hit?.cell && (!nearest || hit.distance < nearest.distance)) nearest = {
        distance: hit.distance, regionId: id, cell: layer.cells.find(c => c.code === hit.cell.code),
      }
    }
    // GPU 实例格元沿用已有渲染器的射线拾取；不加入原系统实例列表。
    return nearest
  }
}
