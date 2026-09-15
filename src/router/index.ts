import { createRouter, createWebHistory } from 'vue-router'
import ModuleDemo from '@/views/ModuleDemo.vue'
import SchemaEditor from '@/editor/SchemaEditor.vue'
import SchemaPlayground from '@/editor/playground/SchemaPlayground.vue'

const moduleRoutes = [
  { path: '/voucher', name: 'voucher', moduleId: 'module-voucher' },
  { path: '/ap', name: 'ap', moduleId: 'module-ap' },
  { path: '/invoice', name: 'invoice', moduleId: 'module-invoice' },
  { path: '/sales-order', name: 'sales-order', moduleId: 'module-sales-order' },
  { path: '/receivable', name: 'receivable', moduleId: 'module-receivable' },
  { path: '/user', name: 'user', moduleId: 'module-user' },
  { path: '/workshop', name: 'workshop', moduleId: 'module-workshop' },
  { path: '/dept', name: 'dept', moduleId: 'module-dept' },
  { path: '/empty', name: 'empty', moduleId: 'module-empty' },
  { path: '/no-perm', name: 'no-perm', moduleId: 'module-no-perm' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/voucher',
    },
    ...moduleRoutes.map(r => ({
      path: r.path,
      name: r.name,
      component: ModuleDemo,
      props: { moduleId: r.moduleId },
    })),
    {
      path: '/module/:moduleId',
      name: 'module-demo',
      component: ModuleDemo,
    },
    {
      path: '/editor',
      name: 'schema-editor',
      component: SchemaEditor,
    },
    {
      path: '/playground',
      name: 'schema-playground',
      component: SchemaPlayground,
    },
  ],
})

export { moduleRoutes }
export default router
