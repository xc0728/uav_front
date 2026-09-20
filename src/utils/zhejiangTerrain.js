import * as Cesium from 'cesium'

const TILE_SIZE = 256
const HEIGHT_OFFSET = 100
const HEIGHT_SCALE = 100
const MAX_LEVEL = 13

function createFlatTile() {
  return new Float32Array(TILE_SIZE * TILE_SIZE)
}

function decodeTerrainTile(image, x, y, level) {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_SIZE
  canvas.height = TILE_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const scale = 2 ** Math.max(0, level - MAX_LEVEL)
  const sourceSize = TILE_SIZE / scale
  context.drawImage(
    image,
    (x % scale) * sourceSize,
    (y % scale) * sourceSize,
    sourceSize,
    sourceSize,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE,
  )

  const pixels = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
  const heights = new Float32Array(TILE_SIZE * TILE_SIZE)
  for (let i = 0; i < heights.length; i += 1) {
    const offset = i * 4
    heights[i] = (pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2]) / HEIGHT_SCALE - HEIGHT_OFFSET
  }
  return heights
}

// 浙江 DEM 已切为 Web Mercator XYZ 瓦片；编码值为 (海拔 + 100m) × 100。
export function createZhejiangTerrainProvider() {
  return new Cesium.CustomHeightmapTerrainProvider({
    width: TILE_SIZE,
    height: TILE_SIZE,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: '浙江 DEM（Copernicus GLO-30）',
    callback(x, y, level) {
      const scale = 2 ** Math.max(0, level - MAX_LEVEL)
      const tileLevel = Math.min(level, MAX_LEVEL)
      const tileX = Math.floor(x / scale)
      const tileY = Math.floor(y / scale)

      return Cesium.Resource.fetchImage({
        url: `/terrain/zhejiang/${tileLevel}/${tileX}/${tileY}.png`,
        preferImageBitmap: true,
      })
        .then((image) => decodeTerrainTile(image, x, y, level))
        .catch(createFlatTile)
    },
  })
}
