import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Space } from 'antd'
import { useEffect } from 'react'
import type { PartyRoleDefinition, PartySchema } from './types'

export interface RoleSchemaEditorProps {
  value?: PartySchema | null
  onChange?: (value: PartySchema) => void
  disabled?: boolean
}

export function RoleSchemaEditor({ value, onChange, disabled }: RoleSchemaEditorProps) {
  const [form] = Form.useForm<{ roles: PartyRoleDefinition[] }>()

  useEffect(() => {
    form.setFieldsValue({ roles: value?.roles ?? [] })
  }, [form, value])

  return (
    <Form form={form} component={false} onValuesChange={(_, all) => onChange?.({ roles: all.roles ?? [] })}>
      <Form.List name="roles">
        {(fields, { add, remove }) => (
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {fields.map((field) => (
              <Space key={field.key} align="start" wrap style={{ width: '100%' }}>
                <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true, message: '请输入角色标识' }, { pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/, message: '仅支持字母、数字、_、-' }]}>
                  <Input placeholder="角色标识，如 receiver" disabled={disabled} style={{ width: 190 }} />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'title']} rules={[{ required: true, message: '请输入展示名称' }]}>
                  <Input placeholder="展示名称" disabled={disabled} style={{ width: 160 }} />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'min']} initialValue={1} rules={[{ required: true }]}>
                  <InputNumber min={0} precision={0} placeholder="最少" disabled={disabled} style={{ width: 90 }} />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'max']} initialValue={1} rules={[{ required: true }]}>
                  <InputNumber min={1} precision={0} placeholder="最多" disabled={disabled} style={{ width: 90 }} />
                </Form.Item>
                <Form.Item {...field} name={[field.name, 'description']}>
                  <Input placeholder="说明（选填）" disabled={disabled} style={{ width: 200 }} />
                </Form.Item>
                <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => remove(field.name)} aria-label="删除角色" />
              </Space>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} disabled={disabled} onClick={() => add({ min: 1, max: 1 })} block>
              新增参与方角色
            </Button>
          </Space>
        )}
      </Form.List>
    </Form>
  )
}
