import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Result, Row, Space, Spin,
  Steps, Typography, Upload, message,
} from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { CopyOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  getKusciaMasterDeployScript, getKusciaMasterOnboardingState,
  saveKusciaMasterConfig, testKusciaMaster, uploadKusciaCredentials,
  type KusciaMasterDeployInput, type KusciaMasterDeployScript,
} from '../api/kuscia'

const { Title, Text, Paragraph } = Typography
const errorMessage = (e: any) => e?.response?.data?.detail ?? e?.message ?? '操作失败'

const defaults: KusciaMasterDeployInput = {
  domain_id: 'bonfire-master',
  deployment_ip: '',
  gateway_port: 18080,
  api_port: 18081,
  kuscia_image: 'secretflow-registry.cn-hangzhou.cr.aliyuncs.com/secretflow/kuscia:1.2.0b0',
}

export default function KusciaMasterOnboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<KusciaMasterDeployInput>()
  const [current, setCurrent] = useState(0)
  const [script, setScript] = useState<KusciaMasterDeployScript>()
  const [masterId, setMasterId] = useState('')
  const [files, setFiles] = useState<Record<string, File>>({})

  const state = useQuery({
    queryKey: ['kuscia-master-onboarding'],
    queryFn: getKusciaMasterOnboardingState,
  })

  useEffect(() => {
    const master = state.data?.master
    if (!master) return
    setMasterId(master.id || '')
    form.setFieldsValue({
      deployment_ip: master.deployment_ip || master.host,
      api_port: master.api_port || master.port,
      gateway_port: Number(master.deploy_endpoint?.match(/:(\d+)$/)?.[1] || 18080),
    })
    if (state.data?.completed) setCurrent(2)
    else setCurrent(1)
  }, [state.data, form])

  const generate = useMutation({
    mutationFn: getKusciaMasterDeployScript,
    onSuccess: (value) => { setScript(value); message.success('部署脚本已生成') },
    onError: (e) => message.error(errorMessage(e)),
  })

  const persist = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields()
      const saved = await saveKusciaMasterConfig({
        id: masterId || undefined,
        host: values.deployment_ip,
        port: values.api_port,
        scheme: 'https',
        deploy_endpoint: script?.deploy_endpoint || `https://${values.deployment_ip}:${values.gateway_port}`,
      })
      setMasterId(saved.id || '')
      return saved
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master-onboarding'] })
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master'] })
      setCurrent(1)
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  const finish = useMutation({
    mutationFn: async () => {
      if (!masterId) throw new Error('缺少 Kuscia Master 配置，请先保存部署结果')
      if (Object.keys(files).length !== 4) throw new Error('请上传全部四个凭据文件')
      await uploadKusciaCredentials(masterId, files as any)
      const result = await testKusciaMaster(masterId)
      if (!result.ok) throw new Error(result.message || 'Kuscia Master 连接测试失败')
      return result
    },
    onSuccess: async () => {
      message.success('Kuscia Master 已接入中心平台')
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master-onboarding'] })
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master'] })
      setCurrent(2)
    },
    onError: (e) => message.error(errorMessage(e)),
  })

  if (state.isLoading) return <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (state.isError) return <Result status="error" title="无法检测 Kuscia Master" subTitle={errorMessage(state.error)} extra={<Button onClick={() => state.refetch()}>重试</Button>} />

  const copyScript = async () => {
    if (!script) return
    await navigator.clipboard.writeText(script.commands)
    message.success('脚本已复制')
  }
  const downloadScript = () => {
    if (!script) return
    const url = URL.createObjectURL(new Blob([script.commands], { type: 'text/x-shellscript' }))
    const a = document.createElement('a'); a.href = url; a.download = 'deploy-kuscia-master.sh'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '32px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>🔥 中心平台初始化向导</Title>
          <Text type="secondary">检测配置 → 部署 Kuscia Master → 上传凭据并验证</Text>
        </div>
        <Card>
          <Steps current={current} items={[{ title: '部署 Master' }, { title: '接入平台' }, { title: '完成' }]} style={{ marginBottom: 32 }} />

          {current === 0 && <>
            <Alert type="info" showIcon style={{ marginBottom: 20 }} message="未检测到可用的 Kuscia Master" description="填写 Master 将部署到的主机地址，向导会生成一键脚本。脚本由你在目标主机执行，中心平台不会远程操作主机。" />
            <Form form={form} layout="vertical" initialValues={defaults} onFinish={(v) => generate.mutate(v)}>
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name="domain_id" label="Master 节点 ID" rules={[{ required: true }, { pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, message: '请输入 RFC1123 小写标签' }]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="deployment_ip" label="部署主机 IP" rules={[{ required: true }]}><Input placeholder="如 10.2.0.11" /></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><Form.Item name="gateway_port" label="连接器接入端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
                <Col span={12}><Form.Item name="api_port" label="中心平台 API 端口" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Form.Item name="kuscia_image" label="Kuscia 镜像" rules={[{ required: true }]}><Input /></Form.Item>
              <Button type="primary" htmlType="submit" loading={generate.isPending}>生成部署脚本</Button>
            </Form>
            {script && <Space direction="vertical" style={{ width: '100%', marginTop: 24 }}>
              <Alert type="success" showIcon message="在 Kuscia Master 主机执行以下脚本" description={`KusciaAPI 将登记为 ${script.api_endpoint}`} />
              <Space><Button icon={<CopyOutlined />} onClick={copyScript}>复制</Button><Button icon={<DownloadOutlined />} onClick={downloadScript}>下载 .sh</Button></Space>
              <pre style={{ maxHeight: 420, overflow: 'auto', color: '#eee', background: '#1f1f1f', padding: 16, borderRadius: 8 }}>{script.commands}</pre>
              <Button type="primary" onClick={() => persist.mutate()} loading={persist.isPending}>我已完成部署，继续</Button>
            </Space>}
          </>}

          {current === 1 && <>
            <Alert type="info" showIcon style={{ marginBottom: 20 }} message="上传 Master KusciaAPI 凭据" description="选择部署脚本最后导出的 ca.crt、kusciaapi-server.crt、kusciaapi-server.key 和 token。文件保存在后端受限目录，数据库只记录路径引用。" />
            <Space wrap>{(['ca', 'cert', 'key', 'token'] as const).map((name) => <Upload key={name} maxCount={1} beforeUpload={(file) => { setFiles((old) => ({ ...old, [name]: file as File })); return false }} onRemove={() => { setFiles((old) => { const next = { ...old }; delete next[name]; return next }) }}><Button icon={<UploadOutlined />}>{name === 'ca' ? '选择 ca.crt' : name === 'cert' ? '选择客户端证书' : name === 'key' ? '选择客户端私钥' : '选择 token'}</Button></Upload>)}</Space>
            <Paragraph type="secondary" style={{ marginTop: 16 }}>上传后向导会立即使用这组凭据查询 kuscia-system，验证通过才会完成接入。</Paragraph>
            <Space><Button onClick={() => setCurrent(0)}>返回部署步骤</Button><Button type="primary" disabled={Object.keys(files).length !== 4} loading={finish.isPending} onClick={() => finish.mutate()}>上传并验证</Button></Space>
          </>}

          {current === 2 && <Result status="success" title="Kuscia Master 已接入" subTitle="引导页和中心平台控制节点页面共享同一条配置，无需再次填写。" extra={[<Button type="primary" key="platform" onClick={() => navigate('/cluster')}>进入中心平台</Button>, <Button key="master" onClick={() => navigate('/kuscia-master')}>查看控制节点</Button>]} />}
        </Card>
      </div>
    </div>
  )
}
