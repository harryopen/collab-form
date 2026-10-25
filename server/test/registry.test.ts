import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createRegistry } from '../src/realtime/registry.js'

function setup(opts: { updateCount?: number; threshold?: number; loadDelay?: number } = {}) {
  const loadDoc = vi.fn(async () => {
    if (opts.loadDelay) await new Promise((r) => setTimeout(r, opts.loadDelay))
    return { ydoc: new Y.Doc(), updateCount: opts.updateCount ?? 0 }
  })
  const compact = vi.fn(async () => true)
  const registry = createRegistry({ loadDoc, compact, threshold: opts.threshold ?? 3 })
  return { registry, loadDoc, compact }
}

describe('registry', () => {
  it('loads a document once for concurrent first joins', async () => {
    const { registry, loadDoc } = setup({ loadDelay: 20 })
    const [a, b, c] = await Promise.all([registry.join('d', 's1'), registry.join('d', 's2'), registry.join('d', 's3')])
    expect(loadDoc).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect([...a.sockets].sort()).toEqual(['s1', 's2', 's3'])
  })

  it('keeps documents separate', async () => {
    const { registry, loadDoc } = setup()
    const a = await registry.join('a', 's1')
    const b = await registry.join('b', 's1')
    expect(a.ydoc).not.toBe(b.ydoc)
    expect(loadDoc).toHaveBeenCalledTimes(2)
  })

  it('compacts and evicts when the last socket leaves', async () => {
    const { registry, compact } = setup({ updateCount: 2 })
    const entry = await registry.join('d', 's1')
    await registry.join('d', 's2')

    await registry.leave('d', 's1')
    expect(registry.get('d')).toBe(entry) // s2 is still here
    expect(compact).not.toHaveBeenCalled()

    await registry.leave('d', 's2')
    expect(compact).toHaveBeenCalledWith('d', entry.ydoc)
    expect(registry.get('d')).toBeUndefined()
    expect(registry.size()).toBe(0)
  })

  it('skips compaction for an untouched document but still evicts it', async () => {
    const { registry, compact } = setup()
    await registry.join('d', 's1')
    await registry.leave('d', 's1')
    expect(compact).not.toHaveBeenCalled()
    expect(registry.size()).toBe(0)
  })

  it('still evicts if compaction fails', async () => {
    const { registry, compact } = setup({ updateCount: 1 })
    compact.mockRejectedValueOnce(new Error('db down'))
    await registry.join('d', 's1')
    await registry.leave('d', 's1')
    expect(registry.size()).toBe(0)
  })

  it('keeps the entry if someone joins while it is compacting', async () => {
    const { registry, compact } = setup({ updateCount: 1 })
    let release!: () => void
    compact.mockImplementationOnce(() => new Promise((r) => (release = () => r(true))))
    const entry = await registry.join('d', 's1')
    const leaving = registry.leave('d', 's1')
    await registry.join('d', 's2')
    release()
    await leaving
    expect(registry.get('d')).toBe(entry)
    expect(entry.sockets.has('s2')).toBe(true)
  })

  it('compacts in the background once the threshold is reached', async () => {
    const { registry, compact } = setup({ threshold: 3 })
    await registry.join('d', 's1')
    registry.recordUpdate('d')
    registry.recordUpdate('d')
    expect(compact).not.toHaveBeenCalled()
    registry.recordUpdate('d')
    expect(compact).toHaveBeenCalledTimes(1)
    registry.recordUpdate('d') // counter was reset
    expect(compact).toHaveBeenCalledTimes(1)
  })

  it('counts rows that already existed when the document loaded', async () => {
    const { registry, compact } = setup({ updateCount: 2, threshold: 3 })
    await registry.join('d', 's1')
    registry.recordUpdate('d')
    expect(compact).toHaveBeenCalledTimes(1)
  })

  it('evict drops the entry and reports the attached sockets', async () => {
    const { registry, loadDoc } = setup()
    await registry.join('d', 's1')
    await registry.join('d', 's2')
    expect(registry.evict('d').sort()).toEqual(['s1', 's2'])
    expect(registry.get('d')).toBeUndefined()
    await registry.join('d', 's3') // re-join loads fresh state
    expect(loadDoc).toHaveBeenCalledTimes(2)
  })

  it('a failed load does not poison later joins', async () => {
    const { registry, loadDoc } = setup()
    loadDoc.mockRejectedValueOnce(new Error('db down'))
    await expect(registry.join('d', 's1')).rejects.toThrow('db down')
    const entry = await registry.join('d', 's1')
    expect(entry.sockets.has('s1')).toBe(true)
  })
})
