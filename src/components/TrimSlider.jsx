// --- Dual Range Slider ---
function TrimSlider({ min, max, start, end, onChange, onBlur }) {
  const trackRef = useRef(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [dragging, setDragging] = useState(null); // 'start' or 'end'

  const getValFromEvent = (e) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    let p = (e.clientX - rect.left) / rect.width;
    if (p < 0) p = 0; if (p > 1) p = 1;
    return min + p * (max - min);
  };

  const handlePointerDown = (e, type) => {
    e.preventDefault();
    setDragging(type);
    
    const handlePointerMove = (ev) => {
      const val = getValFromEvent(ev);
      setHoverTime(val);
      if (type === 'start') onChange(Math.min(val, end), end);
      else onChange(start, Math.max(val, start));
    };
    
    const handlePointerUp = () => {
      setDragging(null);
      if (onBlur) onBlur();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const pct = (val) => max > min ? ((val - min) / (max - min)) * 100 : 0;

  return (
    <div 
      className="relative h-8 mt-2 flex items-center group cursor-pointer" 
      ref={trackRef}
      onMouseMove={e => !dragging && setHoverTime(getValFromEvent(e))}
      onMouseLeave={() => !dragging && setHoverTime(null)}
    >
      {hoverTime !== null && (
        <div className="absolute -top-6 bg-black text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow z-30 transform -translate-x-1/2 pointer-events-none"
             style={{ left: `${pct(hoverTime)}%` }}>
          {formatTime(hoverTime)}
        </div>
      )}
      
      <div className="absolute w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
      <div className="absolute h-2 bg-zinc-900/10 dark:bg-white/10 pointer-events-none" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
      
      <div 
        className="absolute w-4 h-4 bg-emerald-500 rounded-full shadow-md z-20 cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 top-1/2"
        style={{ left: `${pct(start)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'start')}
      />
      <div 
        className="absolute w-4 h-4 bg-rose-500 rounded-full shadow-md z-20 cursor-grab active:cursor-grabbing transform -translate-x-1/2 -translate-y-1/2 top-1/2"
        style={{ left: `${pct(end)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'end')}
      />
    </div>
  );
}
