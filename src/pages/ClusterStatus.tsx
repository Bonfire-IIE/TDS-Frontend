import { useQuery } from '@tanstack/react-query'
import { Card, Table, Tag, Space, Badge, Button, Alert, Descriptions } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { getClusterStatus, getHealth } from '../api/client'

export default function ClusterStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: 10000 })
  const cluster = useQuery({ queryKey: ['cluster'], queryFn: getClusterStatus, refetchInterval: 10000 })

  const refresh = () => {
    health.refetch()
    cluster.refetch()
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="服务依赖健康"
        extra={<Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>}
        loading={health.isLoading}
      >
        {health.isError ? (
          <Alert type="error" message="无法连接后端 /health" showIcon />
        ) : (
          <Descriptions column={3} bordered size="small">
            {health.data &&
              Object.entries(health.data.services).map(([name, s]) => (
                <Descriptions.Item key={name} label={name}>
                  <Badge
                    status={s.ok ? 'success' : 'error'}
                    text={s.ok ? '正常' : (s.error ?? '异常')}
                  />
                </Descriptions.Item>
              ))}
          </Descriptions>
        )}
      </Card>

      <Card title="Kuscia 集群节点" loading={cluster.isLoading}>
        {cluster.data?.kusciaApi === 'down' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="KusciaAPI 不可达"
            description={cluster.data?.error}
          />
        )}
        <Table
          rowKey="domainId"
          pagination={false}
          dataSource={cluster.data?.domains ?? []}
          columns={[
            { title: '节点 (Domain)', dataIndex: 'domainId' },
            {
              title: '角色',
              dataIndex: 'role',
              render: (r: string) => (
                <Tag color={r === 'partner' ? 'blue' : 'geekblue'}>{r}</Tag>
              ),
            },
            { title: '工作节点数', dataIndex: 'nodeCount' },
          ]}
        />
      </Card>
    </Space>
  )
}
