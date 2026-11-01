import { useEditorState, type Editor } from '@tiptap/react'

interface ButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, active, disabled, onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={`tool${active ? ' tool-active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      editable: editor.isEditable,
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      link: editor.isActive('link'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })
  const run = () => editor.chain().focus()

  function toggleLink() {
    if (s.link) {
      run().unsetLink().run()
      return
    }
    const href = window.prompt('Link URL', 'https://')?.trim()
    if (href) run().setLink({ href }).run()
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" disabled={!s.editable || !s.canUndo} onClick={() => run().undo().run()}>↶</ToolButton>
      <ToolButton label="Redo" disabled={!s.editable || !s.canRedo} onClick={() => run().redo().run()}>↷</ToolButton>
      <span className="toolbar-sep" />
      <ToolButton label="Heading 1" active={s.h1} disabled={!s.editable} onClick={() => run().toggleHeading({ level: 1 }).run()}>H1</ToolButton>
      <ToolButton label="Heading 2" active={s.h2} disabled={!s.editable} onClick={() => run().toggleHeading({ level: 2 }).run()}>H2</ToolButton>
      <ToolButton label="Heading 3" active={s.h3} disabled={!s.editable} onClick={() => run().toggleHeading({ level: 3 }).run()}>H3</ToolButton>
      <span className="toolbar-sep" />
      <ToolButton label="Bold" active={s.bold} disabled={!s.editable} onClick={() => run().toggleBold().run()}><b>B</b></ToolButton>
      <ToolButton label="Italic" active={s.italic} disabled={!s.editable} onClick={() => run().toggleItalic().run()}><i>I</i></ToolButton>
      <ToolButton label="Underline" active={s.underline} disabled={!s.editable} onClick={() => run().toggleUnderline().run()}><u>U</u></ToolButton>
      <span className="toolbar-sep" />
      <ToolButton label="Bullet list" active={s.bullet} disabled={!s.editable} onClick={() => run().toggleBulletList().run()}>• List</ToolButton>
      <ToolButton label="Numbered list" active={s.ordered} disabled={!s.editable} onClick={() => run().toggleOrderedList().run()}>1. List</ToolButton>
      <ToolButton label={s.link ? 'Remove link' : 'Add link'} active={s.link} disabled={!s.editable} onClick={toggleLink}>Link</ToolButton>
    </div>
  )
}
