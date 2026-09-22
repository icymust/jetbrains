import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/lib/theme-context'
import AddProject from './pages/AddProject'
import ProjectGraph from './pages/ProjectGraph'
import ProjectList from './pages/ProjectList'

export default function App() {
  const { theme } = useTheme()

  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/new" element={<AddProject />} />
        <Route path="/projects/:id/graph" element={<ProjectGraph />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Toasts render outside the themed tree, so hand them the current theme. */}
      <Toaster theme={theme} />
    </>
  )
}
