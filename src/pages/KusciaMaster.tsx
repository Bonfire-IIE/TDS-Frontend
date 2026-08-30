import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, Descriptions, Empty, Popconfirm, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, DeploymentUnitOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { deleteKusciaMaster, getKusciaMasterConfig } from '../api/kuscia'

const statusLabels: Record<string, { label: string; color: string }> = {
  unconfigured: { label: '未配置', color: 'default' },
  reachable: { label: '地址可达', color: 'processing' },
  credentials_uploaded: { label: '凭据已上传', color: 'warning' },
  connected: { label: '已连接', color: 'success' },
  error: { label: '异常', color: 'error' },
}

export default function KusciaMaster() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const config = useQuery({ queryKey: ['kuscia-master'], queryFn: getKusciaMasterConfig })
  const remove = useMutation({
    mutationFn: async () => {
      if (!config.data?.id) throw new Error('当前没有可清除的管理节点')
      await deleteKusciaMaster(config.data.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master'] })
      await queryClient.invalidateQueries({ queryKey: ['kuscia-master-onboarding'] })
      message.success('当前管理节点配置已清除')
      navigate('/setup/kuscia-master', { replace: true })
    },
    onError: (e: any) => message.error(e.response?.data?.detail || e.message || '清除失败'),
  })

  const master = config.data
  const status = statusLabels[master?.status || 'unconfigured'] || { label: master?.status || '未知', color: 'default' }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 920 }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>控制节点</Typography.Title>
      </div>

      <Space wrap>
        <Button type="primary" icon={<DeploymentUnitOutlined />} onClick={() => navigate('/setup/kuscia-master')}>
          返回管理节点引导
        </Button>
        <Button icon={<ReloadOutlined />} loading={config.isFetching} onClick={() => config.refetch()}>
          刷新状态
        </Button>
      </Space>

      {config.isError && <Alert type="error" showIcon message="读取管理节点失败" description={(config.error as any)?.response?.data?.detail || (config.error as Error)?.message} />}

      <Card title="当前管理节点" loading={config.isLoading}>
        {!master ? (
          <Empty description="尚未配置 Kuscia Master">
            <Button type="primary" onClick={() => navigate('/setup/kuscia-master')}>进入引导</Button>
          </Empty>
        ) : (
          <>
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="节点名称">{master.domain_id || '—'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={status.color}>{status.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="部署主机">{master.deployment_ip || master.host}</Descriptions.Item>
              <Descriptions.Item label="协议">{master.scheme || 'https'}</Descriptions.Item>
              <Descriptions.Item label="认证/网关端口 (-p)">{master.auth_port ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="KusciaAPI HTTP (-k)">{master.api_port ?? master.port}</Descriptions.Item>
              <Descriptions.Item label="KusciaAPI gRPC (-g)">{master.grpc_port ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="应用端口 (-q)">{master.app_port ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Metrics 端口 (-x)">{master.metrics_port ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="连接器接入地址">{master.deploy_endpoint || '—'}</Descriptions.Item>
            </Descriptions>
            {master.last_error && <Alert type="error" showIcon style={{ marginTop: 16 }} message="最近一次连接失败" description={master.last_error} />}
            <div style={{ marginTop: 16 }}>
              <Popconfirm
                title="清除当前管理节点？"
                description="此操作会删除平台配置及上传的凭据副本，但不会操作 Kuscia 容器。"
                okText="确认清除"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: remove.isPending }}
                onConfirm={() => remove.mutate()}
              >
                <Button danger icon={<DeleteOutlined />} loading={remove.isPending}>清除当前管理节点</Button>
              </Popconfirm>
            </div>
          </>
        )}
      </Card>
    </Space>
  )
}
