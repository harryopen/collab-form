import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import StarterKit from '@tiptap/starter-kit'
import type { SocketIOProvider } from './SocketIOProvider.ts'

// StarterKit (v3) already bundles underline and link. Collaboration brings its own undo/redo,
// which only reverts this user's changes, so the default history must be off (D7).
export function createExtensions(provider: SocketIOProvider, userName: string) {
  return [
    StarterKit.configure({
      undoRedo: false,
      link: { openOnClick: false, autolink: true },
    }),
    Collaboration.configure({ document: provider.doc, field: 'default' }),
    // The server replaces this identity with the one from the session (name, colour, id),
    // so only the shape matters here.
    CollaborationCaret.configure({ provider, user: { name: userName, color: '#888888' } }),
  ]
}
