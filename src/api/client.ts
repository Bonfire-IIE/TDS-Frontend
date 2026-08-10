import axios from 'axios'

export const TOKEN_KEY = 'bonfire_token'

// 统一 API 客户端。后端统一响应 {code, message, data}
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

// 请求拦截：附带 Bearer 令牌
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：401 -> 清除令牌并跳转登录
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export interface ApiResp<T> {
  code: number
  message: string
  data: T
}

export interface ClusterStatus {
  kusciaApi: 'up' | 'down'
  domains: { domainId: string; role: string; nodeCount: number }[]
  error?: string
}

export interface HealthStatus {
  status: string
  services: Record<string, { ok: boolean; error?: string }>
}

export interface CurrentUser {
  username: string
  email?: string
  name?: string
  roles: string[]
  sub: string
}

export async function login(username: string, password: string) {
  const { data } = await api.post<ApiResp<{ access_token: string }>>('/identity/login', {
    username,
    password,
  })
  return data.data
}

export async function register(
  username: string,
  password: string,
  email: string,
  firstName?: string,
  lastName?: string,
) {
  const { data } = await api.post<ApiResp<{ id: string; username: string }>>(
    '/identity/register',
    {
      username,
      password,
      email,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
    },
  )
  return data.data
}

export async function getMe() {
  const { data } = await api.get<ApiResp<CurrentUser>>('/identity/me')
  return data.data
}

export async function getClusterStatus() {
  const { data } = await api.get<ApiResp<ClusterStatus>>('/cluster/status')
  return data.data
}

export async function getHealth() {
  const { data } = await api.get<ApiResp<HealthStatus>>('/health')
  return data.data
}
