// 德清单日文件仅保留五项日统计量，单位由后端读取源变量。
export const DEQING_WEATHER_FIELDS = Object.freeze({
  weather_daily_mean_temperature: { valueVariable: 'temp_mean', label: '日平均气温' },
  weather_daily_mean_humidity: { valueVariable: 'rh_mean', label: '日平均相对湿度' },
  weather_daily_precipitation: { valueVariable: 'rain_sum', label: '日累计降水量' },
  weather_daily_mean_wind_speed: { valueVariable: 'wind_mean', label: '日平均风速' },
  weather_daily_mean_station_pressure: { valueVariable: 'press_mean', label: '日均本站气压' },
})

export function isDailyWeatherField(code) {
  return Object.hasOwn(DEQING_WEATHER_FIELDS, code)
}

export function weatherFieldPreset(code) {
  const field = DEQING_WEATHER_FIELDS[code]
  if (!field) return null
  return {
    valueVariable: field.valueVariable,
    attributeCode: code,
    attributeName: field.label,
    category: 'meteorology',
    unit: '',
    description: `${field.label}二维地表参考场，近地面日尺度值，不代表飞行高度处实况`,
    valueTransform: 'identity',
    transformScale: 1,
    transformOffset: 0,
  }
}

export function surfaceFieldParameters(form) {
  return {
    dimensionMode: '2D',
    horizontalInterpolation: 'bilinear',
    timeVariable: String(form.timeVariable).trim(),
    timeIndex: Number(form.timeIndex),
    sourceDate: String(form.sourceDate).trim(),
    minAgl: Number(form.minAgl),
    maxAgl: Number(form.maxAgl),
  }
}
