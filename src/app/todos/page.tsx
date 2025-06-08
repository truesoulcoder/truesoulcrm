import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

// This is a Server Component, so it can be async
export default async function TodosPage() {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  // Fetch data on the server
  const { data: todos, error } = await supabase.from('todos').select()

  if (error) {
    console.error('Error fetching todos:', error)
    // You can render an error message to the user
    return <p>Error loading todos.</p>
  }

  // Ensure todos is an array before mapping
  if (!todos) {
    return <p>No todos found.</p>
  }

  return (
    <div>
      <h1>My Todos</h1>
      <ul>
        {/* It's better to map over a unique property like `id` for the key */}
        {todos.map((todo: { id: string; title: string }) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </div>
  )
}