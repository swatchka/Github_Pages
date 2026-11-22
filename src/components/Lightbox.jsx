import { useEffect } from 'react';
import { resolveAssetUrl, resolveMediaType } from '../utils/media.js';

export default function Lightbox({
  item,
  currentIndex,
  totalCount,
  onClose,
  onPrev,
  onNext,
  actions,
}) {
  const hasMultiple = totalCount > 1;

  useEffect(() => {
    if (!item) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && hasMultiple) onPrev();
      if (event.key === 'ArrowRight' && hasMultiple) onNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, hasMultiple, onClose, onPrev, onNext]);

  if (!item) return null;

  const type = resolveMediaType(item);
  const src = resolveAssetUrl(item.file);
  const counterLabel = `${String(currentIndex + 1).padStart(2, '0')} / ${String(totalCount).padStart(2, '0')}`;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="전체화면 이미지 미리보기"
    >
      <div className="lightbox-backdrop" onClick={onClose} />

      <div className="lightbox-topbar">
        <span className={`media-badge ${type === 'gif' ? 'media-badge--gif' : ''}`}>
          <span className="media-badge-label">{type.toUpperCase()}</span>
        </span>
        <button
          type="button"
          className="icon-btn lightbox-close-btn"
          aria-label="닫기"
          onClick={onClose}
        >
          <span className="icon-btn-label">&times;</span>
        </button>
      </div>

      {hasMultiple && (
        <button
          type="button"
          className="nav-btn nav-btn--prev"
          aria-label="이전 항목"
          onClick={onPrev}
        >
          <span className="nav-btn-label">&#8249;</span>
        </button>
      )}

      <div className="lightbox-fullscreen-stage" onClick={onClose}>
        <img
          className="lightbox-media"
          src={src}
          alt="전체화면 미리보기"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {hasMultiple && (
        <button
          type="button"
          className="nav-btn nav-btn--next"
          aria-label="다음 항목"
          onClick={onNext}
        >
          <span className="nav-btn-label">&#8250;</span>
        </button>
      )}

      <div className="lightbox-bottombar">
        <span className="lightbox-counter mono">
          <span className="lightbox-counter-label">{counterLabel}</span>
        </span>
        {actions && <div className="lightbox-actions">{actions}</div>}
      </div>
    </div>
  );
}
