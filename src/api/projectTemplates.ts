import { api, ApiResp } from './client'

export interface ProjectTemplate {
  id: string
  name: string
  description: string | null
  workflow: Record<string, unknown>
  owner: string
  created_at: string
  updated_at: string
}

export type ProjectTemplateInput = Pick<ProjectTemplate, 'name' | 'workflow'> & { description?: string }

export async function listProjectTemplates() {
  const { data } = await api.get<ApiResp<ProjectTemplate[]>>('/project-templates')
  return data.data
}

export async function createProjectTemplate(body: ProjectTemplateInput) {
  const { data } = await api.post<ApiResp<ProjectTemplate>>('/project-templates', body)
  return data.data
}

export async function updateProjectTemplate(id: string, body: Partial<ProjectTemplateInput>) {
  const { data } = await api.put<ApiResp<ProjectTemplate>>(`/project-templates/${id}`, body)
  return data.data
}

export async function deleteProjectTemplate(id: string) {
  await api.delete(`/project-templates/${id}`)
}
