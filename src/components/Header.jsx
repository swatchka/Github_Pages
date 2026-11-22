const FILTER_OPTIONS = [
  { id: 'all', label: 'ALL' },
  { id: 'gif', label: 'GIF' },
  { id: 'image', label: 'IMAGE' },
];

export default function Header({
  site,
  itemCount,
  activeFilter,
  onFilterChange,
  actionSlot,
}) {
  const countLabel = `${String(itemCount).padStart(2, '0')} ITEMS`;

  return (
    <header className="site-header">
      <div className="header-accent-bar" aria-hidden="true">
        <span className="accent-seg accent-seg--main" />
        <span className="accent-seg accent-seg--sub" />
      </div>

      <div className="header-top">
        <div className="status-pill">
          <span className="status-dot" />
          <span className="status-text">{site.status || 'ONLINE'}</span>
        </div>

        <div className="header-meta-pill mono">
          <span className="meta-label">TOTAL</span>
          <span className="meta-value">{countLabel}</span>
        </div>
      </div>

      <div className="header-main">
        <h1 className="site-title">{site.title || 'YOONSUNG ARCHIVE'}</h1>
        <p className="site-subtitle">
          {site.subtitle || 'GIF & Image Showcase // Schale Media Vault'}
        </p>
      </div>

      <nav className="control-bar" aria-label="갤러리 컨트롤">
        <div className="filter-group" role="tablist" aria-label="미디어 타입 필터">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`ba-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => onFilterChange(opt.id)}
              >
                <span className="ba-btn-label">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* 추후 커스텀 인터랙션 버튼이 들어갈 슬롯 */}
        <div className="action-slot" aria-label="인터랙션 버튼 영역">
          {actionSlot}
        </div>
      </nav>
    </header>
  );
}
