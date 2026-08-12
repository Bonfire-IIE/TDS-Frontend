import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Form, Input, InputNumber, Space, Typography, message, Upload, Select } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { CheckCircleOutlined, ApiOutlined } from '@ant-design/icons'
import { getKusciaMasterConfig, saveKusciaMasterConfig, uploadKusciaCredentials, testKusciaMaster, probeKusciaMaster, KusciaMasterConfig } from '../api/kuscia'

export default function KusciaMaster() {
  const [form] = Form.useForm<KusciaMasterConfig>()
  const config = useQuery({ queryKey: ['kuscia-master'], queryFn: getKusciaMasterConfig })
  const save = useMutation({ mutationFn: saveKusciaMasterConfig, onSuccess: async (v) => { form.setFieldsValue(v); const p = await probeKusciaMaster(v.id!); p.ok ? message.success('控制节点地址已保存，探活成功') : message.warning(`地址已保存，但探活失败：${p.message}`); config.refetch() }, onError: (e: any) => message.error(e.response?.data?.detail || e.message || '控制节点配置保存失败') })
  const upload = useMutation({ mutationFn: async (files: Record<string, File>) => { const id = config.data?.id; if (!id) throw new Error('请先保存控制节点地址'); return uploadKusciaCredentials(id, { ca: files.ca, cert: files.cert, key: files.key, token: files.token }) }, onSuccess: () => message.success('凭据已上传'), onError: (e: any) => message.error(e.response?.data?.detail || e.message) })
  const [files, setFiles] = useState<Record<string, File>>({})
  useEffect(() => { if (config.data) form.setFieldsValue(config.data) }, [config.data, form])

  return <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 820 }}>
    <div><Typography.Title level={3} style={{ marginBottom: 4 }}>控制节点</Typography.Title><Typography.Text type="secondary">配置中心平台访问的 Kuscia 控制节点地址与凭据。</Typography.Text></div>
    {config.isError && <Alert type="warning" showIcon message="尚未读取到 Master 配置" description="请填写并保存 Kuscia Master 的部署 IP 和端口。" />}
    <Card title="导入 Kuscia Master" extra={<ApiOutlined />} loading={config.isLoading}>
      <Form form={form} layout="vertical" initialValues={{ scheme: 'http', port: 18080 }} onFinish={(v) => save.mutate({ ...v, id: config.data?.id })}>
        <Space align="start" style={{ width: '100%' }}>
          <Form.Item name="scheme" label="协议" rules={[{ required: true }]}><Select style={{ width: 120 }} options={[{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }]} /></Form.Item>
          <Form.Item name="host" label="部署 IP / 主机名" rules={[{ required: true, message: '请输入 Master 地址' }]} style={{ flex: 1 }}><Input placeholder="如 10.0.0.10" /></Form.Item>
          <Form.Item name="port" label="端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: 120 }} /></Form.Item>
        </Space>
        <Form.Item noStyle shouldUpdate>{() => <Typography.Text type="secondary">当前地址：{form.getFieldValue('scheme') || 'http'}://{form.getFieldValue('host') || '<host>'}:{form.getFieldValue('port') || 18080}</Typography.Text>}</Form.Item>
        <div style={{ marginTop: 24 }}><Space><Button type="primary" htmlType="submit" loading={save.isPending} icon={<CheckCircleOutlined />}>保存配置</Button></Space></div>
      </Form>
      <Alert type="info" showIcon style={{ marginTop: 20 }} message="如何获取凭据" description={<div>在运行 Kuscia Master 的主机执行（与连接器门户一致）：<pre style={{ margin: '8px 0' }}>mkdir -p ./kuscia-master-certs && docker cp "$(docker ps -qf name=kuscia-master | head -n1)":/home/kuscia/var/certs/. ./kuscia-master-certs/ && ls -1 ./kuscia-master-certs</pre>将生成目录中的 ca.crt、kusciaapi-server.crt、kusciaapi-server.key 和 token 四个文件分别上传。凭据只保存于后端受限目录，不进入数据库。</div>} />
      <Space wrap style={{ marginTop: 16 }}>{(['ca', 'cert', 'key', 'token'] as const).map((name) => <Upload key={name} maxCount={1} beforeUpload={(file) => { setFiles((x) => ({ ...x, [name]: file as File })); return false }} onRemove={() => { setFiles((x) => { const y = { ...x }; delete y[name]; return y }) }}><Button>{name === 'ca' ? '选择 ca.crt' : name === 'cert' ? '选择客户端证书' : name === 'key' ? '选择客户端私钥' : '选择 token'}</Button></Upload>)}</Space>
      <Space style={{ marginTop: 16 }}><Button type="primary" disabled={Object.keys(files).length !== 4 || Object.values(files).some((f) => !(f instanceof File)) || !config.data?.id} loading={upload.isPending} onClick={() => upload.mutate(files)}>上传凭据</Button><Button disabled={!config.data?.id} onClick={() => config.data?.id && testKusciaMaster(config.data.id).then((v) => v.ok ? message.success('Kuscia Master 连接成功') : message.error(v.message || '连接失败')).catch((e) => message.error(e.response?.data?.detail || '连接测试失败'))}>测试已上传凭据</Button></Space>
    </Card>
  </Space>
}
