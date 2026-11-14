import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const outputFile = path.join(publicDir, 'lod13-datasets.json')
const knownLabels = {
  lod13_3dtiles: '德清建筑',
  wuhan_tadiao_lod13_3dtiles: '武汉塔吊',
  wuhan_building_lod13_3dtiles: '武汉建筑',
  test_lod13_building: '测试建筑',
}
// 目录名称可调整，数据集 ID 保留历史值，避免改变界面状态和业务关联。
const knownDatasets = {
  'models/buildings/deqing-lod13': { id: 'lod13_3dtiles', label: '德清建筑' },
  'models/buildings/deqing-full': { id: '德清县全域建筑', label: '德清县全域建筑' },
  'models/buildings/deqing-updated': { id: '更新建筑', label: '更新建筑' },
  'models/facilities/communication': { id: 'model-communication', label: '通信设施' },
  'models/facilities/navigation': { id: 'model-navigation', label: '导航设施' },
  'models/facilities/surveillance': { id: 'model-surveillance', label: '监视设施' },
}
// 倾斜摄影单独加载，跳过整个目录，避免将内部瓦片误登记为建筑数据集。
const ignoredDirectories = new Set(['dq3dtiles', 'models/osgb'])
const datasetOrder = new Map(Object.values(knownDatasets).map((dataset, index) => [dataset.id, index]))

async function findTilesets(directory, result = []) {
  const relativeDir = path.relative(publicDir, directory).split(path.sep).join('/')
  if (ignoredDirectories.has(relativeDir)) return result
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some(entry => entry.isFile() && entry.name === 'tileset.json')) {
    result.push(path.join(directory, 'tileset.json'))
    return result
  }
  await Promise.all(entries
    .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
    .map(entry => findTilesets(path.join(directory, entry.name), result)))
  return result
}

const tilesets = await findTilesets(publicDir)
const datasets = (await Promise.all(tilesets.map(async (tilesetFile) => {
  const relativeDir = path.relative(publicDir, path.dirname(tilesetFile)).split(path.sep).join('/')
  const directoryName = path.basename(relativeDir)
  const knownDataset = knownDatasets[relativeDir]
  const attributesFile = path.join(path.dirname(tilesetFile), 'attributes.json')
  const hasAttributes = await readFile(attributesFile).then(() => true).catch(() => false)
  // 纯中文目录名会被 ASCII 过滤清空，空 id 会与前端空闲加载标识冲突，回退用原始目录名
  const asciiId = relativeDir.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')
  return {
    id: knownDataset?.id || asciiId || relativeDir,
    label: knownDataset?.label || knownLabels[directoryName] || directoryName,
    url: `/${relativeDir}/tileset.json`,
    ...(hasAttributes ? { attributesUrl: `/${relativeDir}/attributes.json` } : {}),
  }
}))).filter(Boolean).sort((a, b) => {
  // 保持现有数据集顺序，避免中文显示名调整后改变默认加载的第一个建筑模型。
  const order = (datasetOrder.get(a.id) ?? Infinity) - (datasetOrder.get(b.id) ?? Infinity)
  return order || a.label.localeCompare(b.label, 'zh-CN')
})

await mkdir(path.dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${JSON.stringify(datasets, null, 2)}\n`, 'utf8')
console.log(`Generated ${datasets.length} LOD1.3 dataset entries`)
