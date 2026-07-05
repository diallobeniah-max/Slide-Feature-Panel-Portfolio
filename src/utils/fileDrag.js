export function canDragIndexedFile() {
  return Boolean(window.flowFiles?.startDrag);
}

function getPreviewSource(item) {
  return item?.thumbnailUrl || item?.url || "";
}

function createDragPreview(items) {
  if (typeof document === "undefined") return null;
  const selected = items.slice(0, Math.max(1, Math.min(items.length, 6)));
  const count = items.length;
  const size = count === 1 ? 150 : 168;
  const frameSize = count === 1 ? 112 : 104;
  const rotations =
    count === 2
      ? [-9, 9]
      : count > 2
        ? [-24, -15, -7, 0, 8, 16]
        : [0];

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.left = "-9999px";
  root.style.top = "-9999px";
  root.style.width = `${size}px`;
  root.style.height = `${size}px`;
  root.style.pointerEvents = "none";
  root.style.zIndex = "2147483647";

  const glow = document.createElement("div");
  glow.style.position = "absolute";
  glow.style.left = "14px";
  glow.style.right = "14px";
  glow.style.top = "22px";
  glow.style.bottom = "10px";
  glow.style.borderRadius = "999px";
  glow.style.background = "radial-gradient(circle, rgba(0,0,0,.28) 0%, rgba(0,0,0,.16) 42%, rgba(0,0,0,0) 72%)";
  glow.style.filter = "blur(12px)";
  glow.style.transform = "translateY(12px) scale(.96)";
  root.appendChild(glow);

  selected.forEach((item, index) => {
    const card = document.createElement("div");
    const src = getPreviewSource(item);
    const rotation = rotations[index] || 0;
    const offset = count === 1 ? 19 : 31 + index * 1.5;
    card.style.position = "absolute";
    card.style.left = `${offset}px`;
    card.style.top = `${offset}px`;
    card.style.width = `${frameSize}px`;
    card.style.height = `${frameSize}px`;
    card.style.border = "3px solid white";
    card.style.borderRadius = "14px";
    card.style.background = "#f8fafc";
    card.style.boxShadow = "0 2px 8px rgba(15,23,42,.18)";
    card.style.filter = "drop-shadow(0 12px 12px rgba(0,0,0,.18)) drop-shadow(0 2px 3px rgba(0,0,0,.18))";
    card.style.overflow = "hidden";
    card.style.transform = `rotate(${rotation}deg)`;
    card.style.transformOrigin = "50% 50%";

    if (src) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      card.appendChild(img);
    } else {
      const label = document.createElement("div");
      label.textContent = String(item?.extension || item?.type || "file").toUpperCase();
      label.style.display = "grid";
      label.style.placeItems = "center";
      label.style.width = "100%";
      label.style.height = "100%";
      label.style.color = "#71717a";
      label.style.font = "700 11px system-ui, sans-serif";
      label.style.letterSpacing = ".08em";
      card.appendChild(label);
    }
    root.appendChild(card);
  });

  if (count > 1) {
    const badge = document.createElement("div");
    badge.textContent = String(count);
    badge.style.position = "absolute";
    badge.style.right = "2px";
    badge.style.bottom = "4px";
    badge.style.minWidth = "30px";
    badge.style.height = "30px";
    badge.style.padding = "0 8px";
    badge.style.borderRadius = "999px";
    badge.style.display = "grid";
    badge.style.placeItems = "center";
    badge.style.background = "#18181b";
    badge.style.color = "white";
    badge.style.border = "2px solid white";
    badge.style.font = "800 13px system-ui, sans-serif";
    badge.style.boxShadow = "0 8px 16px rgba(0,0,0,.22)";
    badge.style.filter = "drop-shadow(0 4px 8px rgba(0,0,0,.18))";
    root.appendChild(badge);
  }

  document.body.appendChild(root);
  return root;
}

export function startIndexedFileDrag(event, sourceKind, itemOrItems) {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  const ids = items
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean);
  if (!ids.length) return;
  const label = ids.length === 1 ? ids[0] : `${ids.length} Flow files`;
  event.dataTransfer?.setData("text/plain", label);
  event.dataTransfer?.setData("flow/media-id", ids.join(","));
  event.dataTransfer?.setData("flow/source-kind", sourceKind);
  event.dataTransfer.effectAllowed = "copy";
  const preview = createDragPreview(items.filter((item) => typeof item !== "string"));
  if (preview && event.dataTransfer?.setDragImage) {
    event.dataTransfer.setDragImage(preview, 64, 64);
    window.setTimeout(() => preview.remove(), 0);
  }
  if (canDragIndexedFile()) {
    window.flowFiles.startDrag(sourceKind, ids);
  }
}
