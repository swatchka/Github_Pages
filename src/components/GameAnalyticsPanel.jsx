import { useEffect, useRef } from 'react';
import {
  downloadEventsCsv,
  downloadPositionsCsv,
  downloadRunJson,
} from '../utils/gameTelemetry.js';

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

/**
 * 이동 궤적 + 공간 체류 히트맵 캔버스
 */
function MovementHeatmapCanvas({ report }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const { width: arenaW, height: arenaH } = report.arena;

    ctx.clearRect(0, 0, w, h);

    // 배경 그리드
    ctx.fillStyle = '#f5faff';
    ctx.fillRect(0, 0, w, h);

    const { cols, rows, max, cells } = report.heatmap;
    const cellW = w / cols;
    const cellH = h / rows;

    // 1) 히트맵 셀 (스카이블루 -> 옐로우 -> 코랄핑크)
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const val = cells[r][c];
        if (val <= 0) continue;
        const ratio = Math.min(1, val / Math.max(1, max));
        let fill;
        if (ratio < 0.45) {
          fill = `rgba(18, 138, 250, ${0.1 + ratio * 0.65})`;
        } else if (ratio < 0.78) {
          fill = `rgba(255, 200, 40, ${0.32 + ratio * 0.45})`;
        } else {
          fill = `rgba(255, 91, 140, ${0.42 + ratio * 0.42})`;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }

    // 그리드 가이드선
    ctx.strokeStyle = 'rgba(18, 138, 250, 0.1)';
    ctx.lineWidth = 1;
    for (let c = 1; c < cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo(c * cellW, 0);
      ctx.lineTo(c * cellW, h);
      ctx.stroke();
    }
    for (let r = 1; r < rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH);
      ctx.lineTo(w, r * cellH);
      ctx.stroke();
    }

    // 2) 실제 이동 궤적 폴리라인 (시간 흐름에 따라 시안 -> 딥네이비 그라데이션)
    const samples = report.positionSamples || [];
    if (samples.length > 1) {
      const scaleX = w / arenaW;
      const scaleY = h / arenaH;

      for (let i = 1; i < samples.length; i += 1) {
        const prev = samples[i - 1];
        const curr = samples[i];
        const progress = i / samples.length;
        ctx.strokeStyle = `hsl(${200 + progress * 140}, 88%, ${46 - progress * 8}%)`;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(prev.x * scaleX, prev.y * scaleY);
        ctx.lineTo(curr.x * scaleX, curr.y * scaleY);
        ctx.stroke();
      }

      // 시작점 (초록/민트)
      const first = samples[0];
      ctx.fillStyle = '#00c49a';
      ctx.beginPath();
      ctx.arc(first.x * scaleX, first.y * scaleY, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 종료점 (코랄 핑크)
      const last = samples[samples.length - 1];
      ctx.fillStyle = '#ff3b6b';
      ctx.beginPath();
      ctx.arc(last.x * scaleX, last.y * scaleY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [report]);

  return (
    <canvas
      ref={canvasRef}
      width={460}
      height={280}
      className="analytics-heatmap-canvas"
      aria-label="이동 궤적 및 체류 히트맵"
    />
  );
}

/**
 * 초당 킬(바) + 남은 HP(선) 타임라인 SVG 차트
 */
function CombatTimelineChart({ timeline }) {
  const width = 460;
  const height = 210;
  const pad = { top: 18, right: 20, bottom: 28, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const safeData = timeline && timeline.length > 0 ? timeline : [{ sec: 0, killsInSec: 0, hp: 100 }];
  const maxKills = Math.max(3, ...safeData.map((d) => d.killsInSec));
  const maxSec = Math.max(1, safeData[safeData.length - 1].sec);

  const barW = Math.max(3, Math.min(18, plotW / safeData.length - 2));

  const hpPoints = safeData
    .map((d) => {
      const x = pad.left + (d.sec / maxSec) * plotW;
      const y = pad.top + plotH - (Math.max(0, Math.min(100, d.hp)) / 100) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="analytics-svg-chart"
      role="img"
      aria-label="시간별 처치 수 및 체력 타임라인"
    >
      {/* 수평 가이드 */}
      {[0, 0.5, 1].map((r) => {
        const y = pad.top + plotH * (1 - r);
        return (
          <g key={r}>
            <line
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              stroke="rgba(18, 138, 250, 0.14)"
              strokeDasharray="4 4"
            />
            <text
              x={pad.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="#6e82a3"
              fontFamily="JetBrains Mono, monospace"
            >
              {Math.round(r * 100)}
            </text>
          </g>
        );
      })}

      {/* 초당 킬 막대 */}
      {safeData.map((d) => {
        const x = pad.left + (d.sec / maxSec) * plotW - barW / 2;
        const barH = (d.killsInSec / maxKills) * plotH;
        const y = pad.top + plotH - barH;
        return (
          <rect
            key={d.sec}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0, barH)}
            rx="2"
            fill="rgba(18, 138, 250, 0.42)"
          >
            <title>{`${d.sec}초: ${d.killsInSec}킬 / HP ${d.hp}`}</title>
          </rect>
        );
      })}

      {/* HP 변화 곡선 */}
      <polyline
        fill="none"
        stroke="#ff4b7d"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={hpPoints}
      />

      {/* 피격 지점 마커 */}
      {safeData
        .filter((d) => d.damageInSec > 0)
        .map((d) => {
          const cx = pad.left + (d.sec / maxSec) * plotW;
          const cy = pad.top + plotH - (Math.max(0, Math.min(100, d.hp)) / 100) * plotH;
          return <circle key={`hit-${d.sec}`} cx={cx} cy={cy} r="3.5" fill="#ff2a6d" />;
        })}

      {/* X축 눈금 */}
      {[0, Math.round(maxSec / 2), maxSec].map((secVal, idx) => {
        const x = pad.left + (secVal / maxSec) * plotW;
        return (
          <text
            key={`${secVal}-${idx}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#6e82a3"
            fontFamily="JetBrains Mono, monospace"
          >
            {secVal}s
          </text>
        );
      })}
    </svg>
  );
}

/**
 * 8방향 이동 분포 레이더 차트 (이동 편향 / 카이팅 패턴 확인)
 */
function DirectionRadarChart({ directionProfile }) {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 72;

  const maxPct = Math.max(15, ...directionProfile.map((d) => d.pct));

  const points = directionProfile
    .map((d, idx) => {
      const angle = (idx * 45 * Math.PI) / 180;
      const r = (d.pct / maxPct) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="analytics-radar-svg"
      role="img"
      aria-label="8방향 이동 편향 분포"
    >
      {[0.33, 0.66, 1].map((scale) => (
        <circle
          key={scale}
          cx={cx}
          cy={cy}
          r={radius * scale}
          fill="none"
          stroke="rgba(18, 138, 250, 0.16)"
          strokeDasharray={scale < 1 ? '3 3' : undefined}
        />
      ))}

      {directionProfile.map((d, idx) => {
        const angle = (idx * 45 * Math.PI) / 180;
        const lx = cx + Math.cos(angle) * radius;
        const ly = cy + Math.sin(angle) * radius;
        const tx = cx + Math.cos(angle) * (radius + 17);
        const ty = cy + Math.sin(angle) * (radius + 17) + 3;
        return (
          <g key={d.dir}>
            <line
              x1={cx}
              y1={cy}
              x2={lx}
              y2={ly}
              stroke="rgba(18, 138, 250, 0.14)"
            />
            <text
              x={tx}
              y={ty}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#4b6082"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.dir}
            </text>
          </g>
        );
      })}

      <polygon
        points={points}
        fill="rgba(18, 138, 250, 0.28)"
        stroke="#128afa"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export default function GameAnalyticsPanel({
  report,
  savedRuns,
  onSelectRun,
  onReplay,
}) {
  if (!report) return null;

  const { summary, directionProfile, timeline } = report;

  return (
    <section className="analytics-panel" aria-label="행동 데이터 분석 리포트">
      <div className="analytics-header">
        <div>
          <span className="analytics-kicker mono">BEHAVIORAL TELEMETRY REPORT</span>
          <h2 className="analytics-title">플레이 행동 데이터 분석</h2>
          <p className="analytics-meta mono">
            RUN: {report.runId} · SAMPLES: {report.positionSamples.length} · EVENTS:{' '}
            {report.events.length}
          </p>
        </div>

        <div className="analytics-export-group">
          <button
            type="button"
            className="ba-btn"
            onClick={() => downloadPositionsCsv(report)}
          >
            <span className="ba-btn-label">궤적 CSV</span>
          </button>
          <button
            type="button"
            className="ba-btn"
            onClick={() => downloadEventsCsv(report)}
          >
            <span className="ba-btn-label">이벤트 CSV</span>
          </button>
          <button
            type="button"
            className="ba-btn"
            onClick={() => downloadRunJson(report)}
          >
            <span className="ba-btn-label">전체 JSON</span>
          </button>
          <button
            type="button"
            className="ba-btn ba-btn--yellow"
            onClick={onReplay}
          >
            <span className="ba-btn-label">▶ 다시 플레이</span>
          </button>
        </div>
      </div>

      {/* 핵심 KPI 카드 */}
      <div className="analytics-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label mono">SURVIVAL TIME</span>
          <strong className="kpi-value mono">{formatDuration(summary.survivalSec)}</strong>
          <span className="kpi-sub">LV.{summary.level} 도달</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label mono">MONSTERS KILLED</span>
          <strong className="kpi-value mono">{summary.kills}</strong>
          <span className="kpi-sub">초당 {summary.killsPerSec} 마리</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label mono">ACTIVE / IDLE</span>
          <strong className="kpi-value mono">{summary.activePct}%</strong>
          <span className="kpi-sub">
            유휴(Idle) {summary.idlePct}% ({(summary.idleTimeMs / 1000).toFixed(1)}s)
          </span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label mono">MOVEMENT PROFILE</span>
          <strong className="kpi-value mono">{summary.avgSpeedPxPerSec} px/s</strong>
          <span className="kpi-sub">
            급회전 {summary.sharpTurnCount}회 · 평균각 {summary.avgTurnAngleDeg}°
          </span>
        </div>
      </div>

      {/* 그래프 3종 */}
      <div className="analytics-charts-grid">
        <div className="chart-card">
          <div className="chart-card-head">
            <h3>이동 궤적 &amp; 공간 체류 히트맵</h3>
            <span className="chart-legend mono">● 시작(민트) → ● 종료(핑크)</span>
          </div>
          <MovementHeatmapCanvas report={report} />
          <p className="chart-caption">
            총 이동 거리 <strong>{summary.totalDistancePx.toLocaleString()} px</strong> ·
            열기가 진할수록 오래 머문 구역입니다.
          </p>
        </div>

        <div className="chart-card">
          <div className="chart-card-head">
            <h3>초당 처치 수 &amp; HP 타임라인</h3>
            <span className="chart-legend mono">■ 초당 킬 · — HP(%)</span>
          </div>
          <CombatTimelineChart timeline={timeline} />
          <p className="chart-caption">
            총 피격 <strong>{summary.damageHits}회</strong> (누적 피해{' '}
            <strong>{summary.damageTaken}</strong>) · 빨간 점은 피격 시점입니다.
          </p>
        </div>

        <div className="chart-card chart-card--compact">
          <div className="chart-card-head">
            <h3>8방향 이동 편향 (카이팅 패턴)</h3>
            <span className="chart-legend mono">10Hz 샘플 기준</span>
          </div>
          <div className="radar-wrap">
            <DirectionRadarChart directionProfile={directionProfile} />
            <div className="behavior-bars">
              <div className="bar-metric">
                <div className="bar-metric-head mono">
                  <span>ACTIVE MOVE</span>
                  <span>{summary.activePct}%</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-fill--blue"
                    style={{ width: `${summary.activePct}%` }}
                  />
                </div>
              </div>
              <div className="bar-metric">
                <div className="bar-metric-head mono">
                  <span>IDLE RATIO</span>
                  <span>{summary.idlePct}%</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-fill--yellow"
                    style={{ width: `${summary.idlePct}%` }}
                  />
                </div>
              </div>
              <div className="upgrade-summary">
                <span className="mono">UPGRADES ({summary.upgradesPicked.length})</span>
                <div className="upgrade-chips">
                  {summary.upgradesPicked.length > 0 ? (
                    summary.upgradesPicked.map((u, i) => (
                      <span key={`${u}-${i}`} className="upgrade-chip">
                        {u}
                      </span>
                    ))
                  ) : (
                    <span className="upgrade-empty">선택한 스킬 없음</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 이전 플레이 기록 비교 바 */}
      {savedRuns.length > 1 && (
        <div className="run-history-box">
          <span className="mono run-history-title">RECENT RUNS (클릭해 그래프 비교)</span>
          <div className="run-history-list">
            {savedRuns.map((run) => {
              const isSelected = run.runId === report.runId;
              return (
                <button
                  key={run.runId}
                  type="button"
                  className={`run-pill ${isSelected ? 'is-active' : ''}`}
                  onClick={() => onSelectRun(run)}
                >
                  <span className="mono">{formatDuration(run.summary.survivalSec)}</span>
                  <span>{run.summary.kills}킬</span>
                  <span className="mono">IDLE {run.summary.idlePct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
