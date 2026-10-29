import type { WorkflowDsl } from './WorkflowCanvas'
import { newUuid } from '../utils/uuid'
import type { ApplicationInstance } from '../api/applicationTemplates'

export type Point = { x: number; y: number }
export const instancesOf = (w: WorkflowDsl) => (Array.isArray(w.applications) ? w.applications : []) as ApplicationInstance[]
export const edgeId = (index: number) => `edge-${index}`
export function moveWorkflowNodes(w: WorkflowDsl, moves: { id: string; position?: Point }[]): WorkflowDsl {
  const positions = new Map(moves.filter(m => m.position && Number.isFinite(m.position.x) && Number.isFinite(m.position.y)).map(m => [m.id, m.position!]))
  if (!positions.size) return w
  const move = <T extends { id: string; position?: Point }>(node: T): T => {
    const position = positions.get(node.id)
    return position ? { ...node, position: { ...position } } : node
  }
  return { ...w, nodes: w.nodes.map(move), applications: instancesOf(w).map(move) }
}
export function removeSelection(w: WorkflowDsl, ids: string[], edges: string[]): WorkflowDsl {
  return { ...w, detached_applications: ((w.detached_applications || []) as ApplicationInstance[]).filter(i=>w.nodes.some(n=>(n as any).application_instance===i.id&&!ids.includes(n.id))), nodes: w.nodes.filter(n => !ids.includes(n.id)), applications: instancesOf(w).filter(i => !ids.includes(i.id)), edges: w.edges.filter((e, index) => !ids.includes(e.source) && !ids.includes(e.target) && !edges.includes(edgeId(index))) }
}
export function copySelection(w: WorkflowDsl, ids: string[]): WorkflowDsl {
  const nodes = w.nodes.filter(n => ids.includes(n.id))
  // Detached tasks must retain their complete, verifiable application origin.
  const origins = (Array.isArray(w.detached_applications) ? w.detached_applications : []) as ApplicationInstance[]
  const selectedOrigins = origins.filter(i => nodes.some(n => (n as any).application_instance === i.id))
  if (selectedOrigins.some(i => w.nodes.some(n => (n as any).application_instance === i.id && !ids.includes(n.id)))) throw Error('请选择该解除组合应用的全部任务，以保留完整来源')
  return structuredClone({ nodes, applications: instancesOf(w).filter(i => ids.includes(i.id)), detached_applications: selectedOrigins, edges: w.edges.filter(e => ids.includes(e.source) && ids.includes(e.target)) })
}
export function pasteSelection(w: WorkflowDsl, clip: WorkflowDsl, point: Point): { workflow: WorkflowDsl; ids: string[] } {
  const all = [...clip.nodes, ...instancesOf(clip)]
  if (!all.length) return { workflow: w, ids: [] }
  const origins = (clip.detached_applications || []) as ApplicationInstance[]
  const map = new Map<string, string>()
  const used = new Set([...w.nodes, ...instancesOf(w), ...((w.detached_applications || []) as ApplicationInstance[])].map(n => n.id))
  const fresh = () => { let id: string; do { id = 'n-' + newUuid().replace(/-/g, '').slice(0, 12) } while (used.has(id)); used.add(id); return id }
  origins.forEach(i => map.set(i.id, fresh()))
  all.forEach(n => map.set(n.id, (n as any).detached ? `${map.get((n as any).application_instance)}-${(n as any).template_task}` : fresh()))
  const minX = Math.min(...all.map(n => n.position?.x || 0)), minY = Math.min(...all.map(n => n.position?.y || 0))
  const shift = <T extends { id: string; position?: Point }>(n: T): T => ({ ...structuredClone(n), id: map.get(n.id)!, position: { x: point.x + (n.position?.x || 0) - minX, y: point.y + (n.position?.y || 0) - minY } })
  return { workflow: { ...w, nodes: [...w.nodes, ...clip.nodes.map(n => ({ ...shift(n), ...((n as any).detached ? { application_instance: map.get((n as any).application_instance) } : {}) }))], applications: [...instancesOf(w), ...instancesOf(clip).map(shift)], detached_applications: [...((w.detached_applications || []) as ApplicationInstance[]), ...origins.map(i => ({ ...structuredClone(i), id: map.get(i.id)! }))], edges: [...w.edges, ...clip.edges.map(e => ({ ...e, source: map.get(e.source)!, target: map.get(e.target)! }))] }, ids: all.map(n => map.get(n.id)!) }
}
