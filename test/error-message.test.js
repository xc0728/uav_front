import assert from 'node:assert/strict'
import test from 'node:test'
import { errorMessage } from '../src/utils/http.js'

test('uses the decoded JSON error message', async () => {
  const response = new Response('{"message":"\\u7b2c 0 \\u4e2a"}')
  assert.equal(await errorMessage(response, '请求失败'), '第 0 个')
})

test('falls back to a non-JSON response body', async () => {
  assert.equal(await errorMessage(new Response('Bad Gateway'), '请求失败'), 'Bad Gateway')
})
