import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function AddProject({ setView }: { setView: (view: string) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Analysing...');

  useEffect(() => {
    if (!isLoading) return;

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step === 1) setLoadingText('Drawing...');
      if (step === 2) setLoadingText('Thinking...');
    }, 800);

    const timeout = setTimeout(() => {
      setView('graph');
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isLoading, setView]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
  };

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] text-white font-sans p-6 relative">
      <div className="w-full max-w-md mx-auto flex flex-col mt-8">
        
        <button 
          onClick={() => setView('projectList')}
          className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 mb-6 cursor-pointer outline-none w-fit"
        >
          <ArrowLeft size={18} /> Back to Projects
        </button>
        
        <h1 className="text-3xl font-bold text-white mb-8">New Project</h1>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-sm font-semibold text-zinc-300 mb-2 block">Project Name</label>
            <input 
              required
              type="text" 
              placeholder="e.g., CodeOrbit Main"
              className="w-full bg-[#161616] text-white px-4 py-3 rounded-xl border-2 border-zinc-800 focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF] transition-all"
            />
          </div>
          
          <div>
            <label className="text-sm font-semibold text-zinc-300 mb-2 block">Root Folder</label>
            <input 
              required
              type="text" 
              placeholder="e.g., /usr/bin"
              className="w-full bg-[#161616] text-white px-4 py-3 rounded-xl border-2 border-zinc-800 focus:outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF] transition-all font-mono"
            />
          </div>

          <button 
            type="submit"
            className="w-full mt-6 py-4 rounded-full bg-[#00E5FF] text-black font-bold text-lg flex items-center justify-center cursor-pointer hover:bg-[#33EEFF] hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all outline-none"
          >
            Add
          </button>
        </form>
      </div>

      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-md">
          <Loader2 size={48} className="text-[#00E5FF] animate-spin mb-4" />
          <h2 className="text-xl font-bold text-[#00E5FF] tracking-widest animate-pulse">{loadingText}</h2>
        </div>
      )}
    </div>
  );
}
