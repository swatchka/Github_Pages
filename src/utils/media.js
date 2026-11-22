/**
 * 문자열 또는 객체 형태 모두 일관된 아이템 객체로 정규화
 */
export function normalizeMediaItem(entry, index = 0) {
  if (typeof entry === 'string') {
    return { id: `item-${index}`, file: entry };
  }
  return {
    id: entry?.id || `item-${index}`,
    file: entry?.file || '',
    type: entry?.type,
  };
}

/**
 * 파일 확장자 또는 명시된 type 필드로 미디어 타입(gif | image) 판별
 */
export function resolveMediaType(item) {
  if (item?.type) return item.type.toLowerCase();
  return /\.gif(\?.*)?$/i.test(item?.file || '') ? 'gif' : 'image';
}

/**
 * Vite base 경로를 반영해 public 폴더 에셋의 실제 URL을 생성
 * (public/ 접두사나 Windows 역슬래시(\)를 입력해도 자동으로 보정)
 */
export function resolveAssetUrl(path = '') {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
    return path;
  }
  const base = import.meta.env.BASE_URL || '/';
  const normalized = path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^public\//i, '');
  return `${base}${normalized}`;
}
