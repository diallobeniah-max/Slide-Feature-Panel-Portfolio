import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge, Button } from "../ui.jsx";

export default function GalleryTagManager({ tags = [], onChange }) {
  const [value, setValue] = useState("");

  const addTag = () => {
    const next = value.trim();
    if (!next) return;
    onChange([...new Set([...tags, next])]);
    setValue("");
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
        Local Tags
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.length ? (
          tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              className="group"
              title="Remove tag"
            >
              <Badge variant="default" className="gap-1">
                {tag}
                <X size={10} className="opacity-50 transition group-hover:opacity-100" />
              </Badge>
            </button>
          ))
        ) : (
          <Badge variant="default">No tags</Badge>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addTag();
          }}
          placeholder="Add tag..."
          className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-4 focus:ring-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-white dark:focus:ring-white/5"
        />
        <Button size="icon" variant="outline" icon={Plus} onClick={addTag} aria-label="Add tag" />
      </div>
    </div>
  );
}
