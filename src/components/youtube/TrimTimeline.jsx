import React, { useState, useRef, useEffect } from "react";
import { formatTime, loadYTApi } from "./youtubeUtils";

export default function TrimTimeline({ min, max, start, end, onChange, onBlur, videoId, thumbnail }) {
  const trackRef = useRef(null);
  const playerRef = useRef(null);
  const playerInstance = useRef(null);
  const [hoverTime, setHoverTime] = useState(null);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    let isMounted = true;
    loadYTApi().then((YT) => {
      if (!isMounted || !playerRef.current) return;
      playerInstance.current = new YT.Player(playerRef.current, {
        videoId,
        playerVars: { controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, mute: 1, playsinline: 1, showinfo: 0 },
        events: {
          onReady: (e) => { e.target.mute(); }
        }
      });
    });
    return () => {
      isMounted = false;
      if (playerInstance.current?.destroy) playerInstance.current.destroy();
    };
  }, [videoId]);

  const scrubTimeout = useRef(null);
  useEffect(() => {
    if (hoverTime !== null && playerInstance.current?.seekTo) {
      clearTimeout(scrubTimeout.current);
      scrubTimeout.current = setTimeout(() => {
        playerInstance.current.seekTo(hoverTime, true);
      }, 50);
    }
  }, [hoverTime]);

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
      className="relative h-10 mt-6 mb-2 flex items-center group cursor-pointer" 
      ref={trackRef}
      onMouseMove={e => !dragging && setHoverTime(getValFromEvent(e))}
      onMouseLeave={() => !dragging && setHoverTime(null)}
    >
      <div className={`absolute -top-[5.5rem] bg-zinc-900 text-white font-mono text-[10px] font-bold p-1.5 rounded-lg shadow-xl z-30 transform -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1.5 border border-zinc-700 transition-all duration-200 ${hoverTime !== null ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
           style={{ left: `${pct(hoverTime || start)}%` }}>
        <div className="w-24 h-14 rounded-[4px] overflow-hidden bg-black shrink-0 relative border border-zinc-800 pointer-events-none">
           {thumbnail && <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />}
           <div className="absolute inset-0 w-full h-full transform scale-[1.3] pointer-events-none">
             <div ref={playerRef} className="w-full h-full pointer-events-none" />
           </div>
        </div>
        <span>{formatTime(hoverTime || start)}</span>
        <div className="absolute -bottom-1 w-2 h-2 bg-zinc-900 border-b border-r border-zinc-700 transform rotate-45" />
      </div>
      
      <div className="absolute w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
      <div className="absolute h-1.5 bg-red-500 pointer-events-none" style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }} />
      
      <div 
        className={`absolute w-3 h-5 bg-white border border-zinc-300 dark:border-zinc-600 rounded-sm shadow-md z-20 cursor-ew-resize transform -translate-x-1/2 -translate-y-1/2 top-1/2 transition-transform duration-100 ${dragging === 'start' ? 'scale-125 bg-white/60' : 'hover:scale-110'}`}
        style={{ left: `${pct(start)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'start')}
      />
      <div 
        className={`absolute w-3 h-5 bg-white border border-zinc-300 dark:border-zinc-600 rounded-sm shadow-md z-20 cursor-ew-resize transform -translate-x-1/2 -translate-y-1/2 top-1/2 transition-transform duration-100 ${dragging === 'end' ? 'scale-125 bg-white/60' : 'hover:scale-110'}`}
        style={{ left: `${pct(end)}%` }}
        onPointerDown={(e) => handlePointerDown(e, 'end')}
      />
    </div>
  );
}

