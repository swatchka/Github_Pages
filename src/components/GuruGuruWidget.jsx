import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../utils/media.js';

const MAX_ACTIVE_RUNNERS = 40;
const CLICK_WINDOW_MS = 1000;
const DEFAULT_MAX_CLICKS_PER_SEC = 7;

/**
 * 각 GIF 인스턴스를 완전히 독립된 DOM 요소로 유지해
 * 새 오브젝트가 생성되어도 기존 GIF가 리렌더링되거나 영향을 받지 않도록 분리
 */
const GuruRunner = memo(function GuruRunner({ runner, onComplete }) {
  return (
    <img
      className="guru-runner"
      src={runner.src}
      alt=""
      style={{
        height: runner.size ? `${runner.size}px` : undefined,
        animationDuration: `${runner.durationMs}ms`,
      }}
      onAnimationEnd={() => onComplete(runner.id, runner.objectUrl)}
    />
  );
});

export default function GuruGuruWidget({ config }) {
  const [runners, setRunners] = useState([]);
  const [pressCount, setPressCount] = useState(0);
  const [isButtonHidden, setIsButtonHidden] = useState(false);

  const nextIdRef = useRef(1);
  const clickTimesRef = useRef([]);
  const blobCacheRef = useRef(new Map());
  const activeObjectUrlsRef = useRef(new Set());

  const label = config?.label || 'Guru Guru';
  const durationMs = Number(config?.durationMs) > 0 ? Number(config.durationMs) : 2600;
  const customSize = Number(config?.size) > 0 ? Number(config.size) : null;
  const maxClicksPerSec =
    Number(config?.maxClicksPerSec) > 0
      ? Number(config.maxClicksPerSec)
      : DEFAULT_MAX_CLICKS_PER_SEC;

  const files = Array.isArray(config?.file)
    ? config.file.filter(Boolean)
    : config?.file
      ? [config.file]
      : [];
  const filesKey = files.join('|');

  // GIF 원본을 Blob으로 한 번만 미리 받아두어, 클릭할 때마다 네트워크 재요청 없이
  // 완전히 독립된 ObjectURL(새 GIF 타임라인/디코더)을 즉시 생성
  useEffect(() => {
    let cancelled = false;
    const urls = files.map(resolveAssetUrl);

    urls.forEach(async (url) => {
      if (blobCacheRef.current.has(url)) return;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        if (!cancelled) {
          blobCacheRef.current.set(url, blob);
        }
      } catch {
        // 프리로드 실패 시 클릭 시점에 일반 URL로 폴백
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filesKey]);

  // 컴포넌트 언마운트 시 남아있는 ObjectURL 메모리 정리
  useEffect(() => {
    return () => {
      activeObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      activeObjectUrlsRef.current.clear();
    };
  }, []);

  const handleRemove = useCallback((id, objectUrl) => {
    setRunners((prev) => prev.filter((runner) => runner.id !== id));
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      activeObjectUrlsRef.current.delete(objectUrl);
    }
  }, []);

  const handleLaunch = useCallback(() => {
    if (files.length === 0 || isButtonHidden) return;

    // 최근 1초간 클릭 횟수 체크 (초당 7회 이상이면 효과 없이 즉시 소멸 — 새로고침 시 복구)
    const now = performance.now();
    const recentClicks = clickTimesRef.current.filter(
      (timestamp) => now - timestamp <= CLICK_WINDOW_MS,
    );
    recentClicks.push(now);
    clickTimesRef.current = recentClicks;

    if (recentClicks.length >= maxClicksPerSec) {
      setIsButtonHidden(true);
      return;
    }

    const id = nextIdRef.current++;
    const chosenFile = files[(id - 1) % files.length];
    const resolvedUrl = resolveAssetUrl(chosenFile);

    // 캐시된 Blob으로 매 클릭마다 새 오브젝트 URL 발급 -> 기존 GIF 애니메이션과 완전 독립
    const cachedBlob = blobCacheRef.current.get(resolvedUrl);
    let src = resolvedUrl;
    let objectUrl = null;
    if (cachedBlob) {
      objectUrl = URL.createObjectURL(cachedBlob);
      activeObjectUrlsRef.current.add(objectUrl);
      src = objectUrl;
    }

    setPressCount((prev) => prev + 1);
    setRunners((prev) => {
      const nextRunner = {
        id,
        src,
        objectUrl,
        durationMs,
        size: customSize,
      };

      if (prev.length >= MAX_ACTIVE_RUNNERS) {
        const overflowCount = prev.length - MAX_ACTIVE_RUNNERS + 1;
        const removed = prev.slice(0, overflowCount);
        removed.forEach((r) => {
          if (r.objectUrl) {
            URL.revokeObjectURL(r.objectUrl);
            activeObjectUrlsRef.current.delete(r.objectUrl);
          }
        });
        return [...prev.slice(overflowCount), nextRunner];
      }

      return [...prev, nextRunner];
    });
  }, [files, isButtonHidden, maxClicksPerSec, durationMs, customSize]);

  return (
    <>
      {/* 화면 하단 수평 이동 오버레이 레이어 */}
      <div className="guru-stage" aria-hidden="true">
        {runners.map((runner) => (
          <GuruRunner
            key={runner.id}
            runner={runner}
            onComplete={handleRemove}
          />
        ))}
      </div>

      {/* 우측 하단 플로팅 Guru Guru 버튼 (초당 7회 이상 클릭 시 즉시 소멸, 새로고침 시 복구) */}
      {!isButtonHidden && (
        <button
          type="button"
          className="ba-btn ba-btn--yellow guru-fab"
          onClick={handleLaunch}
          aria-label={`${label} 실행`}
        >
          <span className="ba-btn-label">
            <span
              className="guru-fab-icon"
              style={{ transform: `rotate(${pressCount * 360}deg)` }}
              aria-hidden="true"
            >
              ↻
            </span>
            <span>{label}</span>
          </span>
        </button>
      )}
    </>
  );
}
