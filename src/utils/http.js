export async function errorMessage(response, fallback) {
  const raw = await response.text()
  try {
    const body = JSON.parse(raw)
    return body?.message || body?.msg || raw || fallback
  } catch {
    // 代理或框架返回的 HTML 错误页不适合作为界面提示。
    if (/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(raw)) return fallback
    return raw || fallback
  }
}
