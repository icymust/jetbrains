import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/lib/theme-context'
import AddProject from './pages/AddProject'
import GraphLab from './pages/GraphLab'
import GraphPage from './pages/GraphPage'
import ProjectList from './pages/ProjectList'

export default function App() {
  const { theme } = useTheme()

  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/new" element={<AddProject />} />
        <Route path="/projects/:id/graph" element={<GraphPage />} />
        <Route path="/graph-lab" element={<GraphLab />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Toasts render outside the themed tree, so hand them the current theme. */}
      <Toaster theme={theme} />
    </>
  )
}
