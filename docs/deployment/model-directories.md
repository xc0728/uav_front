# 前端模型目录管理

本次整理只移动模型目录、统一英文目录名并更新前端路径，不删除模型，不修改模型内部文件名、业务来源编码或数据库。

## 目录及迁移对照

所有路径均相对于 `public/`。

| 原路径 | 新路径 | 用途 |
| --- | --- | --- |
| `lod13_3dtiles/` | `models/buildings/deqing-lod13/` | 德清 LOD1.3 建筑，约 24GB |
| `德清县全域建筑/` | `models/buildings/deqing-full/` | 德清全域建筑，约 103MB |
| `更新建筑/` | `models/buildings/deqing-updated/` | 更新建筑，约 272KB |
| `dq3dtiles/` | `models/osgb/deqing/` | 德清倾斜摄影，约 3.2GB |
| `model/communication/` | `models/facilities/communication/` | 通信设施，约 419MB |
| `model/navigation/` | `models/facilities/navigation/` | 导航设施，约 59MB |
| `model/surveillance/` | `models/facilities/surveillance/` | 监视设施，约 1.7MB |
| `DXY1.glb` | `models/aircraft/dxy1.glb` | 无人机模型 |

`terrain/`、`deqing/`、图标和其他 JSON 文件保持原位。原 `model/` 空目录已移除。

## 清单与代码

- `scripts/generate-lod13-manifest.mjs` 为已迁移数据集显式保留原 ID，将设施显示名统一为中文。
- 保留原有 6 个数据集的排列顺序，避免改变默认加载的首个建筑模型。
- `.gitignore` 继续忽略大型 public 数据，仅放行原已跟踪无人机文件的新位置，避免后续提交遗漏该文件。
- 倾斜摄影 `models/osgb/` 不加入建筑清单，由地图单独加载。
- `src/components/data-screen/CesiumMap.vue` 更新倾斜摄影入口和两处无人机模型地址。
- `public/lod13-datasets.json` 重新生成，仍有 6 个数据集，ID 集合与整理前一致。
- 新增模型时，使用分类下独立的英文目录；如需稳定的数据集 ID 和中文名称，在生成脚本的 `knownDatasets` 中登记。
- 不随意改动模型目录内的瓦片、纹理和子清单名称，它们存在相对路径引用。

## 独立数据部署

`dist/` 部署至 `/srv/uav/current/`，`public/` 内容部署至 `/srv/uav/data/`。

例如 `/models/buildings/deqing-lod13/tileset.json` 对应服务器的 `/srv/uav/data/models/buildings/deqing-lod13/tileset.json`。

本次目录调整后必须一起更新页面产物、模型目录和 `lod13-datasets.json`。旧页面仍请求旧地址，不应单独更新数据。现有 Nginx 的静态页面优先、数据目录回退配置可以继续使用。

每次构建会重新生成清单；新增或移除模型后，重新构建并同步清单。不要把旧的离线 tar 包当作本次整理后的产物。

## 验证结果

- `npm run build`：通过；Cesium 资源保留，public 数据不复制至 dist。存在构建块体积警告。
- 迁移前后 69,647 个文件的 inode、大小、修改时间以及文件数量一致；这是同一文件系统内重命名的完整性核对，未重新计算全部 28GB 文件的内容哈希。
- 扫描模型 JSON/glTF 中 81,362 条本地 URI/URL，未发现缺失文件或绝对本地路径。
- 6 个模型清单入口存在，数据集 ID 集合保持一致。
- `node --test test/*.test.js`：110 通过、3 失败，与此前结果一致。失败涉及两项航路颜色断言及一项输电设施名称断言。
- 未执行浏览器实际渲染验收；部署后需检查模型显示。

## 备份及回退

整理前实际文件快照（含当时未提交的地图代码）保存在本机：

`/home/coding/uav-backups/model-layout-20261114-095558/`

备份包含 `.gitignore`、生成脚本、地图组件、原模型清单；大型模型没有额外复制，使用 `moves.json` 记录移动映射，使用 `inventory.json` 记录迁移前文件元数据。`verification.json` 记录核对结果，`after-sha256.json` 记录整理后代码和清单哈希。

回退前先核对 `after-sha256.json`；如这些文件存在后续修改，停止覆盖，手工合并。模型也需与 `inventory.json` 核对，存在后续变更时不得直接逆向移动。

确认没有后续修改后，按上表逆向移动各目录和无人机文件；移动前确认旧路径不存在，并确保所有解析后的源和目标均位于本项目 `public/` 内。随后从备份恢复 `.gitignore`、生成脚本、地图组件和清单，重新构建。不得使用 Git HEAD 覆盖整理前的未提交修改。

本次没有数据库变更。已部署服务器回退时也需同步恢复旧页面、模型路径及清单。
