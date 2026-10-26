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
const ignoredDirectories = new Set(['dq3dtiles'])

async function findTilesets(directory, result = []) {
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
  if (ignoredDirectories.has(directoryName)) return null
  const attributesFile = path.join(path.dirname(tilesetFile), 'attributes.json')
  const hasAttributes = await readFile(attributesFile).then(() => true).catch(() => false)
  // 纯中文目录名会被 ASCII 过滤清空，空 id 会与前端空闲加载标识冲突，回退用原始目录名
  const asciiId = relativeDir.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')
  return {
    id: asciiId || relativeDir,
    label: knownLabels[directoryName] || directoryName,
    url: `/${relativeDir}/tileset.json`,
    ...(hasAttributes ? { attributesUrl: `/${relativeDir}/attributes.json` } : {}),
  }
}))).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))

await mkdir(path.dirname(outputFile), { recursive: true })
await writeFile(outputFile, `${JSON.stringify(datasets, null, 2)}\n`, 'utf8')
console.log(`Generated ${datasets.length} LOD1.3 dataset entries`)
