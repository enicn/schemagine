import { createLocalRecordService, setRecordService, setSchemaService } from 'schemagine'
import { taskSchema } from './schema'

/**
 * Feed an in-memory array to the engine — zero backend for prototyping.
 * Swap this for real IRecordService / ISchemaService implementations when
 * your API is ready (see https://enicn.github.io/schemagine/guide/services).
 */

// In-memory rows; each becomes a RecordEntity (id/version are filled in for you
// on create, but seed rows carry their own).
const seedRows = [
  { id: 'task-1', title: 'Design the schema', status: 'done', owner: 'Ada', dueDate: '2026-09-01', progress: 1, budget: 0, accepted: true, notes: '' },
  { id: 'task-2', title: 'Wire the record service', status: 'doing', owner: 'Grace', dueDate: '2026-09-30', progress: 0.6, budget: 1200, accepted: false, notes: ' optimistic locking on patchField' },
  { id: 'task-3', title: 'Style tokens pass', status: 'todo', owner: 'Lin', dueDate: '2026-10-15', progress: 0, budget: 300, accepted: false, notes: '' },
]

const localRecords = createLocalRecordService({ moduleId: 'module-task', delayMs: 0 })
localRecords.setRecords(seedRows)
setRecordService(localRecords)

// For a real backend, implement ISchemaService (loadModuleSchema / …) instead
// of the in-memory schema service used here. Minimal in-memory variant:
setSchemaService({
  async loadModuleSchema(moduleId: string) {
    return {
      success: true,
      data: moduleId === taskSchema.id ? taskSchema : ({} as typeof taskSchema),
    }
  },
  async loadModulePermissions(moduleId: string) {
    return { success: true, data: taskSchema.permissions }
  },
  async validateSchema() {
    return { success: true, data: true }
  },
  async saveModuleSchema() {
    return { success: true, data: undefined as void }
  },
  async listModuleIds() {
    return { success: true, data: [taskSchema.id] }
  },
})
