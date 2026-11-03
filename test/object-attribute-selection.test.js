import assert from 'node:assert/strict'
import test from 'node:test'
import { attributeFieldOptions, buildAttributeRequests, collectAttributeObjects, submitAttributeRequests } from '../src/utils/objectAttributes.js'

const objects = count => Array.from({ length: count }, (_, index) => ({
  objectUid: `uid-${index}`, externalKey: `key-${index}`, baseToken: 'revision:1', propertyRevision: 0,
}))

test('whole-scope reading follows all cursors and keeps read-only objects identifiable', async () => {
  const calls = [], progress = []
  const result = await collectAttributeObjects(async cursor => {
    calls.push(cursor)
    return cursor === ''
      ? { items: [{ externalKey: 'a', editable: true }], hasMore: true, nextCursor: 'a' }
      : { items: [{ externalKey: 'b', editable: false }], hasMore: false }
  }, count => progress.push(count))
  assert.deepEqual(calls, ['', 'a'])
  assert.deepEqual(progress, [1, 2])
  assert.deepEqual(result.filter(item => item.editable).map(item => item.externalKey), ['a'])
})

test('whole-scope reading rejects a stuck cursor and a failed later page', async () => {
  await assert.rejects(collectAttributeObjects(async () => ({ items: [], hasMore: true, nextCursor: 'same' })), /游标/)
  await assert.rejects(collectAttributeObjects(async cursor => {
    if (cursor) throw new Error('connection lost')
    return { items: [{ externalKey: 'a' }], hasMore: true, nextCursor: 'a' }
  }), /connection lost/)
})

test('all objects are partitioned within the server cap and classification codes stay text', () => {
  const selected = objects(1201)
  const requests = buildAttributeRequests('STATIC_FEATURE', 'dataset', selected,
    [{ key: '分类代码', value: '0010100' }], { 分类代码: 'string' }, '统一分类')
  assert.deepEqual(requests.map(request => request.items.length), [500, 500, 201])
  assert.equal(new Set(requests.map(request => request.requestId)).size, 3)
  assert.deepEqual(requests.flatMap(request => request.items.map(item => item.externalKey)), selected.map(item => item.externalKey))
  for (const request of requests) {
    assert.equal(request.items[0].set.分类代码, '0010100')
    assert.equal(request.items[0].baseToken, 'revision:1')
    assert.equal(request.items[0].expectedRevision, 0)
  }
  assert.deepEqual(attributeFieldOptions([{ properties: {} }], { 分类代码: 'string' }).additional, ['分类代码'])
})

test('smaller limits and deletion are honored without lifting the hard 500 cap', () => {
  const selected = objects(3)
  const requests = buildAttributeRequests('MODEL_OBJECT', 'lod13', selected,
    [{ key: '分类代码' }], { 分类代码: 'string' }, '删除误填分类', 2, 'delete')
  assert.deepEqual(requests.map(request => request.items.length), [2, 1])
  assert.deepEqual(requests[0].items[0].unset, ['分类代码'])
  assert.equal(Object.hasOwn(requests[0].items[0], 'set'), false)
  assert.throws(() => buildAttributeRequests('STATIC_FEATURE', 'dataset', selected, [], {}, 'reason', 0), /批次上限/)
  const clamped = buildAttributeRequests('STATIC_FEATURE', 'dataset', objects(501), [{ key: '分类代码', value: '1010100' }], { 分类代码: 'string' }, 'reason', 999)
  assert.deepEqual(clamped.map(request => request.items.length), [500, 1])
})

test('a partial submission resumes pending requests with the original idempotency keys', async () => {
  const requests = [{ requestId: 'first' }, { requestId: 'second' }, { requestId: 'unchanged' }]
  const records = requests.map((request, index) => ({ request, changedCount: index === 2 ? 0 : 1, batchId: '' }))
  const calls = [], accepted = []
  await assert.rejects(submitAttributeRequests(records, async request => {
    calls.push(request.requestId)
    if (request.requestId === 'second') throw new Error('timeout')
    return { batchId: 'batch-first' }
  }, id => accepted.push(id)), /timeout/)
  await submitAttributeRequests(records, async request => {
    calls.push(request.requestId)
    return { batchId: 'batch-second' }
  }, id => accepted.push(id))
  assert.deepEqual(calls, ['first', 'second', 'second'])
  assert.deepEqual(accepted, ['batch-first', 'batch-second'])
})
