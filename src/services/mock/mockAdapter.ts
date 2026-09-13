import type {
  ApiResponse, ModuleSchema, ModulePermissions,
  ListQueryParams, PatchFieldParams, CreateRecordParams,
  RecordEntity, RecordListResponse, UserViewConfig,
  CandidateQueryParams, CandidateListResponse, ColumnConfig, CandidateOption,
  FilterClause,
  FieldValueCandidateQueryParams, FieldValueCandidateListResponse, FieldValueCandidateOption,
  RelationEntry,
} from '@/types'
import type { IRecordService } from '@/services/api/recordService'
import type { ISchemaService } from '@/services/api/schemaService'
import type { IUserViewConfigService } from '@/services/api/userViewConfigService'
import type { ICandidateService } from '@/services/api/candidateService'
import type { IRelationService } from '@/services/api/relationService'
import { createSuccessResponse, createErrorResponse, setMockEnabled } from '@/services/api/base'
import { setRecordService } from '@/services/api/recordService'
import { setSchemaService } from '@/services/api/schemaService'
import { setUserViewConfigService } from '@/services/api/userViewConfigService'
import { setCandidateService } from '@/services/api/candidateService'
import { setRelationService } from '@/services/api/relationService'
import { readStorage, writeStorage, isStorageInitialized, markStorageInitialized } from './mockStorage'
import { compareVersions } from '@/composables/useMigration'
import {
  voucherSchema, apSchema, emptyModuleSchema, NoPermissionSchema,
  invoiceSchema, receivableSchema, userSchema, workshopSchema,
  salesOrderSchema,
} from './sampleSchemas'
import {
  voucherRecords as seedVoucherRecords,
  apRecords as seedApRecords,
  departmentCandidates as seedDepartmentCandidates,
  vendorCandidates as seedVendorCandidates,
  invoiceRecords as seedInvoiceRecords,
  receivableRecords as seedReceivableRecords,
  salesOrderRecords as seedSalesOrderRecords,
  receivableCandidates as seedReceivableCandidates,
} from './sampleRecords'

const RECORDS_KEY_PREFIX = 'records:'
const CONFIGS_KEY_PREFIX = 'configs:'
const SCHEMA_KEY_PREFIX = 'schema:'
const CANDIDATES_KEY_PREFIX = 'candidates:'
const RELATIONS_KEY_PREFIX = 'relations:'

