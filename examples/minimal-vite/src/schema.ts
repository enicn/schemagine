import type { ModuleSchema } from 'schemagine'

/**
 * One ModuleSchema drives all three views (list / card / create).
 * Eight fields covering the most common types.
 */
export const taskSchema: ModuleSchema = {
  id: 'module-task',
  name: 'Tasks',
  version: '1.0.0',
  moduleType: 'both',
  fields: [
    {
      id: 'fld-title', name: 'Title', key: 'title', type: 'text',
      label: 'Title', required: true, readonly: false, order: 1,
      width: 220, visible: true, sortable: true, filterable: true,
    },
    {
      id: 'fld-status', name: 'Status', key: 'status', type: 'status',
      label: 'Status', required: true, readonly: false, order: 2,
      width: 120, visible: true, sortable: true, filterable: true,
      statusMap: {
        todo: { label: 'To do', type: 'info' },
        doing: { label: 'In progress', type: 'warning' },
        done: { label: 'Done', type: 'success' },
      },
    },
    {
      id: 'fld-owner', name: 'Owner', key: 'owner', type: 'text',
      label: 'Owner', required: false, readonly: false, order: 3,
      width: 120, visible: true, sortable: true, filterable: true,
    },
    {
      id: 'fld-due', name: 'Due date', key: 'dueDate', type: 'date',
      label: 'Due date', required: false, readonly: false, order: 4,
      width: 130, visible: true, sortable: true, filterable: true,
    },
    {
      id: 'fld-progress', name: 'Progress', key: 'progress', type: 'percent',
      label: 'Progress', required: false, readonly: false, order: 5,
      width: 110, visible: true, sortable: true, filterable: false, decimal: 0,
    },
    {
      id: 'fld-budget', name: 'Budget', key: 'budget', type: 'currency',
      label: 'Budget', required: false, readonly: false, order: 6,
      width: 130, visible: true, sortable: true, filterable: true, prefixStr: '$',
    },
    {
      id: 'fld-done', name: 'Accepted', key: 'accepted', type: 'boolean',
      label: 'Accepted', required: false, readonly: false, order: 7,
      width: 100, visible: true, sortable: true, filterable: true,
    },
    {
      id: 'fld-notes', name: 'Notes', key: 'notes', type: 'textarea',
      label: 'Notes', required: false, readonly: false, order: 8,
      width: 260, visible: true, sortable: false, filterable: false,
    },
  ],
  permissions: { view: true, create: true, edit: true, delete: true, export: true, configure: true },
  defaultViewMode: 'list',
}
