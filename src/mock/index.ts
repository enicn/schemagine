// ============================================================
// schemagine/mock —— 演示/测试用 mock 服务与示例数据（subpath entry，docs/23 M4）
// ============================================================
// 宿主按需引入：import { initMockServices } from 'schemagine/mock'
// 主入口 'schemagine' 不再静态携带 mock 代码（根导出仅剩软迁移垫片，0.4.0 移除）。

// === mock 服务全家桶（initMockServices 一次性接线全部六类 Service） ===
export {
  initMockServices,
  MockRecordService,
  MockSchemaService,
  MockUserViewConfigService,
  MockCandidateService,
  MockRelationService,
  createMockRecordSubscription,
} from '../services/mock/mockAdapter'
export type { MockPollingOptions } from '../services/mock/mockAdapter'

// === 存储元信息与重置（清空 schemagine: 前缀下全部演示数据） ===
export { resetAllStorage, isStorageInitialized, markStorageInitialized } from '../services/mock/mockStorage'
export type { StorageMeta } from '../services/mock/mockStorage'

// === 媒体 mock（演示壳与 media 面本地调试用） ===
export { mockMediaService, resetMockMedia } from '../services/mock/mockMediaService'

// === 示例 Schema 与记录（自定义演示时按模块取用） ===
export * as sampleSchemas from '../services/mock/sampleSchemas'
export * as sampleRecords from '../services/mock/sampleRecords'
