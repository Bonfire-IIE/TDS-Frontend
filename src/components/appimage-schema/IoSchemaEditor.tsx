import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select, Space, Switch, Typography } from 'antd'
import { useEffect } from 'react'
import type { IoPortDefinition, IoSchema, PartyRoleDefinition } from './types'

export interface IoSchemaEditorProps {
  value?: Partial<IoSchema> | null
  onChange?: (value: IoSchema) => void
  roles?: PartyRoleDefinition[]
  disabled?: boolean
}

const kindOptions = ['table', 'file', 'image', 'text', 'model', 'custom'].map((value) => ({ value, label: value }))

export function IoSchemaEditor({ value, onChange, roles = [], disabled }: IoSchemaEditorProps) {
  const [form] = Form.useForm<IoSchema>()
  useEffect(() => form.setFieldsValue({ inputs: value?.inputs ?? [], outputs: value?.outputs ?? [] }), [form, value])

  const renderPorts = (direction: 'inputs' | 'outputs', title: string) => (
    <Form.List name={direction}>
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Typography.Text strong>{title}</Typography.Text>
          {fields.map((field) => (
            <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
              <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true, message: '请输入端口标识' }, { pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/, message: '端口标识格式无效' }]}>
                <Input placeholder="端口标识" disabled={disabled} style={{ width: 150 }} />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'title']} rules={[{ required: true, message: '请输入展示名称' }]}>
                <Input placeholder="展示名称" disabled={disabled} style={{ width: 150 }} />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'kind']} initialValue="table" rules={[{ required: true }]}>
                <Select options={kindOptions} placeholder="数据类型" disabled={disabled} style={{ width: 110 }} />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'role']}>
                <Select allowClear options={roles.map((r) => ({ value: r.name, label: r.title || r.name }))} placeholder="所属角色" disabled={disabled} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'formats']}>
                <Select mode="tags" tokenSeparators={[',']} placeholder="格式：csv" disabled={disabled} style={{ width: 150 }} />
              </Form.Item>
              <Form.Item {...field} name={[field.name, 'source_types']}>
                <Select mode="tags" tokenSeparators={[',']} options={['*', 'localfs', 'oss', 'database'].map((v) => ({ value: v, label: v }))} placeholder="数据源类型" disabled={disabled} style={{ width: 170 }} />
              </Form.Item>
              {direction === 'inputs' && <Form.Item {...field} name={[field.name, 'required']} valuePropName="checked" label="必填"><Switch disabled={disabled} /></Form.Item>}
              <Form.Item {...field} name={[field.name, 'multiple']} valuePropName="checked" label="多值"><Switch disabled={disabled} /></Form.Item>
              <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => remove(field.name)} aria-label={`删除${title}`} />
            </Space>
          ))}
          <Button type="dashed" icon={<PlusOutlined />} disabled={disabled} onClick={() => add({ kind: 'table', required: direction === 'inputs', multiple: false })}>
            新增{title}
          </Button>
        </Space>
      )}
    </Form.List>
  )

  return (
    <Form form={form} component={false} onValuesChange={(_, all) => onChange?.({ inputs: all.inputs ?? [], outputs: all.outputs ?? [] })}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {renderPorts('inputs', '输入端口')}
        {renderPorts('outputs', '输出端口')}
      </Space>
    </Form>
  )
}
