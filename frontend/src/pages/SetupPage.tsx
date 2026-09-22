import { useNavigate } from 'react-router-dom';

export default function SetupPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#2b2d30] text-[#a9b7c6]">
      <h1 className="text-3xl font-bold mb-6">Initialize Dynamic Project Map</h1>
      <button 
        onClick={() => navigate('/loading')}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
      >
        Start Setup
      </button>
    </div>
  );
}
