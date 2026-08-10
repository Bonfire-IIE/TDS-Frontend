import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Form, Input, InputNumber, Space, Typography, message } from 'antd'
import { CheckCircleOutlined, ApiOutlined } from '@ant-design/icons'
import { getKusciaMasterConfig, saveKusciaMasterConfig, testKusciaMasterConfig, KusciaMasterConfig } from '../api/kuscia'

export default function KusciaMaster() {
  const [form] = Form.useForm<KusciaMasterConfig>()
  const config = useQuery({ queryKey: ['kuscia-master'], queryFn: getKusciaMasterConfig })
  const save = useMutation({ mutationFn: saveKusciaMasterConfig, onSuccess: (v) => { form.setFieldsValue(v); message.success('Kuscia Master 配置已保存'); config.refetch() } })
  const test = useMutation({ mutationFn: testKusciaMasterConfig, onSuccess: (v) => v.ok ? message.success('连接成功') : message.error(v.message || '连接失败'), onError: () => message.error('连接测试失败') })
  useEffect(() => { if (config.data) form.setFieldsValue(config.data) }, [config.data, form])

  return <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 820 }}>
    <div><Typography.Title level={3} style={{ marginBottom: 4 }}>Kuscia Master 节点</Typography.Title><Typography.Text type="secondary">配置中心平台访问的 Kuscia Master 地址。Kuscia 集群需由管理员单独部署。</Typography.Text></div>
    {config.isError && <Alert type="warning" showIcon message="尚未读取到 Master 配置" description="请填写并保存 Kuscia Master 的部署 IP 和端口。" />}
    <Card title="导入 Kuscia Master" extra={<ApiOutlined />} loading={config.isLoading}>
      <Form form={form} layout="vertical" initialValues={{ scheme: 'http', port: 18080 }} onFinish={(v) => save.mutate(v)}>
        <Space align="start" style={{ width: '100%' }}>
          <Form.Item name="scheme" label="协议" rules={[{ required: true }]}><Input style={{ width: 110 }} /></Form.Item>
          <Form.Item name="host" label="部署 IP / 主机名" rules={[{ required: true, message: '请输入 Master 地址' }]} style={{ flex: 1 }}><Input placeholder="如 10.0.0.10" /></Form.Item>
          <Form.Item name="port" label="端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: 120 }} /></Form.Item>
        </Space>
        <Form.Item noStyle shouldUpdate>{() => <Typography.Text type="secondary">当前地址：{form.getFieldValue('scheme') || 'http'}://{form.getFieldValue('host') || '<host>'}:{form.getFieldValue('port') || 18080}</Typography.Text>}</Form.Item>
        <div style={{ marginTop: 24 }}><Space><Button type="primary" htmlType="submit" loading={save.isPending} icon={<CheckCircleOutlined />}>保存配置</Button><Button loading={test.isPending} onClick={() => form.validateFields().then((v) => test.mutate(v))}>测试连接</Button></Space></div>
      </Form>
    </Card>
  </Space>
}
