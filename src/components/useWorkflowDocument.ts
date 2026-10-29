import { useEffect, useRef, useState } from 'react'
import type { WorkflowDsl } from './WorkflowCanvas'

// The document is authoritative. ReactFlow receives a projection, never a second mutable graph.
export function useWorkflowDocument(incoming: WorkflowDsl, emit: (w: WorkflowDsl) => void) {
  const [state, setState] = useState({ workflow: incoming, nodes: [] as string[], edges: [] as string[], past: [] as WorkflowDsl[], future: [] as WorkflowDsl[] })
  const ref = useRef(state), last = useRef(incoming), transaction = useRef<WorkflowDsl>()
  ref.current = state
  const replace = (next: typeof state) => { ref.current = next; setState(next) }
  useEffect(() => { if (incoming !== last.current) { last.current = incoming; transaction.current = undefined; replace({ ...ref.current, workflow: incoming, past: [], future: [], nodes: [], edges: [] }) } }, [incoming])
  const send = (workflow: WorkflowDsl) => { last.current = workflow; emit(workflow) }
  const change = (workflow: WorkflowDsl) => {
    const s = ref.current
    if (JSON.stringify(s.workflow) === JSON.stringify(workflow)) return
    replace({ ...s, workflow, past: transaction.current ? s.past : [...s.past, s.workflow].slice(-100), future: [] })
    // Keep pointer moves and field edits local until the gesture/field commits.
    // Publishing each frame also retriggers the parent's queries and prop updates.
    if (!transaction.current) send(workflow)
  }
  const begin = () => { transaction.current ??= ref.current.workflow }
  const end = () => { const before = transaction.current; transaction.current = undefined; if (before && JSON.stringify(before) !== JSON.stringify(ref.current.workflow)) { replace({ ...ref.current, past: [...ref.current.past, before].slice(-100), future: [] }); send(ref.current.workflow) } }
  const travel = (undo: boolean) => {
    end(); const s = ref.current, from = undo ? s.past : s.future
    if (!from.length) return
    const workflow = from[from.length - 1]
    replace({ ...s, workflow, past: undo ? s.past.slice(0, -1) : [...s.past, s.workflow].slice(-100), future: undo ? [...s.future, s.workflow] : s.future.slice(0, -1), nodes: [], edges: [] }); send(workflow)
  }
  return { ...state, change, begin, end, undo: () => travel(true), redo: () => travel(false), select: (nodes: string[], edges: string[] = []) => { if (JSON.stringify(nodes)!==JSON.stringify(ref.current.nodes)||JSON.stringify(edges)!==JSON.stringify(ref.current.edges)) replace({ ...ref.current, nodes, edges }) }, current: () => ref.current.workflow }
}
