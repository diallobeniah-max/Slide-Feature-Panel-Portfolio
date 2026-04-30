import { Camera, CirclePlay, Download, DownloadCloud, FileArchive, History, ImagePlus, ShieldAlert, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPickedMediaItems, InstagramExtractor } from '../services/instagramExtractor.js';
import { downloadBlob, downloadUrl, downloadZip } from '../utils/downloads.js';
import { Button, Card } from './ui.jsx';

export default function InstagramSaver() {
  const [status, setStatus] = useState({ type: 'idle', message: 'Ready to fetch or pick media.' });
  const [igUrl, setIgUrl] = useState('');
  const [igResults, setIgResults] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [igHistory, setIgHistory] = useState(() => {
    const saved = localStorage.getItem('studio_ig_history_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [igFilter, setIgFilter] = useState('all');
  const pickerRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('studio_ig_history_v2', JSON.stringify(igHistory));
  }, [igHistory]);

  const visibleItems = useMemo(() => {
    const items = igResults?.items || [];
    return items.filter((item) => igFilter === 'all' || item.type === igFilter);
  }, [igResults, igFilter]);

  const selectedItems = useMemo(() => {
    const items = igResults?.items || [];
    return items.filter((item) => selectedIds.includes(item.id));
  }, [igResults, selectedIds]);

  async function handleIgFetch(targetUrl = igUrl) {
    if (!targetUrl.trim()) {
      setStatus({ type: 'error', message: 'Paste a link first, or use Pick Media.' });
      return;
    }

    setStatus({ type: 'loading', message: 'Checking Instagram link...' });
    try {
      const result = await InstagramExtractor.fetchMedia(targetUrl);
      setIgResults(result);
      setSelectedIds(result.items.map((item) => item.id));
      setIgHistory((items) => [
        {
          id: crypto.randomUUID(),
          url: targetUrl,
          timestamp: new Date().toLocaleTimeString(),
          count: result.items.length,
          status: result.needsPicker ? 'Pick files' : 'Ready',
        },
        ...items.slice(0, 9),
      ]);
      setStatus({
        type: result.needsPicker ? 'idle' : 'success',
        message: result.needsPicker ? 'Link saved. Pick the real media files to preview and download.' : 'Media loaded.',
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Failed to load link.' });
    }
  }

  function handlePickedMedia(event) {
    const files = event.target.files;
    if (!files?.length) return;

    const pickedItems = createPickedMediaItems(files);
    setIgResults((current) => ({
      sourceUrl: current?.sourceUrl || igUrl,
      postId: current?.postId || 'picked-media',
      needsPicker: false,
      items: [...(current?.items || []), ...pickedItems],
    }));
    setSelectedIds((ids) => [...ids, ...pickedItems.map((item) => item.id)]);
    setStatus({ type: 'success', message: `${pickedItems.length} real media file${pickedItems.length === 1 ? '' : 's'} added.` });
    event.target.value = '';
  }

  function toggleSelected(itemId) {
    setSelectedIds((ids) => (ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId]));
  }

  function removeItem(itemId) {
    setIgResults((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
    setSelectedIds((ids) => ids.filter((id) => id !== itemId));
  }

  function clearAll() {
    setIgUrl('');
    setIgResults(null);
    setSelectedIds([]);
    setStatus({ type: 'idle', message: 'Ready to fetch or pick media.' });
  }

  function handleIgDownloadSingle(item) {
    if (item.file) {
      downloadBlob(item.file, item.suggestedFilename);
      return;
    }
    downloadUrl(item.url, item.suggestedFilename);
  }

  async function handleIgDownloadZip() {
    if (selectedItems.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one media item to download.' });
      return;
    }

    setStatus({ type: 'loading', message: 'Bundling selected media...' });
    try {
      await downloadZip(selectedItems, `instagram_media_${Date.now()}.zip`);
      setStatus({ type: 'success', message: 'Download ready.' });
    } catch {
      setStatus({ type: 'error', message: 'Some remote files blocked download. Pick local files for guaranteed ZIP export.' });
    }
  }

  return (
    <section className="instagram-grid">
      <div className="panel-stack">
        <Card className="history-card">
          <div className="card-header">
            <h3>
              <History size={14} /> History
            </h3>
            <button className="text-action danger-text" onClick={() => setIgHistory([])}>Clear</button>
          </div>
          <div className="history-list">
            {igHistory.map((item) => (
              <button key={item.id} onClick={() => { setIgUrl(item.url); handleIgFetch(item.url); }}>
                <span>{item.url}</span>
                <small>{item.timestamp} · {item.status}</small>
              </button>
            ))}
            {igHistory.length === 0 ? <div className="empty-small">No history yet.</div> : null}
          </div>
        </Card>

        <div className="rights-note">
          <ShieldAlert size={16} />
          <p>Only download content you have rights to use. Browser apps cannot bypass private Instagram pages.</p>
        </div>
      </div>

      <div className="instagram-main">
        <Card className="fetch-card">
          <div className="url-field">
            <Camera size={18} />
            <input value={igUrl} onChange={(event) => setIgUrl(event.target.value)} placeholder="Paste Instagram post/reel link or direct media URL..." />
          </div>
          <div className="fetch-actions">
            <Button icon={DownloadCloud} onClick={() => handleIgFetch()} disabled={status.type === 'loading'}>Fetch</Button>
            <Button variant="secondary" icon={ImagePlus} onClick={() => pickerRef.current?.click()}>Pick Media</Button>
            <Button variant="secondary" icon={X} onClick={clearAll}>Clear</Button>
          </div>
          <input ref={pickerRef} type="file" className="hidden" accept="image/*,video/*" multiple onChange={handlePickedMedia} />
        </Card>

        <div className="status-line">
          <span className={`status-dot ${status.type}`} />
          {status.message}
        </div>

        {igResults?.needsPicker ? (
          <Card className="picker-callout">
            <ImagePlus size={28} />
            <div>
              <h3>Pick the actual saved media</h3>
              <p>{igResults.message}</p>
            </div>
            <Button icon={ImagePlus} onClick={() => pickerRef.current?.click()}>Open Picker</Button>
          </Card>
        ) : null}

        {igResults ? (
          <div className="ig-results">
            <div className="result-toolbar">
              <div className="filter-tabs">
                <button onClick={() => setIgFilter('all')} className={igFilter === 'all' ? 'active' : ''}>All</button>
                <button onClick={() => setIgFilter('image')} className={igFilter === 'image' ? 'active' : ''}>Images</button>
                <button onClick={() => setIgFilter('video')} className={igFilter === 'video' ? 'active' : ''}>Videos</button>
              </div>
              <Button icon={FileArchive} onClick={handleIgDownloadZip} disabled={selectedItems.length === 0}>
                Download ZIP ({selectedItems.length})
              </Button>
            </div>

            {visibleItems.length > 0 ? (
              <div className="media-grid">
                {visibleItems.map((item) => (
                  <div key={item.id} className={`media-card ${selectedIds.includes(item.id) ? 'selected' : ''}`}>
                    {item.type === 'video' ? (
                      <video src={item.url} muted playsInline controls />
                    ) : (
                      <img src={item.thumbnail} alt={item.suggestedFilename} />
                    )}
                    <div className="media-type">
                      <CirclePlay size={10} />
                      {item.type}
                    </div>
                    <label className="media-select">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                      Select
                    </label>
                    <div className="media-actions">
                      <button onClick={() => handleIgDownloadSingle(item)} aria-label="Download media"><Download size={18} /></button>
                      <button onClick={() => removeItem(item.id)} aria-label="Remove media"><Trash2 size={18} /></button>
                    </div>
                    <div className="media-name">{item.suggestedFilename}</div>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="empty-media">
                <ImagePlus size={32} />
                <h3>No generic preview images here</h3>
                <p>Use Pick Media to add the real Instagram images or videos you saved. They will show here and export in the ZIP.</p>
                <Button icon={ImagePlus} onClick={() => pickerRef.current?.click()}>Pick Media</Button>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
