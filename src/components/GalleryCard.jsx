import { resolveAssetUrl, resolveMediaType } from '../utils/media.js';

export default function GalleryCard({ item, onSelect, actions }) {
  const type = resolveMediaType(item);
  const src = resolveAssetUrl(item.file);

  return (
    <article className="media-card" data-type={type}>
      <button
        type="button"
        className="card-thumb-btn"
        aria-label="전체화면으로 미리보기"
        onClick={onSelect}
      >
        <div className="card-badge-wrap">
          <span className={`media-badge ${type === 'gif' ? 'media-badge--gif' : ''}`}>
            <span className="media-badge-label">{type.toUpperCase()}</span>
          </span>
        </div>
        <img
          className="card-thumb"
          src={src}
          alt=""
          loading="lazy"
        />
      </button>

      {/* 추후 카드별 인터랙션 버튼 슬롯 */}
      {actions && <div className="card-actions-overlay">{actions}</div>}
    </article>
  );
}
