import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSpawnAgentTool } from '../lib/tool.js'

/** Fake host context capturing every startActivation spec. */
const makeContext = () => {
  const calls = []
  return {
    ctx: {
      subagents: {
        resolveMaxDepth: () => 6,
        startActivation: async (spec) => {
          calls.push(spec)
          return { childId: 'session-child-1' }
        },
      },
    },
    calls,
  }
}

/** Minimal ToolRunContext: the calling agent and a live signal. */
const makeExec = () => {
  const agent = {
    id: 'session-parent-1',
    session: { header: { cwd: '/tmp/project' } },
  }
  return { agent, signal: new AbortController().signal }
}

/** Fake manager that resolves the role without touching the filesystem. */
const makeManager = (presetId = 'dshca_reviewer_abc123') => ({
  delegate: async (_agentType, _cwd, action) => action({ role: { presetId } }),
})

test('startActivation receives flattened delegation fields, not a nested request', async () => {
  const { ctx, calls } = makeContext()
  const tool = createSpawnAgentTool(ctx, makeManager())
  const exec = makeExec()
  const result = await tool.execute(
    { task_name: 'review', agent_type: 'reviewer', message: 'Please review.' },
    exec,
  )
  assert.equal(calls.length, 1)
  const spec = calls[0]
  // Activation-level fields stay on the spec.
  assert.equal(spec.provider, 'spawn')
  assert.equal(spec.label, 'review')
  assert.equal(spec.delivery, 'parent')
  assert.equal(spec.signal, exec.signal)
  // DSH 0.2.2-rc.2 flattens the former request object onto the spec.
  assert.equal(spec.parent, exec.agent)
  assert.deepEqual(spec.prompt, [{ type: 'text', text: 'Please review.' }])
  assert.equal(spec.agentPreset, 'dshca_reviewer_abc123')
  assert.equal(spec.maxDepth, 6)
  // The nested request key must be gone.
  assert.equal('request' in spec, false)
  // Result contract is unchanged.
  assert.deepEqual(result, { kind: 'activation', subagentId: 'session-child-1' })
})

test('maxDepth is omitted when the host limit is undefined', async () => {
  const calls = []
  const ctx = {
    subagents: {
      resolveMaxDepth: () => undefined,
      startActivation: async (spec) => {
        calls.push(spec)
        return { childId: 'session-child-2' }
      },
    },
  }
  const tool = createSpawnAgentTool(ctx, makeManager())
  await tool.execute(
    { task_name: 'review', agent_type: 'reviewer', message: 'Please review.' },
    makeExec(),
  )
  const spec = calls[0]
  assert.equal('maxDepth' in spec, false)
  assert.equal(spec.agentPreset, 'dshca_reviewer_abc123')
  assert.equal(spec.delivery, 'parent')
})
