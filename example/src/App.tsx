import { Suspense } from 'react'
import { TableDemo } from './TableDemo'

export function App() {
  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col overflow-hidden">
      <div className="w-full max-w-350 mx-auto flex flex-col grow min-h-0">

        <p className="text-zinc-400 text-sm mb-6">
          Example playground — rendering 20,000 dummy rows with simulated live updates.
        </p>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64 text-zinc-500">
              Loading…
            </div>
          }
        >
          <TableDemo />
        </Suspense>
      </div>
    </div>
  )
}

export default App
