import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import VxePcUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import VxeTable from 'vxe-table'
import 'vxe-table/lib/style.css'
import './styles/tokens.css'

import { initMockServices } from '@/services/mock/mockAdapter'
import App from './App.vue'
import router from './router'

const serviceNames = ['RecordService', 'SchemaService', 'UserViewConfigService', 'CandidateService', 'RelationService']

try {
  initMockServices()
  console.info(`[SchemaEngine] 已初始化所有 Service: ${serviceNames.join(', ')}`)
} catch (err) {
  console.warn(`[SchemaEngine] Service 初始化失败: ${err instanceof Error ? err.message : String(err)}. 引擎将使用降级空实现.`)
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.use(VxePcUI)
app.use(VxeTable)

app.mount('#app')
