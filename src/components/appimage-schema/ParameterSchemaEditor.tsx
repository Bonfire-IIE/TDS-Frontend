import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { useEffect } from 'react'
import type { JsonSchemaProperty, ParameterFieldType, ParameterSchema, ParameterSchemaValue, UiSchema } from './types'

interface ParameterRow {
  name: string
  title?: string
  description?: string
  fieldType: ParameterFieldType
  required?: boolean
  defaultValue?: unknown
  enumOptions?: string[]
  widget?: string
}

export interface ParameterSchemaEditorProps {
  value?: Partial<ParameterSchemaValue> | null
  onChange?: (value: ParameterSchemaValue) => void
  disabled?: boolean
}

const emptySchema: ParameterSchema = { type: 'object', properties: {} }

function inferType(property: JsonSchemaProperty): ParameterFieldType {
  if (property.enum) return 'enum'
  if (property.type === 'array' && property.items?.type === 'string') return 'string_array'
  if (property.type === 'number' || property.type === 'integer') return 'number'
  if (property.type === 'boolean') return 'boolean'
  return 'string'
}

function toRows(parameterSchema: ParameterSchema, uiSchema: UiSchema): ParameterRow[] {
  const required = new Set(parameterSchema.required ?? [])
  return Object.entries(parameterSchema.properties ?? {}).map(([name, property]) => ({
    name,
    title: property.title,
    description: property.description,
    fieldType: inferType(property),
    required: required.has(name),
    defaultValue: property.default,
    enumOptions: property.enum,
    widget: uiSchema[name]?.['ui:widget'] as string | undefined,
  }))
}

function fromRows(rows: ParameterRow[]): ParameterSchemaValue {
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  const uiSchema: UiSchema = {}
  rows.filter((row) => row.name).forEach((row) => {
    const common = { title: row.title, description: row.description, default: row.defaultValue }
    const property: JsonSchemaProperty = row.fieldType === 'enum'
      ? { ...common, type: 'string', enum: row.enumOptions ?? [] }
      : row.fieldType === 'string_array'
        ? { ...common, type: 'array', items: { type: 'string' } }
        : { ...common, type: row.fieldType }
    Object.keys(property).forEach((key) => property[key] === undefined && delete property[key])
    properties[row.name] = property
    if (row.required) required.push(row.name)
    if (row.widget) uiSchema[row.name] = { 'ui:widget': row.widget }
  })
  return { parameterSchema: { type: 'object', properties, ...(required.length ? { required } : {}) }, uiSchema }
}

export function ParameterSchemaEditor({ value, onChange, disabled }: ParameterSchemaEditorProps) {
  const [form] = Form.useForm<{ parameters: ParameterRow[] }>()
  useEffect(() => {
    form.setFieldsValue({ parameters: toRows((value?.parameterSchema as ParameterSchema) ?? emptySchema, value?.uiSchema ?? {}) })
  }, [form, value])

  return (
    <Form form={form} component={false} onValuesChange={(_, all) => onChange?.(fromRows(all.parameters ?? []))}>
      <Form.List name="parameters">
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {fields.map((field) => (
              <ParameterRowFields key={field.key} field={field} disabled={disabled} remove={() => remove(field.name)} />
            ))}
            <Button type="dashed" icon={<PlusOutlined />} disabled={disabled} onClick={() => add({ name: `parameter_${fields.length + 1}`, title: `参数 ${fields.length + 1}`, fieldType: 'string', required: false })} block>
              新增应用参数
            </Button>
          </Space>
        )}
      </Form.List>
    </Form>
  )
}

function ParameterRowFields({ field, disabled, remove }: { field: { key: number; name: number }; disabled?: boolean; remove: () => void }) {
  const fieldType = Form.useWatch(['parameters', field.name, 'fieldType']) as ParameterFieldType | undefined
  return (
    <div style={{ padding: 12, border: '1px solid #f0f0f0', borderRadius: 8 }}>
      <Space align="start" wrap>
        <Form.Item name={[field.name, 'name']} rules={[{ required: true, message: '请输入参数名' }, { pattern: /^[a-zA-Z][a-zA-Z0-9_.-]*$/, message: '参数名格式无效' }]}><Input placeholder="参数名" disabled={disabled} style={{ width: 150 }} /></Form.Item>
        <Form.Item name={[field.name, 'title']} rules={[{ required: true, message: '请输入展示名称' }]}><Input placeholder="展示名称" disabled={disabled} style={{ width: 150 }} /></Form.Item>
        <Form.Item name={[field.name, 'fieldType']} rules={[{ required: true }]}>
          <Select disabled={disabled} style={{ width: 130 }} options={[
            { value: 'string', label: '文本' }, { value: 'number', label: '数字' }, { value: 'boolean', label: '布尔值' },
            { value: 'enum', label: '枚举' }, { value: 'string_array', label: '文本数组' },
          ]} />
        </Form.Item>
        <Form.Item name={[field.name, 'required']} valuePropName="checked" label="必填"><Switch disabled={disabled} /></Form.Item>
        {fieldType === 'boolean' ? (
          <Form.Item name={[field.name, 'defaultValue']} valuePropName="checked" label="默认值"><Switch disabled={disabled} /></Form.Item>
        ) : fieldType === 'number' ? (
          <Form.Item name={[field.name, 'defaultValue']}><InputNumber placeholder="默认值" disabled={disabled} /></Form.Item>
        ) : fieldType === 'string_array' ? (
          <Form.Item name={[field.name, 'defaultValue']}><Select mode="tags" tokenSeparators={[',']} placeholder="默认值" disabled={disabled} style={{ minWidth: 180 }} /></Form.Item>
        ) : (
          <Form.Item name={[field.name, 'defaultValue']}><Input placeholder="默认值" disabled={disabled} style={{ width: 150 }} /></Form.Item>
        )}
        <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={remove} aria-label="删除参数" />
      </Space>
      <Space align="start" wrap>
        <Form.Item name={[field.name, 'description']}><Input placeholder="参数说明（选填）" disabled={disabled} style={{ width: 320 }} /></Form.Item>
        {fieldType === 'enum' && <Form.Item name={[field.name, 'enumOptions']} rules={[{ required: true, message: '请添加枚举选项' }]}><Select mode="tags" tokenSeparators={[',']} placeholder="输入枚举选项后回车" disabled={disabled} style={{ minWidth: 260 }} /></Form.Item>}
        <Form.Item name={[field.name, 'widget']}><Input placeholder="UI 控件（选填）" disabled={disabled} style={{ width: 180 }} /></Form.Item>
      </Space>
    </div>
  )
}
