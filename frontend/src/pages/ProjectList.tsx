import { ChevronRight, Plus } from 'lucide-react';

export default function ProjectList({ setView }: { setView: (view: string) => void }) {
  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] text-white font-sans p-8">
      <div className="w-full flex flex-col mt-12">
        
        {/* Increased width to 4/5 for bigger overall layout */}
        <div className="w-4/5 mx-auto">
          <h1 className="text-4xl font-bold text-white mb-2">CodeOrbit Projects.</h1>
          <p className="text-lg text-zinc-400 mb-10">1 active project</p>
        </div>
        
        <div className="w-4/5 mx-auto flex flex-col items-center gap-8">
          
          <button 
            onClick={() => setView('graph')}
            // Restored the hover:border-[#00E5FF] color without the glowing shadow. Increased padding.
            className="w-full py-8 px-10 rounded-full border-2 border-zinc-700 bg-transparent flex items-center justify-between hover:border-[#00E5FF] hover:bg-zinc-900 transition-all cursor-pointer group outline-none"
          >
            <div className="flex flex-col items-start gap-2">
              <span className="text-white text-4xl font-bold">Project 1</span>
              <span className="text-2xl text-zinc-400 font-mono">/usr/bin</span>
            </div>
            {/* Restored chevron hover color */}
            <ChevronRight size={48} className="text-zinc-400 group-hover:text-[#00E5FF] transition-colors" />
          </button>

          <button 
            onClick={() => setView('addProject')}
            // Restored the static border-[#00E5FF] color for the Add Project button. Increased padding.
            className="w-full py-8 px-10 rounded-full border-2 border-[#00E5FF] bg-transparent flex items-center justify-center gap-4 hover:bg-[#00E5FF]/10 transition-all cursor-pointer outline-none"
          >
            <Plus size={48} className="text-[#00E5FF]" /> 
            <span className="text-[#00E5FF] text-4xl font-bold">Add Project</span>
          </button>

        </div>
        
      </div>
    </div>
  );
}
