import Collaboration from '@tiptap/extension-collaboration'
import StarterKit from '@tiptap/starter-kit'
import type * as Y from 'yjs'

// StarterKit (v3) already bundles underline and link. Collaboration brings its own undo/redo,
// which only reverts this user's changes, so the default history must be off (D7).
export function createExtensions(doc: Y.Doc) {
  return [
    StarterKit.configure({
      undoRedo: false,
      link: { openOnClick: false, autolink: true },
    }),
    Collaboration.configure({ document: doc, field: 'default' }),
  ]
}
