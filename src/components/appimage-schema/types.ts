export interface PartyRoleDefinition {
  name: string
  title: string
  min: number
  max: number
  description?: string
}

export interface PartySchema {
  roles: PartyRoleDefinition[]
}

export type IoPortKind = 'table' | 'file' | 'image' | 'text' | 'model' | 'custom'

export interface IoPortDefinition {
  name: string
  title: string
  kind: IoPortKind
  role?: string
  required?: boolean
  multiple?: boolean
  formats?: string[]
  source_types?: string[]
  description?: string
}

export interface IoSchema {
  inputs: IoPortDefinition[]
  outputs: IoPortDefinition[]
}

export type ParameterFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'string_array'

export interface JsonSchemaProperty {
  type?: string
  title?: string
  description?: string
  default?: unknown
  enum?: string[]
  items?: { type?: string }
  [key: string]: unknown
}

export interface ParameterSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

export type UiSchema = Record<string, Record<string, unknown>>

export interface ParameterSchemaValue {
  parameterSchema: ParameterSchema
  uiSchema: UiSchema
}
