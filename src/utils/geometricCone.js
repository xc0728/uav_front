import { errorMessage } from './http.js'

export function buildGeometricConePayload(form) {
  const ranges = { lon: [-180,180], lat: [-85,85], height: [0,1250000], bottomRadius: [0,5000], topRadius: [0,5000], coneHeight: [0,10000] }
  const payload = {}
  for (const [key,[min,max]] of Object.entries(ranges)) {
    if (form[key] === '' || form[key] == null || !Number.isFinite(Number(form[key])) || Number(form[key]) < min || Number(form[key]) > max) throw new Error(`${key} 请输入有效数值`)
    payload[key] = Number(form[key])
  }
  if (payload.coneHeight <= 0 || payload.bottomRadius + payload.topRadius <= 0) throw new Error('竖直高度必须大于零，两个半径不能同时为零')
  for (const [key,min,max] of [['level',1,21],['maxCells',1,100000]]) {
    if (form[key] === '' || form[key] == null || !Number.isInteger(Number(form[key])) || Number(form[key]) < min || Number(form[key]) > max) throw new Error(`${key} 超出整数范围`)
    payload[key] = Number(form[key])
  }
  return payload
}

export async function requestGeometricCone(form, signal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort',abort,{once:true})
  if (signal?.aborted) controller.abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() },35000)
  try {
    const response = await fetch('/api/multiSource/geometricGrid/getGridByCone', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(buildGeometricConePayload(form)),signal:controller.signal,
    })
    if (!response.ok) throw new Error(await errorMessage(response,'锥形网格化失败'))
    const body = await response.json()
    if (body.status !== 'success' || !Array.isArray(body.data?.cells) || body.data.complete !== true || body.data.truncated !== false
      || body.data.count !== body.data.cells.length) throw new Error(body.message || '网格化响应不完整')
    return body.data
  } catch (error) {
    if (timedOut) throw new Error('网格化超时，请降低层级或缩小尺寸')
    throw error
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
