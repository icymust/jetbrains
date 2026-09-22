import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function LoaderPage() {
  const navigate = useNavigate();

  // Temporary mock: redirect to map after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/map');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#2b2d30] text-[#a9b7c6]">
      <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
      <h2 className="text-xl font-semibold animate-pulse">Analyzing Project Services...</h2>
    </div>
  );
}
