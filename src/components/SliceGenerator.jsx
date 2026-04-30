import { Edit3, FileArchive, Grid3X3, Image as ImageIcon, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_CUSTOM_PRESETS, STATIC_PRESETS } from '../constants/presets.jsx';
import { dataUrlToBlob, downloadZip } from '../utils/downloads.js';
import { Button, Card, Input } from './ui.jsx';

export default function SliceGenerator() {
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready to start.' });
  const [sourceImage, setSourceImage] = useState(null);
  const [slideWidth, setSlideWidth] = useState(1080);
  const [slideHeight, setSlideHeight] = useState(1080);
  const [slideCount, setSlideCount] = useState(1);
  const [prefix, setPrefix] = useState('Promo_Asset');
  const [direction, setDirection] = useState('horizontal');
  const [generatedSlices, setGeneratedSlices] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const [customPresets, setCustomPresets] = useState(() => {
    const saved = localStorage.getItem('studio_custom_presets_v2');
    return saved ? JSON.parse(saved) : INITIAL_CUSTOM_PRESETS;
  });
  const [isPresetFormOpen, setIsPresetFormOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [presetForm, setPresetForm] = useState({ name: '', w: 1080, h: 1080 });

  useEffect(() => {
    localStorage.setItem('studio_custom_presets_v2', JSON.stringify(customPresets));
  }, [customPresets]);

  function handleMouseDown(event) {
    if (!sourceImage) return;
    setIsDragging(true);
    dragStart.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  }

  function handleMouseMove(event) {
    if (!isDragging) return;
    setPan({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y });
  }

  function handleImageImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        setSourceImage(img.src);
        setStatus({ type: 'success', message: 'Image imported.' });
        setGeneratedSlices([]);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      };
      img.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  }

  function resetAll() {
    setSourceImage(null);
    setGeneratedSlices([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStatus({ type: 'idle', message: 'Ready.' });
  }

  const generateSlices = useCallback(async () => {
    if (!sourceImage) return;
    setStatus({ type: 'loading', message: 'Processing slices...' });

    const img = new Image();
    img.src = sourceImage;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const slices = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = slideWidth;
    canvas.height = slideHeight;

    for (let i = 0; i < slideCount; i += 1) {
      ctx.clearRect(0, 0, slideWidth, slideHeight);
      const sourceWidth = direction === 'horizontal' ? img.width / slideCount : img.width;
      const sourceHeight = direction === 'horizontal' ? img.height : img.height / slideCount;
      const sourceX = direction === 'horizontal' ? i * sourceWidth : 0;
      const sourceY = direction === 'horizontal' ? 0 : i * sourceHeight;
      const zoomFactor = 1 / zoom;
      const panX = (pan.x / 100) * sourceWidth;
      const panY = (pan.y / 100) * sourceHeight;

      ctx.drawImage(
        img,
        sourceX - panX,
        sourceY - panY,
        sourceWidth * zoomFactor,
        sourceHeight * zoomFactor,
        0,
        0,
        slideWidth,
        slideHeight,
      );
      slices.push(canvas.toDataURL('image/png'));
    }

    setGeneratedSlices(slices);
    setStatus({ type: 'success', message: 'Slices generated.' });
  }, [sourceImage, slideWidth, slideHeight, slideCount, direction, zoom, pan]);

  async function exportSliceZip() {
    if (generatedSlices.length === 0) return;
    const items = generatedSlices.map((dataUrl, index) => ({
      id: String(index),
      type: 'image',
      file: dataUrlToBlob(dataUrl),
      suggestedFilename: `${prefix}_Slide_${String(index + 1).padStart(2, '0')}.png`,
    }));
    await downloadZip(items, `${prefix}_Set.zip`);
  }

  function openNewPresetForm() {
    setEditingPresetId(null);
    setPresetForm({ name: '', w: slideWidth, h: slideHeight });
    setIsPresetFormOpen(true);
  }

  function openEditPresetForm(event, preset) {
    event.stopPropagation();
    setEditingPresetId(preset.id);
    setPresetForm({ name: preset.name, w: preset.w, h: preset.h });
    setIsPresetFormOpen(true);
  }

  function savePreset() {
    if (!presetForm.name || presetForm.w <= 0 || presetForm.h <= 0) return;
    if (editingPresetId) {
      setCustomPresets((items) => items.map((item) => (item.id === editingPresetId ? { ...presetForm, id: item.id } : item)));
    } else {
      setCustomPresets((items) => [{ ...presetForm, id: crypto.randomUUID() }, ...items]);
    }
    setIsPresetFormOpen(false);
  }

  function deletePreset(event, id) {
    event.stopPropagation();
    setCustomPresets((items) => items.filter((item) => item.id !== id));
  }

  return (
    <section className="workspace-grid">
      <div className="panel-stack">
        <Card className="control-card">
          <div className="card-header">
            <h3>
              <Settings size={18} /> Controls
            </h3>
            <button className="text-action danger-text" onClick={resetAll}>
              Reset
            </button>
          </div>

          <div className="range-box">
            <label>Canvas Zoom</label>
            <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(event) => setZoom(parseFloat(event.target.value))} />
          </div>

          <Input label="Custom Name Prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} />

          <div className="preset-header">
            <span>Presets</span>
            <button onClick={openNewPresetForm}>
              <Plus size={14} /> Add New
            </button>
          </div>

          <div className="preset-list">
            {isPresetFormOpen ? (
              <div className="preset-form">
                <input placeholder="Name" value={presetForm.name} onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })} />
                <div className="two-col">
                  <input type="number" value={presetForm.w} onChange={(event) => setPresetForm({ ...presetForm, w: Number(event.target.value) })} />
                  <input type="number" value={presetForm.h} onChange={(event) => setPresetForm({ ...presetForm, h: Number(event.target.value) })} />
                </div>
                <Button onClick={savePreset}>Save Preset</Button>
              </div>
            ) : null}

            <div className="preset-grid">
              {customPresets.map((preset) => (
                <div key={preset.id} className={`preset-tile ${slideWidth === preset.w && slideHeight === preset.h ? 'selected' : ''}`}>
                  <button onClick={() => { setSlideWidth(preset.w); setSlideHeight(preset.h); }}>
                    <strong>{preset.name}</strong>
                    <span>{preset.w}x{preset.h}</span>
                  </button>
                  <div>
                    <button onClick={(event) => openEditPresetForm(event, preset)} aria-label="Edit preset"><Edit3 size={12} /></button>
                    <button onClick={(event) => deletePreset(event, preset.id)} aria-label="Delete preset"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>

            {STATIC_PRESETS.map((category) => (
              <div key={category.category} className="preset-category">
                <div className="preset-category-title">
                  {category.icon}
                  {category.category}
                </div>
                <div className="preset-grid">
                  {category.items.map((item) => (
                    <button
                      key={`${category.category}-${item.name}`}
                      className={`preset-button ${slideWidth === item.w && slideHeight === item.h ? 'selected' : ''}`}
                      onClick={() => { setSlideWidth(item.w); setSlideHeight(item.h); }}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.w}x{item.h}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="two-col">
            <Input label="Width" type="number" value={slideWidth} onChange={(event) => setSlideWidth(Number(event.target.value))} />
            <Input label="Height" type="number" value={slideHeight} onChange={(event) => setSlideHeight(Number(event.target.value))} />
          </div>

          <div className="two-col align-end">
            <Input label="Slices" type="number" min="1" value={slideCount} onChange={(event) => setSlideCount(Math.max(1, Number(event.target.value)))} />
            <div className="input-wrap">
              <span>Direction</span>
              <div className="mini-tabs">
                <button className={direction === 'horizontal' ? 'active' : ''} onClick={() => setDirection('horizontal')}>H</button>
                <button className={direction === 'vertical' ? 'active' : ''} onClick={() => setDirection('vertical')}>V</button>
              </div>
            </div>
          </div>

          <input type="file" className="hidden" ref={fileInputRef} onChange={handleImageImport} accept="image/*" />
          <Button variant="outline" icon={Upload} onClick={() => fileInputRef.current?.click()}>Import Source</Button>
          <Button icon={Grid3X3} disabled={!sourceImage} onClick={generateSlices}>Slice Image</Button>
        </Card>

        <div className="status-line">
          <span className={`status-dot ${status.type}`} />
          {status.message}
        </div>
      </div>

      <div className="preview-stack">
        <Card
          className="canvas-preview"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          {!sourceImage ? (
            <ImageIcon className="empty-icon" size={64} />
          ) : (
            <div className="image-stage" style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}>
              <img src={sourceImage} draggable="false" alt="Source" />
              <div className={`slice-overlay ${direction}`}>
                {Array.from({ length: slideCount }).map((_, index) => (
                  <div key={index}>Slide {index + 1}</div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {generatedSlices.length > 0 ? (
          <div className="generated-block">
            <div className="section-title-row">
              <h5>Generated Assets List</h5>
              <Button icon={FileArchive} onClick={exportSliceZip}>Export ZIP</Button>
            </div>
            <div className="generated-grid">
              {generatedSlices.map((slice, index) => (
                <div key={slice} className="generated-item">
                  <img src={slice} alt={`Generated slice ${index + 1}`} />
                  <button onClick={() => setGeneratedSlices((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 size={16} />
                  </button>
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
