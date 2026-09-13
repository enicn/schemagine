import type { RecordEntity, CandidateOption } from '@/types'

export const voucherRecords: RecordEntity[] = [
  {
    id: 'rec-v-001',
    moduleId: 'module-voucher',
    fields: {
      date: '2026-04-01',
      number: 'PZ-2026-0001',
      amount: 12500.00,
      currency: 'CNY',
      type: 'receipt',
      status: 'posted',
      department: 'dept-f01',
      remark: '收到A公司货款',
      taxRate: 0.13,
      taxAmount: 1625.00,
      baseCurrencyAmount: 12500.00,
      isUrgent: false,
    },
    version: 1,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
  },
  {
    id: 'rec-v-002',
    moduleId: 'module-voucher',
    fields: {
      date: '2026-04-02',
      number: 'PZ-2026-0002',
      amount: 5800.00,
      currency: 'CNY',
      type: 'payment',
      status: 'approved',
      department: 'dept-hr01',
      remark: '支付办公用品采购款',
      taxRate: 0.13,
      taxAmount: 754.00,
      baseCurrencyAmount: 5800.00,
      isUrgent: true,
    },
    version: 1,
    createdAt: '2026-04-02T14:30:00Z',
    updatedAt: '2026-04-02T14:30:00Z',
  },
  {
    id: 'rec-v-003',
    moduleId: 'module-voucher',
    fields: {
      date: '2026-04-03',
      number: 'PZ-2026-0003',
      amount: 35000.00,
      currency: 'CNY',
      type: 'transfer',
      status: 'pending_audit',
      department: 'dept-f01',
      remark: '内部转账-资金调拨',
      taxRate: 0.06,
      taxAmount: 2100.00,
      baseCurrencyAmount: 35000.00,
      isUrgent: false,
    },
    version: 2,
    createdAt: '2026-04-03T09:15:00Z',
    updatedAt: '2026-04-03T16:45:00Z',
  },
  {
    id: 'rec-v-004',
    moduleId: 'module-voucher',
    fields: {
      date: '2026-04-05',
      number: 'PZ-2026-0004',
      amount: 890.50,
      currency: 'CNY',
      type: 'payment',
      status: 'voided',
      department: 'dept-admin',
      remark: '作废-重复支付',
      taxRate: 0.13,
      taxAmount: 115.77,
      baseCurrencyAmount: 890.50,
      isUrgent: false,
    },
    version: 1,
    createdAt: '2026-04-05T11:20:00Z',
    updatedAt: '2026-04-05T15:00:00Z',
  },
  {
    id: 'rec-v-005',
    moduleId: 'module-voucher',
    fields: {
      date: '2026-04-06',
      number: 'PZ-2026-0005',
      amount: 22000.00,
      currency: 'CNY',
      type: 'accrual',
      status: 'pending_audit',
      department: 'dept-f01',
      remark: '计提坏账准备',
      taxRate: 0,
      taxAmount: 0,
      baseCurrencyAmount: 22000.00,
      isUrgent: false,
    },
    version: 1,
    createdAt: '2026-04-06T08:00:00Z',
    updatedAt: '2026-04-06T08:00:00Z',
  },
]

export const apRecords: RecordEntity[] = [
  {
    id: 'rec-ap-001',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-001',
      invoiceNumber: 'INV-2026-001',
      amount: 50000.00,
      paidAmount: 50000.00,
      balance: 0,
      dueDate: '2026-03-15',
      status: 'paid',
      priority: 'high',
    },
    version: 1,
    createdAt: '2026-02-01T09:00:00Z',
    updatedAt: '2026-03-10T17:00:00Z',
  },
  {
    id: 'rec-ap-002',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-002',
      invoiceNumber: 'INV-2026-002',
      amount: 128000.00,
      paidAmount: 50000.00,
      balance: 78000.00,
      dueDate: '2026-05-20',
      status: 'partial',
      priority: 'high',
    },
    version: 1,
    createdAt: '2026-02-15T10:30:00Z',
    updatedAt: '2026-04-10T14:00:00Z',
  },
  {
    id: 'rec-ap-003',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-003',
      invoiceNumber: 'INV-2026-003',
      amount: 3200.00,
      paidAmount: 0,
      balance: 3200.00,
      dueDate: '2026-04-01',
      status: 'overdue',
      priority: 'medium',
    },
    version: 1,
    createdAt: '2026-03-01T11:00:00Z',
    updatedAt: '2026-03-01T11:00:00Z',
  },
  {
    id: 'rec-ap-004',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-001',
      invoiceNumber: 'INV-2026-004',
      amount: 87500.00,
      paidAmount: 0,
      balance: 87500.00,
      dueDate: '2026-06-30',
      status: 'unpaid',
      priority: 'low',
    },
    version: 1,
    createdAt: '2026-03-20T15:45:00Z',
    updatedAt: '2026-03-20T15:45:00Z',
  },
  {
    id: 'rec-ap-005',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-004',
      invoiceNumber: 'INV-2026-005',
      amount: 6600.00,
      paidAmount: 6600.00,
      balance: 0,
      dueDate: '2026-04-10',
      status: 'paid',
      priority: 'medium',
    },
    version: 1,
    createdAt: '2026-03-25T08:15:00Z',
    updatedAt: '2026-04-09T16:30:00Z',
  },
  {
    id: 'rec-ap-006',
    moduleId: 'module-ap',
    fields: {
      vendor: 'vendor-005',
      invoiceNumber: 'INV-2026-006',
      amount: 45000.00,
      paidAmount: 20000.00,
      balance: 25000.00,
      dueDate: '2026-05-15',
      status: 'partial',
      priority: 'high',
    },
    version: 2,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-15T11:00:00Z',
  },
]

