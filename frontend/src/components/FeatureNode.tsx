import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { ArrowUpRight, FlaskConical, Lightbulb, Search } from 'lucide-react';

export default function FeatureNode({ id, data, selected }: any) {
  const isToolbarVisible = selected;

  const handleAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    alert(`Triggered: ${action} on ${id}`);
  };

  const handleStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0 };

  return (
    <>
      <NodeToolbar isVisible={isToolbarVisible} position={Position.Right} offset={12}>
        <div className="flex flex-col gap-1 p-2 rounded-md border border-[#00E5FF] shadow-[0_4px_12px_rgba(0,229,255,0.2)]"
             style={{ background: 'rgba(15, 20, 25, 0.95)', backdropFilter: 'blur(8px)' }}>
          <button onClick={(e) => handleAction(e, 'To chat')} className="flex items-center gap-2 px-3 py-2 text-[12px] font-sans bg-transparent border-none cursor-pointer hover:bg-[#00E5FF]/15 rounded transition-colors text-left w-full outline-none" style={{ color: '#ffffff' }}>
            <ArrowUpRight size={14} className="text-[#00E5FF]" /> To chat
          </button>
          <button onClick={(e) => handleAction(e, 'Test')} className="flex items-center gap-2 px-3 py-2 text-[12px] font-sans bg-transparent border-none cursor-pointer hover:bg-[#00E5FF]/15 rounded transition-colors text-left w-full outline-none" style={{ color: '#ffffff' }}>
            <FlaskConical size={14} className="text-[#00E5FF]" /> Test
          </button>
          <button onClick={(e) => handleAction(e, 'Explain')} className="flex items-center gap-2 px-3 py-2 text-[12px] font-sans bg-transparent border-none cursor-pointer hover:bg-[#00E5FF]/15 rounded transition-colors text-left w-full outline-none" style={{ color: '#ffffff' }}>
            <Lightbulb size={14} className="text-[#00E5FF]" /> Explain
          </button>
          <button onClick={(e) => handleAction(e, 'Audit')} className="flex items-center gap-2 px-3 py-2 text-[12px] font-sans bg-transparent border-none cursor-pointer hover:bg-[#00E5FF]/15 rounded transition-colors text-left w-full outline-none" style={{ color: '#ffffff' }}>
            <Search size={14} className="text-[#00E5FF]" /> Audit
          </button>
        </div>
      </NodeToolbar>

      <div 
        className="flex items-center justify-center text-center bg-[#121212] border-2 border-[#4D90FE] shadow-[0_0_15px_rgba(77,144,254,0.5)] cursor-pointer hover:shadow-[0_0_25px_rgba(77,144,254,0.8)] transition-all relative z-10" 
        style={{ width: '80px', height: '80px', borderRadius: '50%' }}
      >
        <Handle type="target" position={Position.Top} style={handleStyle} />
        {/* Font size preserved at 14px */}
        <span className="font-sans font-medium text-[14px] text-white px-1 pointer-events-none relative z-20 leading-tight">{data.label}</span>
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      </div>
    </>
  );
}
