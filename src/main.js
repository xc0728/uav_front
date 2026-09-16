import './assets/main.css'

import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

import App from './App.vue'

// 全局接口耗时统计：包装 fetch，为所有功能模块的请求输出往返耗时（含网络延迟 + 后端计算）
const rawFetch = window.fetch.bind(window)
window.fetch = async function (...args) {
  const t0 = performance.now()
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
  const method = (args[1]?.method || 'GET').toUpperCase()
  try {
    const resp = await rawFetch(...args)
    console.log(`[接口耗时] ${method} ${url}: ${(performance.now() - t0).toFixed(1)} ms (HTTP ${resp.status})`)
    return resp
  } catch (err) {
    // AbortError 是动态缩放等场景主动取消请求，不算真正失败，降级为 debug 日志
    if (err?.name === 'AbortError') {
      console.debug(`[接口耗时] ${method} ${url} 已取消: ${(performance.now() - t0).toFixed(1)} ms`)
    } else {
      console.error(`[接口耗时] ${method} ${url} 请求失败: ${(performance.now() - t0).toFixed(1)} ms`, err)
    }
    throw err
  }
}

createApp(App).use(ElementPlus).mount('#app')
