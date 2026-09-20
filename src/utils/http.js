export async function errorMessage(response, fallback) {
  const raw = await response.text()
  try {
    const body = JSON.parse(raw)
    return body?.message || body?.msg || raw || fallback
  } catch {
    return raw || fallback
  }
}