function delay(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getRecordsKey(moduleId: string): string {
  return `${RECORDS_KEY_PREFIX}${moduleId}`
}

function getConfigKey(moduleId: string): string {
  return `${CONFIGS_KEY_PREFIX}${moduleId}`
}

function getCandidateKey(targetModule: string): string {
  return `${CANDIDATES_KEY_PREFIX}${targetModule}`
}

function getRelationsKey(fieldKey: string): string {
  return `${RELATIONS_KEY_PREFIX}${fieldKey}`
}

function seedRecordsIfNeeded(moduleId: string): RecordEntity[] {
  const key = getRecordsKey(moduleId)
  let records = readStorage<RecordEntity[]>(key, [])
  if (records.length === 0) {
    if (moduleId === 'module-voucher') {
      records = seedVoucherRecords.map(r => ({ ...r, fields: { ...r.fields } }))
    } else if (moduleId === 'module-ap') {
      records = seedApRecords.map(r => ({ ...r, fields: { ...r.fields } }))
    } else if (moduleId === 'module-invoice') {
      records = seedInvoiceRecords.map(r => ({ ...r, fields: { ...r.fields } }))
    } else if (moduleId === 'module-receivable') {
      records = seedReceivableRecords.map(r => ({ ...r, fields: { ...r.fields } }))
    } else if (moduleId === 'module-sales-order') {
      records = seedSalesOrderRecords.map(r => ({ ...r, fields: { ...r.fields } }))
    }
    if (records.length > 0) {
      writeStorage(key, records)
    }
  }
  return records
}

function seedCandidatesIfNeeded(targetModule: string): CandidateOption[] {
  const key = getCandidateKey(targetModule)
  let options = readStorage<CandidateOption[]>(key, [])
  if (options.length === 0) {
    if (targetModule === 'module-department') {
      options = seedDepartmentCandidates.map(o => ({ ...o }))
    } else if (targetModule === 'module-vendor') {
      options = seedVendorCandidates.map(o => ({ ...o }))
    } else if (targetModule === 'module-receivable') {
      options = seedReceivableCandidates.map(o => ({ ...o }))
    }
    if (options.length > 0) {
      writeStorage(key, options)
    }
  }
  return options
}

function evaluateFilter(clause: FilterClause, fieldValue: unknown): boolean {
  const { operator, value, values } = clause

  if (fieldValue == null) {
    if (operator === 'neq' || operator === 'notLike' || operator === 'notIn' || operator === 'notBetween') {
      return true
    }
    return false
  }

  const strVal = String(fieldValue).toLowerCase()

  switch (operator) {
    case 'eq':
      return fieldValue === value

    case 'neq':
      return fieldValue !== value

    case 'like': {
      if (typeof value !== 'string') return false
      return strVal.includes(value.toLowerCase())
    }

    case 'notLike': {
      if (typeof value !== 'string') return false
      return !strVal.includes(value.toLowerCase())
    }

    case 'in': {
      if (!Array.isArray(values)) return false
      return values.some(v => fieldValue === v)
    }

    case 'notIn': {
      if (!Array.isArray(values)) return false
      return !values.some(v => fieldValue === v)
    }

    case 'between': {
      if (!Array.isArray(values) || values.length < 2) return false
      const lo = values[0] as string | number
      const hi = values[1] as string | number
      return fieldValue >= lo && fieldValue <= hi
    }

    case 'notBetween': {
      if (!Array.isArray(values) || values.length < 2) return false
      const lo = values[0] as string | number
      const hi = values[1] as string | number
      return fieldValue < lo || fieldValue > hi
    }

    default:
      return true
  }
}

function autoFillRecordFields(moduleId: string, fields: Record<string, unknown>): void {
  if (moduleId === 'module-voucher') {
    if (fields.number === undefined || fields.number === null || fields.number === '') {
      const now = new Date()
      const year = now.getFullYear()
      const key = getRecordsKey(moduleId)
      const records = readStorage<RecordEntity[]>(key, [])
      const thisYearRecords = records.filter(r => {
        const n = r.fields.number
        return typeof n === 'string' && n.startsWith(`PZ-${year}-`)
      })
      const maxSeq = thisYearRecords.reduce((max, r) => {
        const num = typeof r.fields.number === 'string'
          ? parseInt(r.fields.number.split('-').pop()!, 10)
          : 0
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)
      fields.number = `PZ-${year}-${String(maxSeq + 1).padStart(4, '0')}`
    }
    if (fields.baseCurrencyAmount === undefined || fields.baseCurrencyAmount === null || fields.baseCurrencyAmount === '') {
      if (fields.amount !== undefined && fields.amount !== '' && fields.amount !== null) {
        fields.baseCurrencyAmount = Number(fields.amount)
      }
    }
  }
}

function migrateSavedSchema(saved: ModuleSchema, template: ModuleSchema): ModuleSchema {
  const savedKeys = new Set(saved.fields.map(f => f.key))
  const newFields = template.fields.filter(f => !savedKeys.has(f.key))
  const mergedFields = [...saved.fields, ...newFields.map(f => ({ ...f }))]
    .sort((a, b) => a.order - b.order)

  const mergedFormulaConfig = template.formulaConfig
    ? {
        ...template.formulaConfig,
        fields: [
          ...(saved.formulaConfig?.fields ?? []),
          ...template.formulaConfig.fields.filter(
            tf => !(saved.formulaConfig?.fields ?? []).some(sf => sf.fieldKey === tf.fieldKey)
          ),
        ],
      }
    : saved.formulaConfig

  return {
    ...saved,
    version: template.version,
    fields: mergedFields,
    formulaConfig: mergedFormulaConfig,
  }
}

export class MockRecordService implements IRecordService {
  async listFieldValueCandidates(params: FieldValueCandidateQueryParams): Promise<ApiResponse<FieldValueCandidateListResponse>> {
    await delay()
    const { moduleId, field, keyword, page, pageSize, filters } = params

    if (moduleId === 'module-no-perm') {
      return createErrorResponse('PERMISSION_DENIED', '您没有查看此模块的权限')
    }

    const records = seedRecordsIfNeeded(moduleId)
    const filtered = (filters && filters.length > 0)
      ? records.filter(r => (filters as FilterClause[]).every((c: FilterClause) => evaluateFilter(c, r.fields[c.field])))
      : records

    const lowerKeyword = (keyword ?? '').toLowerCase().trim()
    const map = new Map<string, FieldValueCandidateOption>()

    const addValue = (val: unknown): void => {
      if (val === null || val === undefined || val === '') return
      const key = typeof val === 'string' ? `s:${val}` : typeof val === 'number' ? `n:${val}` : typeof val === 'boolean' ? `b:${val}` : `o:${String(val)}`
      const existing = map.get(key)
      if (existing) {
        existing.count++
        return
      }
      const label = typeof val === 'boolean' ? (val ? '是' : '否') : String(val)
      map.set(key, { value: val, label, count: 1 })
    }

    for (const r of filtered) {
      const raw = r.fields[field]
      if (Array.isArray(raw)) {
        for (const item of raw) addValue(item)
      } else {
        addValue(raw)
      }
    }

    let options = Array.from(map.values())
    if (lowerKeyword) {
      options = options.filter(o => o.label.toLowerCase().includes(lowerKeyword))
    }

    options.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label, 'zh-CN')
    })

    const total = options.length
    const start = Math.max(0, (page - 1) * pageSize)
    const end = start + pageSize
    const sliced = options.slice(start, end)

    return createSuccessResponse({
      options: sliced,
      total,
      hasMore: end < total,
    })
  }

  async list(params: ListQueryParams): Promise<ApiResponse<RecordListResponse>> {
    await delay()
    const { moduleId, page, pageSize } = params

    if (moduleId === 'module-no-perm') {
      return createErrorResponse('PERMISSION_DENIED', '您没有查看此模块的权限')
    }

    const schemaKey = `${SCHEMA_KEY_PREFIX}${moduleId}`
    const schema = readStorage<ModuleSchema | null>(schemaKey, null)
    if (schema && schema.migrations && schema.migrations.length > 0) {
      const recordsKey = getRecordsKey(moduleId)
      const records = readStorage<RecordEntity[]>(recordsKey, [])
      if (records.length > 0) {
        const migrations = schema.migrations
        const firstFromVersion = migrations.reduce(
          (min, m) => compareVersions(m.fromVersion, min) < 0 ? m.fromVersion : min,
          migrations[0]!.fromVersion
        )
        const dataVersion = readStorage<string>(`${recordsKey}__version`, firstFromVersion)
        const applicable = migrations.filter(m => compareVersions(m.fromVersion, dataVersion) >= 0)

        if (applicable.length > 0) {
          const sorted = applicable.sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))
          for (const migration of sorted) {
            for (const record of records) {
              migration.migrateRecord(record.fields)
            }
          }
          writeStorage(recordsKey, records)
          writeStorage(`${recordsKey}__version`, schema.version)
          console.log(`[SchemaMigration] ${moduleId}: 已迁移 ${records.length} 条记录到 v${schema.version}`)
        }
      }
    }

    let records = seedRecordsIfNeeded(moduleId)

    const sort = params.sort
    if (sort) {
      records.sort((a, b) => {
        const aVal = a.fields[sort.field]
        const bVal = b.fields[sort.field]
        if (aVal == null) return 1
        if (bVal == null) return -1
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
        return sort.order === 'asc' ? cmp : -cmp
      })
    }

    const filters = params.filters
    if (filters && filters.length > 0) {
      records = records.filter(record => {
        return filters.every(clause => {
          const fieldValue = record.fields[clause.field]
          return evaluateFilter(clause, fieldValue)
        })
      })
    }

    const total = records.length
    const start = (page - 1) * pageSize
    const paged = records.slice(start, start + pageSize)

    return createSuccessResponse({
      records: paged,
      total,
      page,
      pageSize,
    })
  }

  async getDetail(moduleId: string, recordId: string): Promise<ApiResponse<RecordEntity>> {
    await delay()
    const records = seedRecordsIfNeeded(moduleId)
    const record = records.find(r => r.id === recordId)
    if (!record) return createErrorResponse('NOT_FOUND', '记录不存在')
    return createSuccessResponse({ ...record })
  }

  async patchField(params: PatchFieldParams): Promise<ApiResponse<RecordEntity>> {
    await delay()
    const { moduleId, recordId, field, value, expectedVersion, force } = params

    const key = getRecordsKey(moduleId)
    let records = readStorage<RecordEntity[]>(key, [])
    if (records.length === 0) {
      records = seedRecordsIfNeeded(moduleId)
    }

    const found = records.find(r => r.id === recordId)
    if (!found) return createErrorResponse('NOT_FOUND', '记录不存在')

    if (!force && found.version !== expectedVersion) {
      return createErrorResponse('VERSION_CONFLICT', '数据已被其他用户修改，请刷新后重试')
    }

    found.fields[field] = value
    found.version += 1
    found.updatedAt = new Date().toISOString()

    writeStorage(key, records)
    return createSuccessResponse({ ...found })
  }

  async create(params: CreateRecordParams): Promise<ApiResponse<RecordEntity>> {
    await delay()
    const fields = { ...params.fields }
    autoFillRecordFields(params.moduleId, fields)
    const newRecord: RecordEntity = {
      id: `rec-new-${Date.now()}`,
      moduleId: params.moduleId,
      fields,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const key = getRecordsKey(params.moduleId)
    const records = readStorage<RecordEntity[]>(key, [])
    records.push(newRecord)
    writeStorage(key, records)

    return createSuccessResponse(newRecord)
  }

  async batchCreate(params: CreateRecordParams[]): Promise<ApiResponse<RecordEntity[]>> {
    await delay()
    const records: RecordEntity[] = params.map(p => {
      const fields = { ...p.fields }
      autoFillRecordFields(p.moduleId, fields)
      const rec: RecordEntity = {
        id: `rec-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        moduleId: p.moduleId,
        fields,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return rec
    })

    if (records.length > 0) {
      const key = getRecordsKey(records[0]!.moduleId)
      const existing = readStorage<RecordEntity[]>(key, [])
      existing.push(...records)
      writeStorage(key, existing)
    }

    return createSuccessResponse(records)
  }
}

export class MockSchemaService implements ISchemaService {
  private getSchemaMap(): Record<string, ModuleSchema> {
    return {
      'module-voucher': voucherSchema,
      'module-ap': apSchema,
      'module-empty': emptyModuleSchema,
      'module-no-perm': NoPermissionSchema,
      'module-invoice': invoiceSchema,
      'module-receivable': receivableSchema,
      'module-user': userSchema,
      'module-workshop': workshopSchema,
      'module-sales-order': salesOrderSchema,
    }
  }

  private getSchemaListKey(): string {
    return `${SCHEMA_KEY_PREFIX}_list`
  }

  private getSavedModuleIds(): string[] {
    return readStorage<string[]>(this.getSchemaListKey(), [])
  }

  private saveModuleId(moduleId: string): void {
    const ids = this.getSavedModuleIds()
    if (!ids.includes(moduleId)) {
      ids.push(moduleId)
      writeStorage(this.getSchemaListKey(), ids)
    }
  }

  async loadModuleSchema(moduleId: string): Promise<ApiResponse<ModuleSchema>> {
    await delay()
    const saved = readStorage<ModuleSchema | null>(`${SCHEMA_KEY_PREFIX}${moduleId}`, null)
    const schemas = this.getSchemaMap()
    const template = schemas[moduleId]

    if (saved && template) {
      if (saved.version !== template.version) {
        const merged = migrateSavedSchema(saved, template)
        writeStorage(`${SCHEMA_KEY_PREFIX}${moduleId}`, merged)
        console.log(`[MockSchemaService] ${moduleId}: schema 已从 v${saved.version} 迁移到 v${template.version}`)
        return createSuccessResponse({ ...merged, fields: [...merged.fields] })
      }
      return createSuccessResponse({ ...saved, fields: [...saved.fields] })
    }
    if (saved) return createSuccessResponse({ ...saved, fields: [...saved.fields] })
    if (!template) return createErrorResponse('NOT_FOUND', `模块 ${moduleId} 的Schema不存在`)
    return createSuccessResponse({ ...template, fields: [...template.fields] })
  }

  async loadModulePermissions(moduleId: string): Promise<ApiResponse<ModulePermissions>> {
    await delay()
    const saved = readStorage<ModuleSchema | null>(`${SCHEMA_KEY_PREFIX}${moduleId}`, null)
    if (saved) return createSuccessResponse({ ...saved.permissions })
    const permissionsMap: Record<string, ModulePermissions> = {
      'module-voucher': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
      'module-ap': { view: true, create: true, edit: true, delete: false, export: true, configure: true },
      'module-empty': { view: true, create: true, edit: true, delete: true, export: false, configure: false },
      'module-no-perm': { view: false, create: false, edit: false, delete: false, export: false, configure: false },
      'module-invoice': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
      'module-receivable': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
      'module-user': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
      'module-workshop': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
      'module-sales-order': { view: true, create: true, edit: true, delete: true, export: true, configure: true },
    }
    const perms = permissionsMap[moduleId]
    if (!perms) return createErrorResponse('NOT_FOUND', '模块权限数据不存在')
    return createSuccessResponse({ ...perms })
  }

  async saveModuleSchema(schema: ModuleSchema): Promise<ApiResponse<void>> {
    await delay()
    writeStorage(`${SCHEMA_KEY_PREFIX}${schema.id}`, { ...schema, fields: [...schema.fields] })
    this.saveModuleId(schema.id)
    return createSuccessResponse(undefined)
  }

  async listModuleIds(): Promise<ApiResponse<string[]>> {
    await delay()
    const hardcoded = Object.keys(this.getSchemaMap())
    const saved = this.getSavedModuleIds()
    const merged = [...new Set([...hardcoded, ...saved])]
    return createSuccessResponse(merged)
  }

  async validateSchema(moduleId: string): Promise<ApiResponse<boolean>> {
    await delay()
    const saved = readStorage<ModuleSchema | null>(`${SCHEMA_KEY_PREFIX}${moduleId}`, null)
    if (saved) return createSuccessResponse(true)
    const schemas = this.getSchemaMap()
    const isValid = moduleId in schemas
    return createSuccessResponse(isValid)
  }
}

export class MockUserViewConfigService implements IUserViewConfigService {
  async load(moduleId: string): Promise<ApiResponse<UserViewConfig>> {
    await delay()
    const key = getConfigKey(moduleId)
    const stored = readStorage<UserViewConfig | null>(key, null)
    if (stored) {
      return createSuccessResponse({ ...stored })
    }
    return createSuccessResponse(this.getDefaultConfig(moduleId))
  }

  async save(config: UserViewConfig): Promise<ApiResponse<void>> {
    await delay()
    const key = getConfigKey(config.moduleId)
    writeStorage(key, { ...config })
    return createSuccessResponse(undefined)
  }

  private getDefaultConfig(moduleId: string): UserViewConfig {
    const schemaMap: Record<string, { fields: Array<{ key: string; width?: number; sortable?: boolean }> }> = {
      'module-voucher': voucherSchema,
      'module-ap': apSchema,
      'module-empty': emptyModuleSchema,
      'module-invoice': invoiceSchema,
      'module-receivable': receivableSchema,
      'module-user': userSchema,
      'module-workshop': workshopSchema,
      'module-sales-order': salesOrderSchema,
    }
    const s = schemaMap[moduleId]
    const columns: ColumnConfig[] = s
      ? s.fields.map((f, i) => ({
        field: f.key,
        width: f.width || 120,
        visible: true,
        order: i,
        sortable: !!f.sortable,
      }))
      : []

    return {
      moduleId,
      version: 1,
      columns,
      pageSize: 20,
    }
  }
}

export class MockCandidateService implements ICandidateService {
  async query(params: CandidateQueryParams): Promise<ApiResponse<CandidateListResponse>> {
    await delay()
    const { targetModule, keyword, page, pageSize } = params

    const allOptions = seedCandidatesIfNeeded(targetModule)

    const records = readStorage<RecordEntity[]>(getRecordsKey(targetModule), [])
    for (const rec of records) {
      if (!allOptions.some(o => o.value === rec.id)) {
        const labelField = rec.fields.name ?? rec.fields.label ?? rec.fields.title
        allOptions.push({
          value: rec.id,
          label: typeof labelField === 'string' ? labelField : rec.id,
        })
      }
    }

    let filtered = allOptions
    if (keyword) {
      const kw = keyword.toLowerCase()
      filtered = allOptions.filter(o => o.label.toLowerCase().includes(kw))
    }

    const total = filtered.length
    const start = (page - 1) * pageSize
    const paged = filtered.slice(start, start + pageSize)

    return createSuccessResponse({
      options: paged,
      total,
      hasMore: start + pageSize < total,
    })
  }
}

export class MockRelationService implements IRelationService {
  private relationsSeedMap: Record<string, RelationEntry[]> = {}

  seedRelations(entries: RelationEntry[]): void {
    if (entries.length > 0) {
      const fieldKey = entries[0]!.fieldKey
      this.relationsSeedMap[fieldKey] = entries
      const key = getRelationsKey(fieldKey)
      writeStorage(key, entries.map(e => ({ ...e, extraFields: { ...e.extraFields } })))
    }
  }

  private getRelationsInternal(fieldKey: string): RelationEntry[] {
    const key = getRelationsKey(fieldKey)
    const stored = readStorage<RelationEntry[]>(key, [])
    if (stored.length > 0) return stored
    const seeds = this.relationsSeedMap[fieldKey]
    if (seeds && seeds.length > 0) {
      const copied = seeds.map(r => ({ ...r, extraFields: { ...r.extraFields } }))
      writeStorage(key, copied)
      return copied
    }
    return []
  }

  getRelations(sourceModuleId: string, sourceRecordId: string, fieldKey: string): RelationEntry[] {
    const all = this.getRelationsInternal(fieldKey)
    return all.filter(r => r.sourceModuleId === sourceModuleId && r.sourceRecordId === sourceRecordId)
  }

  getTargetRelations(targetModuleId: string, targetRecordId: string, fieldKey: string): RelationEntry[] {
    const all = this.getRelationsInternal(fieldKey)
    return all.filter(r => r.targetModuleId === targetModuleId && r.targetRecordId === targetRecordId)
  }

  getSourceRecords(targetModuleId: string, targetRecordId: string, fieldKey: string): RecordEntity[] {
    const all = this.getRelationsInternal(fieldKey)
    const sourceIds = all
      .filter(r => r.targetModuleId === targetModuleId && r.targetRecordId === targetRecordId)
      .map(r => r.sourceRecordId)

    const uniqueIds = [...new Set(sourceIds)]
    return uniqueIds.map(id => ({
      id,
      moduleId: '',
      fields: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    }))
  }

  async addRelation(entry: Omit<RelationEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<RelationEntry>> {
    await delay()
    const now = new Date().toISOString()
    const newEntry: RelationEntry = {
      id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceModuleId: entry.sourceModuleId,
      sourceRecordId: entry.sourceRecordId,
      targetModuleId: entry.targetModuleId,
      targetRecordId: entry.targetRecordId,
      fieldKey: entry.fieldKey,
      extraFields: { ...entry.extraFields },
      createdAt: now,
      updatedAt: now,
    }

    const key = getRelationsKey(entry.fieldKey)
    const relations = this.getRelationsInternal(entry.fieldKey)
    relations.push(newEntry)
    writeStorage(key, relations)

    return createSuccessResponse({ ...newEntry, extraFields: { ...newEntry.extraFields } })
  }

  async updateRelation(id: string, extraFields: Record<string, unknown>): Promise<ApiResponse<RelationEntry>> {
    await delay()
    const keysToCheck = new Set(Object.keys(this.relationsSeedMap))
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(RELATIONS_KEY_PREFIX)) {
        keysToCheck.add(k.slice(RELATIONS_KEY_PREFIX.length))
      }
    }
    for (const fieldKey of keysToCheck) {
      const relations = this.getRelationsInternal(fieldKey)
      const found = relations.find(r => r.id === id)
      if (found) {
        found.extraFields = { ...found.extraFields, ...extraFields }
        found.updatedAt = new Date().toISOString()
        writeStorage(getRelationsKey(fieldKey), relations)
        return createSuccessResponse({ ...found, extraFields: { ...found.extraFields } })
      }
    }
    return createErrorResponse('NOT_FOUND', '关联记录不存在')
  }

  async removeRelation(id: string): Promise<ApiResponse<void>> {
    await delay()
    const keysToCheck = new Set(Object.keys(this.relationsSeedMap))
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(RELATIONS_KEY_PREFIX)) {
        keysToCheck.add(k.slice(RELATIONS_KEY_PREFIX.length))
      }
    }
    for (const fieldKey of keysToCheck) {
      const key = getRelationsKey(fieldKey)
      const relations = this.getRelationsInternal(fieldKey)
      const idx = relations.findIndex(r => r.id === id)
      if (idx !== -1) {
        relations.splice(idx, 1)
        writeStorage(key, relations)
        if (relations.length === 0) {
          delete this.relationsSeedMap[fieldKey]
        }
        return createSuccessResponse(undefined)
      }
    }
    return createErrorResponse('NOT_FOUND', '关联记录不存在')
  }
}

export function initMockServices(): void {
  setRecordService(new MockRecordService())
  setSchemaService(new MockSchemaService())
  setUserViewConfigService(new MockUserViewConfigService())
  setCandidateService(new MockCandidateService())
  const relationService = new MockRelationService()
  setRelationService(relationService)
  setMockEnabled(true)

  // 种子关联数据：销售单 SO-001 → 3笔应收
  relationService.seedRelations([
    {
      id: 'rel-so-001',
      sourceModuleId: 'module-sales-order',
      sourceRecordId: 'rec-so-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-001',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 5000, writeOffStatus: '已核销' },
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-10T10:00:00Z',
    },
    {
      id: 'rel-so-002',
      sourceModuleId: 'module-sales-order',
      sourceRecordId: 'rec-so-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-002',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 7500, writeOffStatus: '部分核销' },
      createdAt: '2026-05-01T10:05:00Z',
      updatedAt: '2026-05-08T10:00:00Z',
    },
    {
      id: 'rel-so-003',
      sourceModuleId: 'module-sales-order',
      sourceRecordId: 'rec-so-001',
      targetModuleId: 'module-receivable',
      targetRecordId: 'rec-rec-003',
      fieldKey: 'receivables',
      extraFields: { allocatedAmount: 3000, writeOffStatus: '未核销' },
      createdAt: '2026-05-01T10:10:00Z',
      updatedAt: '2026-05-01T10:10:00Z',
    },
  ])

  if (!isStorageInitialized()) {
    const configService = new MockUserViewConfigService()
    const modules = ['module-voucher', 'module-ap', 'module-empty', 'module-invoice', 'module-receivable', 'module-user', 'module-workshop', 'module-sales-order']
    modules.forEach(m => {
      const key = getConfigKey(m)
      const existing = readStorage<UserViewConfig | null>(key, null)
      if (!existing) {
        const defaultConfig = configService['getDefaultConfig'](m)
        writeStorage(key, defaultConfig)
      }
    })
    markStorageInitialized()
  }
}
