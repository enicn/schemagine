import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import VxePcUI from 'vxe-pc-ui'
import VxeTable from 'vxe-table'

import 'element-plus/dist/index.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
// Engine styles (includes the --sg-* token baseline)
import 'schemagine/dist/schemagine.css'

import './services'
import App from './App.vue'

createApp(App)
  .use(createPinia())
  .use(ElementPlus)
  .use(VxePcUI)
  .use(VxeTable)
  .mount('#app')
