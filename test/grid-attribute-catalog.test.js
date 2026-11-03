import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import { availableGridAttributeGroups, loadGridAttributeCatalog, loadActiveAttributeDatasets } from '../src/utils/gridAttributeCatalog.js'

const dataset = { datasetId: 'airspace', activeVersion: 1, activeLevel: 17 }
const item = { code: 'noise_zone_day', name: '昼间噪声', state: 'active', schemaVersion: 1, temporalMode: 'static', category: 'noise', bindings: [{ datasetId: 'airspace', datasetVersion: 1, level: 17, bindingId: 'binding', projectionRevision: 1 }] }
const jsonResponse = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const aborted = () => new DOMException('aborted', 'AbortError')

function stallUntilAborted(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(aborted())
    else signal.addEventListener('abort', () => reject(aborted()), { once: true })
  })
}

test('catalog and active dataset responses retain bound field choices', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/catalog')
    ? jsonResponse({ data: { items: [item] } })
    : jsonResponse({ data: { datasets: [dataset] } }))
  const [items, datasets] = await Promise.all([loadGridAttributeCatalog(), loadActiveAttributeDatasets()])
  assert.equal(availableGridAttributeGroups(items, datasets[0])[0].topics[0].code, 'noise_zone_day')
  assert.deepEqual(availableGridAttributeGroups(items, { ...dataset, activeVersion: 2 }), [])
})

test('a stalled request times out and releases its loading state', async t => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) => stallUntilAborted(signal))
  await assert.rejects(loadGridAttributeCatalog({ timeoutMs: 5 }), /请求超时/)
  await assert.rejects(loadActiveAttributeDatasets({ timeoutMs: 5 }), /请求超时/)
})

test('timeout also bounds reading the response body', async t => {
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => ({ ok: true, json: () => stallUntilAborted(signal) }))
  await assert.rejects(loadGridAttributeCatalog({ timeoutMs: 5 }), /请求超时/)
})

test('caller cancellation keeps AbortError semantics', async t => {
  t.mock.method(globalThis, 'fetch', (url, { signal }) => stallUntilAborted(signal))
  const controller = new AbortController()
  const request = loadGridAttributeCatalog({ signal: controller.signal })
  controller.abort()
  await assert.rejects(request, error => error.name === 'AbortError')
})

// 执行组件实际刷新函数，验证失败不会清空已加载目录。
function queryCatalogState(fetchItems, fetchDatasets) {
  const source = readFileSync(new URL('../src/components/data-screen/functions/6_AirspaceGridQuery.vue', import.meta.url), 'utf8')
  const functions = source.slice(source.indexOf('function stopAttributeCatalogLoad()'), source.indexOf('onMounted(() =>'))
  const state = {
    chartMode: ref(true), datasetError: ref(''), airspaceGridForm: { datasetId: '' }, attributeCatalogLoading: ref(false), attributeCatalogError: ref(''),
    attributeCatalogItems: ref([item]), trueAltitudeDatasets: ref([dataset]),
    fetchGridAttributeCatalog: fetchItems, loadActiveAttributeDatasets: fetchDatasets,
  }
  const create = new Function(...Object.keys(state), `let attributeCatalogController = null; let attributeCatalogPromise = null; ${functions}; return { refreshQueryCatalog, stopAttributeCatalogLoad }`)
  return { ...state, ...create(...Object.values(state)) }
}

test('failed refresh retains the last successful options and releases the spinner', async () => {
  const state = queryCatalogState(async () => { throw new Error('数据库连接失败') }, async () => [dataset])
  assert.equal(await state.refreshQueryCatalog(), false)
  assert.equal(state.attributeCatalogLoading.value, false)
  assert.equal(state.attributeCatalogItems.value[0].code, 'noise_zone_day')
  assert.equal(state.trueAltitudeDatasets.value[0].datasetId, 'airspace')
  assert.match(state.attributeCatalogError.value, /已保留上次成功加载/)
})

test('retry can recover after failure and accepts a genuinely empty catalog', async () => {
  let fail = true
  const state = queryCatalogState(async () => {
    if (fail) throw new Error('offline')
    return []
  }, async () => [dataset])
  await state.refreshQueryCatalog()
  fail = false
  assert.equal(await state.refreshQueryCatalog(), true)
  assert.equal(state.attributeCatalogError.value, '')
  assert.equal(state.airspaceGridForm.datasetId, 'airspace')
  assert.equal(state.datasetError.value, '')
  assert.deepEqual(state.attributeCatalogItems.value, [])
})

test('aborted old refresh cannot clear the state of a replacement request', async () => {
  const state = queryCatalogState(({ signal }) => signal.aborted ? Promise.reject(aborted()) : stallUntilAborted(signal), async () => [dataset])
  const old = state.refreshQueryCatalog()
  state.stopAttributeCatalogLoad()
  assert.equal(await old, false)
  assert.equal(state.attributeCatalogError.value, '')
  assert.equal(state.attributeCatalogItems.value[0].code, 'noise_zone_day')
})
