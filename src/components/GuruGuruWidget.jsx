import { useCallback, useRef, useState } from 'react';
import { resolveAssetUrl } from '../utils/media.js';

const MAX_ACTIVE_RUNNERS = 24;

export default function GuruGuruWidget({ config }) {
  const [runners, setRunners] = useState([]);
  const [pressCount, setPressCount] = useState(0);
  const nextIdRef = useRef(1);

  const label = config?.label || 'Guru Guru';
  const durationMs = Number(config?.durationMs) > 0 ? Number(config.durationMs) : 1300;
  const customSize = Number(config?.size) > 0 ? Number(config.size) : null;

  const files = Array.isArray(config?.file)
    ? config.file.filter(Boolean)
    : config?.file
      ? [config.file]
      : [];

  const handleLaunch = useCallback(() => {
    if (files.length === 0) return;

    const id = nextIdRef.current++;
    const chosenFile = files[(id - 1) % files.length];
    const src = resolveAssetUrl(chosenFile);

    setPressCount((prev) => prev + 1);
    setRunners((prev) => {
      const nextRunner = {
        id,
        src,
        durationMs,
        size: customSize,
      };

      const trimmed =
        prev.length >= MAX_ACTIVE_RUNNERS
          ? prev.slice(prev.length - MAX_ACTIVE_RUNNERS + 1)
          : prev;

      return [...trimmed, nextRunner];
    });
  }, [files, durationMs, customSize]);

  const handleRemove = useCallback((id) => {
    setRunners((prev) => prev.filter((runner) => runner.id !== id));
  }, []);

  return (
    <>
      {/* 화면 하단 수평 이동 오버레이 레이어 */}
      <div className="guru-stage" aria-hidden="true">
        {runners.map((runner) => (
          <img
            key={runner.id}
            className="guru-runner"
            src={runner.src}
            alt=""
            style={{
              height: runner.size ? `${runner.size}px` : undefined,
              animationDuration: `${runner.durationMs}ms`,
            }}
            onAnimationEnd={() => handleRemove(runner.id)}
          />
        ))}
      </div>

      {/* 우측 하단 플로팅 Guru Guru 버튼 */}
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
    </>
  );
}
