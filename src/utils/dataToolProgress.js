// 完成状态优先于旧任务缓存中的阶段计数；失败/运行状态不伪装为完成。
export function dataToolProgress(job) {
  const raw = job?.progress || {}
  const asCount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0
  let total = asCount(raw.total)
  let processed = asCount(raw.processed)
  let percent = raw.percent == null ? null : Math.max(0, Math.min(100, Number(raw.percent) || 0))
  if (job?.status === 'succeeded') {
    if (job.result?.gridKeyMode === 'GRID_CODE_EXACT' && job.result?.validRows != null) total = asCount(job.result.validRows)
    processed = total
    percent = 100
  }
  return { total, processed, percent }
}
