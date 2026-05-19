import React, { useEffect, useMemo, useRef, useState } from "react";
import GalleryGrid from "./GalleryGrid.jsx";
import { groupMediaByMonth } from "../../utils/galleryGrouping.js";

const ROW_GAP = 12;
const HEADER_HEIGHT = 58;
const OVERSCAN_PX = 260;

function getColumnCount(width) {
  if (width >= 1280) return 6;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export default function VirtualizedGalleryLibrary({
  items,
  onOpen,
  sourceKind = "gallery",
  selectedIds = new Set(),
  onToggleSelect,
  getDragItems,
}) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewport, setViewport] = useState({
    top: 0,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateWidth = () => setContainerWidth(element.clientWidth || 0);
    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        setViewport({
          top: rect ? Math.max(0, -rect.top) : window.scrollY,
          height: window.innerHeight || 900,
        });
      });
    };

    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const layout = useMemo(() => {
    const width = Math.max(containerWidth, 320);
    const columns = getColumnCount(width);
    const tileSize = Math.max(128, Math.floor((width - ROW_GAP * (columns - 1)) / columns));
    const itemRowHeight = tileSize + ROW_GAP;
    const rows = [];
    let offset = 0;

    for (const group of groupMediaByMonth(items)) {
      rows.push({
        type: "header",
        key: `header-${group.key}`,
        group,
        top: offset,
        height: HEADER_HEIGHT,
      });
      offset += HEADER_HEIGHT;

      for (const [rowIndex, rowItems] of chunkItems(group.items, columns).entries()) {
        rows.push({
          type: "items",
          key: `${group.key}-${rowIndex}`,
          group,
          items: rowItems,
          top: offset,
          height: itemRowHeight,
        });
        offset += itemRowHeight;
      }
    }

    return { columns, rows, totalHeight: offset };
  }, [containerWidth, items]);

  const visibleRows = useMemo(() => {
    const start = Math.max(0, viewport.top - OVERSCAN_PX);
    const end = viewport.top + viewport.height + OVERSCAN_PX;
    return layout.rows.filter((row) => row.top + row.height >= start && row.top <= end);
  }, [layout.rows, viewport]);

  if (!items.length) return null;

  return (
    <div ref={containerRef} className="relative min-w-0 overflow-hidden" style={{ height: layout.totalHeight }}>
      {visibleRows.map((row) => (
        <div
          key={row.key}
          className="absolute left-0 right-0"
          style={{ transform: `translateY(${row.top}px)`, height: row.height }}
        >
          {row.type === "header" ? (
            <div className="flex h-full items-end justify-between gap-3 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {row.group.items.length} item{row.group.items.length === 1 ? "" : "s"}
                </p>
                <h3 className="text-xl font-black italic tracking-tight text-zinc-950 dark:text-white">
                  {row.group.title}
                </h3>
              </div>
            </div>
          ) : (
            <GalleryGrid
              items={row.items}
              columns={layout.columns}
              sourceKind={sourceKind}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              getDragItems={getDragItems}
              onOpen={(item) => onOpen(item, items)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
