import React from 'react';
import { Maximize, Minimize, X, Play, Video } from 'lucide-react';
import { extractVideoId, formatTime } from './youtubeUtils';

export default function VideoPreview({ item, onUpdate }) {
  if (item.previewMode) {
    return (
      <div className={`relative w-full bg-black flex flex-col transition-all duration-300 ${item.isFullScreen ? 'fixed inset-0 z-[100] h-screen' : 'aspect-video rounded-t-xl overflow-hidden border-b border-zinc-100 dark:border-zinc-800'}`}>
        <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none z-20 bg-gradient-to-b from-black/60 to-transparent">
           <div className="pointer-events-auto bg-black/40 backdrop-blur-md rounded-full px-3 py-1 border border-white/10 text-white/90 text-[10px] font-bold tracking-widest uppercase shadow-lg shadow-black/20">
             Preview
           </div>
           <div className="flex gap-2 pointer-events-auto">
             <button 
               onClick={() => onUpdate(item.id, { isFullScreen: !item.isFullScreen })} 
               className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all hover:scale-105 shadow-lg shadow-black/20"
             >
               {item.isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
             </button>
             <button 
               onClick={() => onUpdate(item.id, { previewMode: false, isFullScreen: false })} 
               className="p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-full border border-white/10 transition-all hover:scale-105 shadow-lg shadow-black/20"
             >
               <X size={14} />
             </button>
           </div>
        </div>
        <iframe 
          src={`https://www.youtube.com/embed/${extractVideoId(item.url)}?autoplay=1&start=${Math.floor(item.trimStart)}`}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          className="w-full flex-1 border-0"
          title="Video Preview"
        />
      </div>
    );
  }

  return (
    <div 
      className="relative w-28 h-[4.5rem] md:w-32 md:h-[5.5rem] shrink-0 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 cursor-pointer group"
      onClick={() => { if(item.status !== "fetching") onUpdate(item.id, { previewMode: true }); }}
      title="Click to preview video"
    >
      {item.thumbnail ? (
        <img src={item.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      ) : (
        <div className="w-full h-full grid place-items-center text-zinc-400">
          <Video size={24} />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 grid place-items-center">
         <Play size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transform group-hover:scale-110 transition-all duration-300" fill="currentColor" />
      </div>
      {item.duration > 0 && (
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md pointer-events-none">
          {formatTime(item.duration)}
        </span>
      )}
    </div>
  );
}

