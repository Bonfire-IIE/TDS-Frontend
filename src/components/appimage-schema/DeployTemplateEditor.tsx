import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, Form, Input, InputNumber, Select, Space } from 'antd'
import { useEffect } from 'react'

const select = (values: string[]) => values.map((value) => ({ value, label: value }))
const Field = ({ name, label, children, ...rest }: any) => <Form.Item name={name} label={label} {...rest}>{children}</Form.Item>

export default function DeployTemplateEditor({ value, onChange, disabled }: { value?: any[]; onChange?: (value: any[]) => void; disabled?: boolean }) {
  const [form] = Form.useForm()
  useEffect(() => form.setFieldsValue({ templates: value ?? [] }), [form, value])
  return <Form form={form} layout="vertical" component={false} onValuesChange={(_, all) => onChange?.(all.templates ?? [])}>
    <Form.List name="templates">{(templates, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {templates.map((t) => <Card key={t.key} size="small" title={<Space><span>部署模板</span><Form.Item name={[t.name, 'name']} noStyle><Input placeholder="名称，如 bpsi" disabled={disabled} /></Form.Item></Space>} extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(t.name)} />}>
        <Space wrap style={{ width: '100%' }}><Field name={[t.name, 'role']} label="角色"><Input placeholder="sender / recver" disabled={disabled} /></Field><Field name={[t.name, 'replicas']} label="副本数"><InputNumber min={1} disabled={disabled} /></Field><Field name={[t.name, 'restart_policy']} label="重启策略"><Select options={select(['Never', 'Always', 'OnFailure'])} disabled={disabled} /></Field><Field name={[t.name, 'network_policy']} label="网络策略"><Input placeholder="可选 JSON" disabled={disabled} /></Field></Space>
        <Form.List name={[t.name, 'containers']}>{(containers, { add: addContainer, remove: removeContainer }) => <Space direction="vertical" style={{ width: '100%' }}>
          {containers.map((c) => <Card key={c.key} type="inner" size="small" title={<Space>容器<Form.Item name={[c.name, 'name']} noStyle><Input placeholder="容器名称" disabled={disabled} /></Form.Item></Space>} extra={<Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeContainer(c.name)} />}>
            <Form.Item
              name={[c.name, 'command']}
              label="command"
              labelCol={{ span: 24 }}
              wrapperCol={{ span: 24 }}
              style={{ display: 'block', marginBottom: 18, width: '100%' }}
            >
              <Select mode="tags" tokenSeparators={[' ']} maxTagTextLength={72} style={{ width: '100%' }} disabled={disabled} placeholder="例如 sh -c" />
            </Form.Item>
            <Form.Item
              name={[c.name, 'args']}
              label="args"
              labelCol={{ span: 24 }}
              wrapperCol={{ span: 24 }}
              style={{ display: 'block', marginBottom: 18, width: '100%' }}
            >
              <Select mode="tags" tokenSeparators={[' ']} maxTagTextLength={72} style={{ width: '100%' }} disabled={disabled} placeholder="命令参数（可选）" />
            </Form.Item>
            <Space wrap style={{ width: '100%' }}><Field name={[c.name, 'working_dir']} label="工作目录"><Input disabled={disabled} /></Field><Field name={[c.name, 'image_pull_policy']} label="镜像拉取策略"><Select options={select(['Always', 'IfNotPresent', 'Never'])} disabled={disabled} /></Field></Space>
            <Collapse items={[
              { key: 'mounts', label: 'ConfigVolumeMount（配置挂载）', children: <Form.List name={[c.name, 'config_volume_mounts']}>{(fs, { add: addF, remove: removeF }) => <Space direction="vertical" style={{ width: '100%' }}>{fs.map((f) => <Space key={f.key} wrap><Field name={[f.name, 'mount_path']} label="mountPath"><Input disabled={disabled} /></Field><Field name={[f.name, 'sub_path']} label="subPath"><Input disabled={disabled} /></Field><Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeF(f.name)} /></Space>)}<Button size="small" icon={<PlusOutlined />} onClick={() => addF({})}>添加挂载</Button></Space>}</Form.List> },
              { key: 'ports', label: 'ContainerPort（端口）', children: <Form.List name={[c.name, 'ports']}>{(ps, { add: addP, remove: removeP }) => <Space direction="vertical" style={{ width: '100%' }}>{ps.map((p) => <Space key={p.key} wrap><Field name={[p.name, 'name']} label="名称"><Input disabled={disabled} /></Field><Field name={[p.name, 'protocol']} label="协议"><Select options={select(['HTTP', 'GRPC'])} disabled={disabled} /></Field><Field name={[p.name, 'scope']} label="作用域"><Select options={select(['Cluster', 'Domain', 'Local'])} disabled={disabled} /></Field><Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeP(p.name)} /></Space>)}<Button size="small" icon={<PlusOutlined />} onClick={() => addP({ protocol: 'HTTP', scope: 'Cluster' })}>添加端口</Button></Space>}</Form.List> },
              { key: 'env', label: 'EnvVar（环境变量）', children: <Form.List name={[c.name, 'env']}>{(es, { add: addE, remove: removeE }) => <Space direction="vertical" style={{ width: '100%' }}>{es.map((e) => <Space key={e.key} wrap><Field name={[e.name, 'name']} label="名称"><Input disabled={disabled} /></Field><Field name={[e.name, 'value']} label="值"><Input disabled={disabled} /></Field><Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeE(e.name)} /></Space>)}<Button size="small" icon={<PlusOutlined />} onClick={() => addE({})}>添加环境变量</Button></Space>}</Form.List> },
              { key: 'envfrom', label: 'EnvFromSource（环境变量来源）', children: <Form.List name={[c.name, 'env_from']}>{(es, { add: addE, remove: removeE }) => <Space direction="vertical" style={{ width: '100%' }}>{es.map((e) => <Space key={e.key} wrap><Field name={[e.name, 'config_map_ref']} label="ConfigMap"><Input disabled={disabled} /></Field><Field name={[e.name, 'secret_ref']} label="Secret"><Input disabled={disabled} /></Field><Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeE(e.name)} /></Space>)}<Button size="small" icon={<PlusOutlined />} onClick={() => addE({})}>添加来源</Button></Space>}</Form.List> },
              { key: 'resources', label: 'ResourceRequirements（资源）', children: <Space wrap><Field name={[c.name, 'resources', 'limits', 'cpu']} label="限制 CPU"><Input placeholder="如 1" disabled={disabled} /></Field><Field name={[c.name, 'resources', 'limits', 'memory']} label="限制内存"><Input placeholder="如 2Gi" disabled={disabled} /></Field><Field name={[c.name, 'resources', 'requests', 'cpu']} label="请求 CPU"><Input disabled={disabled} /></Field><Field name={[c.name, 'resources', 'requests', 'memory']} label="请求内存"><Input disabled={disabled} /></Field></Space> },
              ...(['liveness_probe', 'readiness_probe', 'startup_probe'] as const).map((probe) => ({ key: probe, label: `Probe（${probe.replace('_probe', '')}）`, children: <Space wrap><Field name={[c.name, probe, 'exec', 'command']} label="Exec 命令"><Select mode="tags" disabled={disabled} style={{ minWidth: 220 }} /></Field><Field name={[c.name, probe, 'http_get', 'path']} label="HTTP 路径"><Input disabled={disabled} /></Field><Field name={[c.name, probe, 'period_seconds']} label="周期"><InputNumber min={1} disabled={disabled} /></Field><Field name={[c.name, probe, 'failure_threshold']} label="失败阈值"><InputNumber min={1} disabled={disabled} /></Field></Space> })),
            ]} />
          </Card>)}
          <Button type="dashed" icon={<PlusOutlined />} onClick={() => addContainer({ command: ['sh', '-c', 'sleep 1'], ports: [] })}>添加容器</Button>
        </Space>}</Form.List>
      </Card>)}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ name: 'app', replicas: 1, restart_policy: 'Never', containers: [] })}>添加部署模板</Button>
    </Space>}</Form.List>
  </Form>
}