export const departmentCandidates: CandidateOption[] = [
  { value: 'dept-f01', label: '财务部', data: { manager: '张三' } },
  { value: 'dept-hr01', label: '人力资源部', data: { manager: '李四' } },
  { value: 'dept-admin', label: '行政部', data: { manager: '王五' } },
  { value: 'dept-it01', label: '信息技术部', data: { manager: '赵六' } },
  { value: 'dept-sale', label: '销售部', data: { manager: '钱七' } },
]

export const vendorCandidates: CandidateOption[] = [
  { value: 'vendor-001', label: '北京科技有限公司', data: { contact: '010-8888-0001' } },
  { value: 'vendor-002', label: '上海贸易有限公司', data: { contact: '021-6888-0002' } },
  { value: 'vendor-003', label: '广州供应链管理公司', data: { contact: '020-3888-0003' } },
  { value: 'vendor-004', label: '深圳创新技术公司', data: { contact: '0755-8888-0004' } },
  { value: 'vendor-005', label: '成都制造有限公司', data: { contact: '028-6888-0005' } },
]

export const receivableCandidates: CandidateOption[] = [
  { value: 'rec-rec-001', label: 'A公司货款 ¥5,000', data: { amount: 5000 } },
  { value: 'rec-rec-002', label: 'B公司服务费 ¥7,500', data: { amount: 7500 } },
  { value: 'rec-rec-003', label: 'C公司咨询费 ¥3,000', data: { amount: 3000 } },
  { value: 'rec-rec-004', label: 'D公司设备款 ¥12,000', data: { amount: 12000 } },
]

/** 发票记录 */
export const invoiceRecords: RecordEntity[] = [
  {
    id: 'rec-inv-001',
    moduleId: 'module-invoice',
    fields: { invoiceNumber: 'INV-2026-001', amount: 12500, date: '2026-05-01' },
    version: 1,
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-01T08:00:00Z',
  },
  {
    id: 'rec-inv-002',
    moduleId: 'module-invoice',
    fields: { invoiceNumber: 'INV-2026-002', amount: 8800, date: '2026-05-05' },
    version: 1,
    createdAt: '2026-05-05T09:00:00Z',
    updatedAt: '2026-05-05T09:00:00Z',
  },
]

/** 应收账单记录 */
export const receivableRecords: RecordEntity[] = [
  {
    id: 'rec-rec-001',
    moduleId: 'module-receivable',
    fields: { name: 'A公司货款', amount: 5000, dueDate: '2026-06-15' },
    version: 1,
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-01T08:00:00Z',
  },
  {
    id: 'rec-rec-002',
    moduleId: 'module-receivable',
    fields: { name: 'B公司服务费', amount: 7500, dueDate: '2026-06-20' },
    version: 1,
    createdAt: '2026-04-05T08:00:00Z',
    updatedAt: '2026-04-05T08:00:00Z',
  },
  {
    id: 'rec-rec-003',
    moduleId: 'module-receivable',
    fields: { name: 'C公司咨询费', amount: 3000, dueDate: '2026-07-01' },
    version: 1,
    createdAt: '2026-04-10T08:00:00Z',
    updatedAt: '2026-04-10T08:00:00Z',
  },
]

/** 用户记录 — 多对多关联车间 */
export const userRelationRecords: RecordEntity[] = [
  {
    id: 'rec-user-001',
    moduleId: 'module-user',
    fields: { name: '张三', email: 'zhangsan@example.com' },
    version: 1,
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-01T08:00:00Z',
  },
  {
    id: 'rec-user-002',
    moduleId: 'module-user',
    fields: { name: '李四', email: 'lisi@example.com' },
    version: 1,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-01T09:00:00Z',
  },
]

/** 车间记录 — 多对多关联的目标表 */
export const workshopRelationRecords: RecordEntity[] = [
  {
    id: 'rec-ws-001',
    moduleId: 'module-workshop',
    fields: { name: '一车间', location: 'A栋1层' },
    version: 1,
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-01T08:00:00Z',
  },
  {
    id: 'rec-ws-002',
    moduleId: 'module-workshop',
    fields: { name: '二车间', location: 'B栋2层' },
    version: 1,
    createdAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-04-01T08:00:00Z',
  },
]

/** 销售单记录 — 一对多关联应收账单 */
export const salesOrderRecords: RecordEntity[] = [
  {
    id: 'rec-so-001',
    moduleId: 'module-sales-order',
    fields: {
      orderNumber: 'SO-2026-001',
      customer: '北京科技有限公司',
      date: '2026-05-01',
      totalAmount: 15500,
      status: 'confirmed',
    },
    version: 1,
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-01T08:00:00Z',
  },
  {
    id: 'rec-so-002',
    moduleId: 'module-sales-order',
    fields: {
      orderNumber: 'SO-2026-002',
      customer: '上海贸易有限公司',
      date: '2026-05-03',
      totalAmount: 22000,
      status: 'shipped',
    },
    version: 1,
    createdAt: '2026-05-03T09:00:00Z',
    updatedAt: '2026-05-05T10:00:00Z',
  },
]

// 为关联测试补充第4笔应收记录
receivableRecords.push({
  id: 'rec-rec-004',
  moduleId: 'module-receivable',
  fields: { name: 'D公司设备款', amount: 12000, dueDate: '2026-08-01' },
  version: 1,
  createdAt: '2026-05-10T08:00:00Z',
  updatedAt: '2026-05-10T08:00:00Z',
})
