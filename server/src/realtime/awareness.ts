import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { applyAwarenessUpdate } from 'y-protocols/awareness'
import { colorFor } from './colors.js'
import type { DocEntry } from './registry.js'

export const MAX_AWARENESS_BYTES = 16_000
// One tab normally controls a single client id; a few spare keeps odd clients working.
const MAX_ENTRIES_PER_UPDATE = 8
const MAX_IDS_PER_SOCKET = 8
const MAX_STATE_CHARS = 4_000
const MAX_CURSOR_CHARS = 1_000

interface RawEntry {
  clientID: number
  clock: number
  state: unknown
}

export interface Identity {
  userId: string
  name: string
}

// Same wire format as y-protocols' encodeAwarenessUpdate; null on anything malformed.
function decode(update: Uint8Array): RawEntry[] | null {
  try {
    const decoder = decoding.createDecoder(update)
    const count = decoding.readVarUint(decoder)
    if (count > MAX_ENTRIES_PER_UPDATE) return null
    const entries: RawEntry[] = []
    for (let i = 0; i < count; i++) {
      const clientID = decoding.readVarUint(decoder)
      const clock = decoding.readVarUint(decoder)
      const json = decoding.readVarString(decoder)
      if (json.length > MAX_STATE_CHARS) return null
      entries.push({ clientID, clock, state: JSON.parse(json) })
    }
    return decoding.hasContent(decoder) ? null : entries
  } catch {
    return null
  }
}

function encode(entries: RawEntry[]): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, entries.length)
  for (const { clientID, clock, state } of entries) {
    encoding.writeVarUint(encoder, clientID)
    encoding.writeVarUint(encoder, clock)
    encoding.writeVarString(encoder, JSON.stringify(state))
  }
  return encoding.toUint8Array(encoder)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Identity comes from the session (D19). Of everything else the client sent, only the
// cursor survives, and only if it is a small object.
function stamp(state: Record<string, unknown>, who: Identity) {
  const cursor = state.cursor
  const keepCursor = isPlainObject(cursor) && JSON.stringify(cursor).length <= MAX_CURSOR_CHARS
  return {
    user: { id: who.userId, name: who.name, color: colorFor(who.userId) },
    cursor: keepCursor ? cursor : null,
  }
}

// Validates a client's awareness update, rewrites it with server-stamped identity and applies
// it to the document's awareness (which then broadcasts it). Returns false, applying nothing,
// if the update is malformed or touches a client id owned by another socket.
export function applyClientAwareness(entry: DocEntry, socketId: string, who: Identity, update: Uint8Array): boolean {
  const entries = decode(update)
  if (!entries || entries.length === 0) return false

  const owned = [...entry.awarenessOwners.values()].filter((owner) => owner === socketId).length
  const claiming = new Set<number>()
  const clean: RawEntry[] = []

  for (const { clientID, clock, state } of entries) {
    if (!Number.isSafeInteger(clientID) || clientID < 0 || clientID === entry.ydoc.clientID) return false
    if (!Number.isSafeInteger(clock) || clock < 0) return false
    const owner = entry.awarenessOwners.get(clientID)
    if (owner !== undefined && owner !== socketId) return false // someone else's cursor
    if (owner === undefined) claiming.add(clientID)

    if (state === null) clean.push({ clientID, clock, state: null })
    else if (isPlainObject(state)) clean.push({ clientID, clock, state: stamp(state, who) })
    else return false
  }
  if (owned + claiming.size > MAX_IDS_PER_SOCKET) return false

  for (const clientID of claiming) entry.awarenessOwners.set(clientID, socketId)
  applyAwarenessUpdate(entry.awareness, encode(clean), socketId)
  return true
}
