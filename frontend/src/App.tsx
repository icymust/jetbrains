import { useState } from 'react';
import ProjectList from './pages/ProjectList';
import AddProject from './pages/AddProject';
import GraphPage from './pages/GraphPage';

export default function App() {
  const [currentView, setCurrentView] = useState('projectList');

  return (
    <div className="w-full h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {currentView === 'projectList' && <ProjectList setView={setCurrentView} />}
      {currentView === 'addProject' && <AddProject setView={setCurrentView} />}
      {currentView === 'graph' && <GraphPage setView={setCurrentView} />}
    </div>
  );
}
