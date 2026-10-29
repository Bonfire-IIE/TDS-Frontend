import { useState } from 'react'
import { Card, Form, Input, Button, message, Typography } from 'antd'
import { FireOutlined, UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api/client'

const { Title, Text } = Typography

interface RegisterForm {
  username: string
  password: string
  confirm: string
  email: string
  first_name?: string
  last_name?: string
}

export default function Register() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const onFinish = async (v: RegisterForm) => {
    setLoading(true)
    try {
      await register(v.username, v.password, v.email, v.first_name, v.last_name)
      message.success('注册成功，请登录')
      navigate('/login')
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="auth-brand" aria-hidden="true"><FireOutlined /></div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Bonfire-TDS
          </Title>
          <Text type="secondary">注册新账号</Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" aria-label="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" aria-label="密码" />
          </Form.Item>
          <Form.Item
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱地址' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="last_name">
            <Input placeholder="姓（可选）" />
          </Form.Item>
          <Form.Item name="first_name">
            <Input placeholder="名（可选）" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            已有账号？<Link to="/login">去登录</Link>
          </Text>
        </div>
      </Card>
    </div>
  )
}
