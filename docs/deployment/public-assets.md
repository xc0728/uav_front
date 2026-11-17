# public 静态资源用途与清理记录

## 保留资源

| 路径 | 用途 | 保留原因 |
| --- | --- | --- |
| `models/buildings/` | 德清建筑模型 | 模型清单动态引用；目录内瓦片之间有相对路径依赖 |
| `models/osgb/` | 倾斜摄影模型 | `CesiumMap.vue` 单独加载入口 |
| `models/facilities/` | 通信、导航、监视设施模型 | 模型清单动态引用 |
| `models/aircraft/dxy1.glb` | 无人机模型 | 地图中两处实体使用 |
| `terrain/zhejiang/` | 浙江本地高程瓦片，约 558MB | 默认地形源；删除会导致回退为平坦地形 |
| `deqing/2024年初县级.*` | 县界 Shapefile 及配套文件 | 地图读取 `.shp` 绘制德清县界；配套文件保留为完整数据集 |
| `deqing/deqing4.*` | 建筑轮廓与属性 | 建筑白膜功能读取 `.shp` 和 `.dbf`；配套文件保留 |
| `lod13-datasets.json` | 动态模型清单 | 每次开发启动或生产构建前自动生成；无模型部署包应提供 `[]` |
| `favicon.svg` | 浏览器标签页图标 | `index.html` 引用 |
| `webicon1.png` | 地图图标来源 | 仍有代码引用，但目前内容为 Git LFS 指针，实际图片缺失，需要单独恢复 |

模型数据不能只根据前端源码是否出现文件名判断是否无用。`tileset.json`、子瓦片及纹理互相引用；`attribute.db3` 被后端模型入库逻辑使用；`scenetree.json` 是模型对象层级与属性资料，保留以支持后续数据处理。本轮不删除这些文件，也不因本次服务器不部署模型而删除本机模型源数据。

## 已移出 public 的资源

共 19 个文件，8,900,823 字节（约 8.49MiB）：

- `deqing_osm.osm`：旧 OSM 数据，当前前端及核对的后端代码中没有对应文件引用。
- `DQG.json`、`RuKu.json`、`RuKu2.json`、`response.json`：无运行时引用，实际均为 Git LFS 指针，并非有效示例 JSON。
- `response(1).json`：Git LFS 指针；唯一引用来自未调用、未绑定界面、未暴露的演示函数。本轮一并删除该函数及其专用 loading 状态，不改变现有网格化操作。
- `deqing/deqing.{shp,dbf,prj,sbn,sbx,shx,cpg}`：7 个文件与现用 `2024年初县级.*` 对应文件逐字节相同，当前运行代码使用后者。
- `deqing/2023年县级.xml`：未使用的旧 GIS 元数据说明。
- `models/buildings/deqing-lod13/tileset.json.pre-prune.bak`：旧模型清单备份，移出公开静态目录，保留归档。
- `models/buildings/deqing-full/dem_alignment_summary.json`、`export_report.json`、`export_summary_by_glb.csv`、`selected_features_exported.csv`：数据生产报告和导出记录，无前端运行时引用；后端文档曾使用报告说明统计，因此保留归档，不永久删除。

## 归档与恢复

本次归档目录：`/home/coding/uav-backups/public-cleanup-20261114-105910/`。

归档的 `public/` 内保留原相对路径；`cleanup-manifest.json` 记录每项的路径、大小和 SHA256。修改前的 `3_3PolygonGrid.vue` 完整副本也保存在归档中，包含当时实际工作区内容。

恢复时先检查目标路径没有后续新增文件，校验归档文件 SHA256，再按相对路径复制回 `public/`。需要恢复演示代码时先核对 `after-sha256.json`，有后续修改则手工合并，不直接覆盖。恢复后重新构建。

本次操作仅作用于本机前端工作区，尚未操作服务器上的 `/home/gjy_grid_front/public`，也未更新已传输的离线包。服务器部署无模型时仍应使用空模型清单，不能直接覆盖为本机含 6 项数据集的清单。

## 验证

- 归档文件 SHA256 与清理前记录一致，清理目标不再位于 public。
- 移除的重复县界与保留版本逐字节一致。
- 全部模型 JSON/glTF 本地 URI/URL 重新检查，无缺失。
- `npm run build` 成功，仍有构建块体积警告。
- `node --test test/*.test.js`：110 通过、3 失败；仍为此前的两项航路颜色和一项输电设施名称断言。
- 未执行浏览器实际渲染验收。

清理后 public 的主要体积仍是模型与地形，移除小型辅助文件不会显著改变总体积。无模型部署包中最大的保留项是地形。
