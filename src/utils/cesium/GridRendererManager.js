export const GRID_RENDERER = Object.freeze({
  ENTITY: 'entity',
  PRIMITIVE: 'primitive',
  INSTANCED: 'instanced',
  // Reserved for the future texture-backed renderer.
  SHADER_TEXTURE: 'shader-texture',
})

export const GRID_RENDERER_THRESHOLDS = Object.freeze({
  primitive: 10_000,
  instanced: 500_000,
})

/**
 * Selects a renderer without coupling the policy to CesiumMap.vue.
 * The legacy `primitive` hint is retained below the instancing threshold so
 * existing DEM requests keep their current batching behaviour.
 */
export function selectGridRenderer(cellCount, options = {}) {
  const count = Math.max(0, Number(cellCount) || 0)
  const requested = options.requested
  const supportsInstancing = options.supportsInstancing !== false

  if (requested === GRID_RENDERER.INSTANCED && supportsInstancing) {
    return GRID_RENDERER.INSTANCED
  }
  if (count >= GRID_RENDERER_THRESHOLDS.instanced && supportsInstancing) {
    return GRID_RENDERER.INSTANCED
  }
  if (requested === GRID_RENDERER.PRIMITIVE || count >= GRID_RENDERER_THRESHOLDS.primitive) {
    return GRID_RENDERER.PRIMITIVE
  }
  return GRID_RENDERER.ENTITY
}

export default class GridRendererManager {
  select(cellCount, options) {
    return selectGridRenderer(cellCount, options)
  }
}
