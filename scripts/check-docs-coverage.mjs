// 文档覆盖守卫：公开 API 面与宿主侧文档(docs/17)防漂移。
// 从源码提取 SchemaEngine props/emits、FieldType 联合类型,核对 docs/17 逐项覆盖;
// Service 方法面与 expose 面为固定清单(接口变更时应同步修改本清单,守卫即拦截)。
// 运行: node scripts/check-docs-coverage.mjs(已接入 pnpm lint:check)
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

const engine = read('src/engine/entry/SchemaEngine.vue')
const schemaTypes = read('src/types/schema.ts')
const docs = read('docs/17-集成与使用指南.md')

function extractBlock(source, startMarker, endMarker = '}>()') {
  const start = source.indexOf(startMarker)
  if (start === -1) throw new Error(`守卫:未找到 ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  if (end === -1) throw new Error(`守卫:${startMarker} 块未闭合`)
  return source.slice(start, end)
}

// props:块内形如 "  name?:" 的行
const propsBlock = extractBlock(engine, 'const props = defineProps<{')
const propNames = [...propsBlock.matchAll(/^\s{2}(\w+)(\?)?:/gm)].map((m) => m[1])

// emits:块内 'module-loaded': [ 或 error: [
const emitsBlock = extractBlock(engine, 'const emit = defineEmits<{')
const emitNames = [
  ...emitsBlock.matchAll(/^(?:\s*)(?:'([a-z-]+)'|([a-zA-Z]+)):\s*\[/gm),
].map((m) => m[1] || m[2])

// FieldType 联合成员
const fieldTypeBlock = extractBlock(schemaTypes, 'export type FieldType =', 'export interface SelectOption')
const fieldTypes = [...fieldTypeBlock.matchAll(/'([a-zA-Z-]+)'/g)].map((m) => m[1])

// 固定清单:六个 Service 方法面(接口签名变更时同步此处)
const serviceMethods = {
  IRecordService: ['list', 'listFieldValueCandidates', 'getDetail', 'patchField', 'create', 'batchCreate', 'subscribeRecords'],
  ISchemaService: ['loadModuleSchema', 'loadModulePermissions', 'validateSchema', 'saveModuleSchema', 'listModuleIds'],
  ICandidateService: ['query'],
  IUserViewConfigService: ['load', 'save'],
  IRelationService: ['getRelations', 'getTargetRelations', 'getSourceRecords', 'addRelation', 'updateRelation', 'removeRelation'],
  IMediaService: ['list', 'upload', 'resolveUrls', 'remove', 'createManual'],
}
const exposedMethods = ['refresh', 'setViewMode', 'getCurrentRecord', 'undo', 'redo', 'canUndo', 'canRedo']
const keyApis = ['registerLocale', 'registerFieldType', 'registerDialog', 'createLocalRecordService', 'setMediaService', 'setupMedia', 'MediaLibrary', 'MediaPickerDialog', 'createHttpMediaService', 'EngineAppearance', 'RecordsChangePayload', 'UserViewConfig']

const missing = []
const check = (label, names) => {
  for (const name of names) {
    if (!docs.includes(name)) missing.push(`${label}: ${name}`)
  }
}

check('SchemaEngine prop', propNames)
check('SchemaEngine emit', emitNames)
check('FieldType', fieldTypes)
for (const [svc, methods] of Object.entries(serviceMethods)) {
  check(svc, [svc, ...methods])
}
check('expose 方法', exposedMethods)
check('关键 API', keyApis)

if (missing.length > 0) {
  console.error(`✗ docs/17 宿主文档覆盖缺失 ${missing.length} 项(公开 API 变更后须同步 docs/17):`)
  for (const item of missing) console.error(`  - ${item}`)
  process.exit(1)
}
console.log(`✓ docs/17 覆盖守卫通过:props ${propNames.length} / emits ${emitNames.length} / FieldType ${fieldTypes.length} / 6 Service 方法面 / expose / 关键 API`)
