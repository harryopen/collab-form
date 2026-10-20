import { useParams } from 'react-router-dom'

// Placeholder: the editor arrives in tasks 4.2 and 5.4.
export function EditorPage() {
  const { id } = useParams()
  return (
    <main>
      <h1>Document {id}</h1>
    </main>
  )
}
