import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import GalleryCard from './components/GalleryCard.jsx';
import Lightbox from './components/Lightbox.jsx';
import galleryData from './data/gallery.json';
import { normalizeMediaItem, resolveAssetUrl, resolveMediaType } from './utils/media.js';

const DEFAULT_SITE = {
  title: 'YOONSUNG ARCHIVE',
  subtitle: 'GIF & Image Showcase // Schale Media Vault',
  status: 'ONLINE',
  background: [],
  backgroundInterval: 9000,
};

export default function App() {
  const site = { ...DEFAULT_SITE, ...(galleryData?.site || {}) };
  const backgroundList = Array.isArray(site.background)
    ? site.background
    : site.background
      ? [site.background]
      : [];
  const backgroundKey = backgroundList.join('|');
  const backgroundUrls = useMemo(
    () => backgroundList.filter(Boolean).map(resolveAssetUrl),
    [backgroundKey],
  );
  const bgIntervalMs = Number(site.backgroundInterval) > 0 ? Number(site.backgroundInterval) : 9000;

  const items = Array.isArray(galleryData?.items)
    ? galleryData.items.map(normalizeMediaItem)
    : [];

  const [bgIndex, setBgIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  useEffect(() => {
    setBgIndex(0);
    if (backgroundUrls.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setBgIndex((prev) => (prev + 1) % backgroundUrls.length);
    }, bgIntervalMs);

    return () => window.clearInterval(timer);
  }, [backgroundUrls.length, bgIntervalMs, backgroundKey]);

  useEffect(() => {
    if (site.title) {
      document.title = `${site.title} — GIF & Image Gallery`;
    }
  }, [site.title]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => resolveMediaType(item) === activeFilter);
  }, [items, activeFilter]);

  const activeItem =
    lightboxIndex >= 0 && lightboxIndex < filteredItems.length
      ? filteredItems[lightboxIndex]
      : null;

  const handleFilterChange = useCallback((nextFilter) => {
    setActiveFilter(nextFilter);
    setLightboxIndex(-1);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setLightboxIndex(-1);
  }, []);

  const handlePrevLightbox = useCallback(() => {
    setLightboxIndex((prev) =>
      filteredItems.length > 0
        ? (prev - 1 + filteredItems.length) % filteredItems.length
        : -1,
    );
  }, [filteredItems.length]);

  const handleNextLightbox = useCallback(() => {
    setLightboxIndex((prev) =>
      filteredItems.length > 0 ? (prev + 1) % filteredItems.length : -1,
    );
  }, [filteredItems.length]);

  return (
    <>
      {/* Blue Archive Frosted GIF/Image Background */}
      <div className="ba-bg" aria-hidden="true">
        {backgroundUrls.length > 0 ? (
          <>
            {backgroundUrls.map((url, idx) => (
              <img
                key={`${url}-${idx}`}
                className={`ba-bg-media ${idx === bgIndex ? 'is-active' : ''}`}
                src={url}
                alt=""
              />
            ))}
            <div className="ba-bg-veil" />
          </>
        ) : (
          <>
            <div className="ba-sky-glow ba-sky-glow--top" />
            <div className="ba-sky-glow ba-sky-glow--bottom" />
            <div className="ba-diagonal-band" />
          </>
        )}
        <svg className="ba-halo-ornament" viewBox="0 0 420 420" fill="none">
          <circle cx="210" cy="210" r="168" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
          <circle cx="210" cy="210" r="136" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 10" opacity="0.25" />
          <path d="M210 22V68M210 352V398M22 210H68M352 210H398" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.28" />
        </svg>
      </div>

      <div className="app-shell">
        <Header
          site={site}
          itemCount={filteredItems.length}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          actionSlot={null}
        />

        <main className="gallery-section">
          {filteredItems.length === 0 ? (
            <div className="empty-state">
              <p className="mono">[ NO DATA ]</p>
              <p className="empty-desc">표시할 이미지나 GIF가 없습니다.</p>
            </div>
          ) : (
            <div className="gallery-grid" aria-live="polite">
              {filteredItems.map((item, index) => (
                <GalleryCard
                  key={`${item.id}-${index}`}
                  item={item}
                  onSelect={() => setLightboxIndex(index)}
                  actions={null}
                />
              ))}
            </div>
          )}
        </main>

        <footer className="site-footer">
          <span className="mono">SCHALE ARCHIVE // GITHUB PAGES</span>
          <span className="footer-sep" aria-hidden="true">/</span>
          <span className="mono">DATA: src/data/gallery.json</span>
        </footer>
      </div>

      <Lightbox
        item={activeItem}
        currentIndex={lightboxIndex}
        totalCount={filteredItems.length}
        onClose={handleCloseLightbox}
        onPrev={handlePrevLightbox}
        onNext={handleNextLightbox}
        actions={null}
      />
    </>
  );
}
