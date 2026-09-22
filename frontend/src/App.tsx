import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import AddProject from './pages/AddProject'
import GraphPage from './pages/GraphPage'
import ProjectList from './pages/ProjectList'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/new" element={<AddProject />} />
        <Route path="/projects/:id/graph" element={<GraphPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* The app is fixed to dark via the `dark` class on <html>; say so rather than
          letting the toaster fall back to the OS preference. */}
      <Toaster theme="dark" />
    </>
  )
}
