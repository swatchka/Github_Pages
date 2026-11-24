/**
 * Survivor.io 스타일 미니게임 행동 데이터(텔레메트리) 수집 & 요약 & CSV/JSON 내보내기 유틸리티
 * 추후 Supabase 연동 시 buildRunSummary() 결과를 그대로 INSERT 할 수 있는 구조입니다.
 */

export const ARENA_WIDTH = 920;
export const ARENA_HEIGHT = 560;

const HISTORY_STORAGE_KEY = 'yoonsung_survivor_runs_v1';
const MAX_SAVED_RUNS = 10;

const DIRECTION_LABELS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

function createRunId() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const rand = Math.random().toString(36).slice(2, 6);
  return `run_${stamp}_${rand}`;
}

export function createTelemetryRecorder() {
  const runId = createRunId();
  const startedAt = new Date().toISOString();

  const positionSamples = [];
  const events = [];
  const secondMap = new Map();

  let lastSamplePos = null;
  let lastHeadingDeg = null;
  let totalDistancePx = 0;
  let idleTimeMs = 0;
  let sharpTurnCount = 0;
  let turnAngleSum = 0;
  let turnAngleSamples = 0;
  let isCurrentlyIdle = false;
  let damageTakenTotal = 0;
  let damageHits = 0;
  let inputCounts = { keyboard: 0, pointer: 0, idle: 0 };

  const directionCounts = new Array(8).fill(0);

  function ensureSecondBucket(sec) {
    if (!secondMap.has(sec)) {
      secondMap.set(sec, {
        sec,
        killsInSec: 0,
        cumulativeKills: 0,
        hp: 100,
        speedSum: 0,
        speedCount: 0,
        enemyCountSum: 0,
        enemyCountSamples: 0,
        idleSamples: 0,
        totalSamples: 0,
        damageInSec: 0,
      });
    }
    return secondMap.get(sec);
  }

  function recordEvent(type, tMs, payload = {}) {
    events.push({
      tMs: Math.round(tMs),
      type,
      ...payload,
    });

    const sec = Math.floor(tMs / 1000);
    const bucket = ensureSecondBucket(sec);
    if (type === 'kill') {
      bucket.killsInSec += 1;
      if (typeof payload.cumulativeKills === 'number') {
        bucket.cumulativeKills = payload.cumulativeKills;
      }
    } else if (type === 'damage_taken') {
      const amount = Number(payload.amount) || 0;
      damageTakenTotal += amount;
      damageHits += 1;
      bucket.damageInSec += amount;
    }
  }

  /**
   * 100ms(10Hz) 주기로 플레이어 위치·속도·방향·유휴상태·전투 상황 스냅샷 기록
   */
  function recordSample({
    tMs,
    dtSampleMs,
    x,
    y,
    vx,
    vy,
    hp,
    kills,
    enemyCount,
    nearestEnemyDist,
    inputMode,
  }) {
    const speed = Math.hypot(vx, vy);
    const isIdle = speed < 6;

    if (lastSamplePos) {
      totalDistancePx += Math.hypot(x - lastSamplePos.x, y - lastSamplePos.y);
    }
    lastSamplePos = { x, y };

    let headingDeg = null;
    let deltaHeadingDeg = 0;

    if (!isIdle) {
      headingDeg = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
      const dirIndex = Math.round(headingDeg / 45) % 8;
      directionCounts[dirIndex] += 1;

      if (lastHeadingDeg !== null) {
        let diff = Math.abs(headingDeg - lastHeadingDeg);
        if (diff > 180) diff = 360 - diff;
        deltaHeadingDeg = diff;
        turnAngleSum += diff;
        turnAngleSamples += 1;
        if (diff >= 75) sharpTurnCount += 1;
      }
      lastHeadingDeg = headingDeg;
    }

    if (isIdle) {
      idleTimeMs += dtSampleMs;
      inputCounts.idle += 1;
      if (!isCurrentlyIdle) {
        isCurrentlyIdle = true;
        recordEvent('idle_start', tMs, { x: Math.round(x), y: Math.round(y) });
      }
    } else {
      if (inputMode === 'pointer') inputCounts.pointer += 1;
      else inputCounts.keyboard += 1;

      if (isCurrentlyIdle) {
        isCurrentlyIdle = false;
        recordEvent('idle_end', tMs, { x: Math.round(x), y: Math.round(y) });
      }
    }

    positionSamples.push({
      tMs: Math.round(tMs),
      x: Math.round(x),
      y: Math.round(y),
      speed: Math.round(speed),
      headingDeg: headingDeg === null ? null : Math.round(headingDeg),
      deltaHeadingDeg: Math.round(deltaHeadingDeg),
      isIdle,
      hp: Math.round(hp),
      kills,
      enemyCount,
      nearestEnemyDist:
        nearestEnemyDist === null ? null : Math.round(nearestEnemyDist),
    });

    const sec = Math.floor(tMs / 1000);
    const bucket = ensureSecondBucket(sec);
    bucket.hp = Math.round(hp);
    bucket.cumulativeKills = Math.max(bucket.cumulativeKills, kills);
    bucket.speedSum += speed;
    bucket.speedCount += 1;
    bucket.enemyCountSum += enemyCount;
    bucket.enemyCountSamples += 1;
    bucket.totalSamples += 1;
    if (isIdle) bucket.idleSamples += 1;
  }

  function finalize({ survivalMs, kills, level, upgradesPicked, endReason }) {
    const safeSurvivalMs = Math.max(1, Math.round(survivalMs));
    recordEvent('run_end', safeSurvivalMs, {
      endReason,
      kills,
      level,
    });

    const maxSec = Math.floor(safeSurvivalMs / 1000);
    const timeline = [];
    let runningKills = 0;
    let lastHp = 100;

    for (let s = 0; s <= maxSec; s += 1) {
      const b = secondMap.get(s);
      if (b) {
        runningKills = Math.max(runningKills, b.cumulativeKills);
        lastHp = b.hp;
        timeline.push({
          sec: s,
          killsInSec: b.killsInSec,
          cumulativeKills: runningKills,
          hp: b.hp,
          avgSpeed: b.speedCount > 0 ? Math.round(b.speedSum / b.speedCount) : 0,
          avgEnemies:
            b.enemyCountSamples > 0
              ? Number((b.enemyCountSum / b.enemyCountSamples).toFixed(1))
              : 0,
          idleRatio:
            b.totalSamples > 0
              ? Number((b.idleSamples / b.totalSamples).toFixed(2))
              : 0,
          damageInSec: b.damageInSec,
        });
      } else {
        timeline.push({
          sec: s,
          killsInSec: 0,
          cumulativeKills: runningKills,
          hp: lastHp,
          avgSpeed: 0,
          avgEnemies: 0,
          idleRatio: 0,
          damageInSec: 0,
        });
      }
    }

    // 공간 점유 히트맵 (16 x 10 그리드)
    const gridCols = 16;
    const gridRows = 10;
    const heatmap = Array.from({ length: gridRows }, () =>
      new Array(gridCols).fill(0),
    );
    let heatmapMax = 1;

    positionSamples.forEach((sample) => {
      const col = Math.min(
        gridCols - 1,
        Math.max(0, Math.floor((sample.x / ARENA_WIDTH) * gridCols)),
      );
      const row = Math.min(
        gridRows - 1,
        Math.max(0, Math.floor((sample.y / ARENA_HEIGHT) * gridRows)),
      );
      heatmap[row][col] += 1;
      if (heatmap[row][col] > heatmapMax) heatmapMax = heatmap[row][col];
    });

    const survivalSec = safeSurvivalMs / 1000;
    const idleRatio = Math.min(1, idleTimeMs / safeSurvivalMs);
    const totalDirCount = directionCounts.reduce((a, b) => a + b, 0);

    const directionProfile = DIRECTION_LABELS.map((label, idx) => ({
      dir: label,
      count: directionCounts[idx],
      pct:
        totalDirCount > 0
          ? Number(((directionCounts[idx] / totalDirCount) * 100).toFixed(1))
          : 0,
    }));

    return {
      runId,
      startedAt,
      endedAt: new Date().toISOString(),
      arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
      summary: {
        survivalMs: safeSurvivalMs,
        survivalSec: Number(survivalSec.toFixed(1)),
        kills,
        killsPerSec: Number((kills / survivalSec).toFixed(2)),
        level,
        damageTaken: Math.round(damageTakenTotal),
        damageHits,
        totalDistancePx: Math.round(totalDistancePx),
        avgSpeedPxPerSec: Math.round(totalDistancePx / survivalSec),
        idleTimeMs: Math.round(idleTimeMs),
        idlePct: Number((idleRatio * 100).toFixed(1)),
        activePct: Number(((1 - idleRatio) * 100).toFixed(1)),
        sharpTurnCount,
        avgTurnAngleDeg:
          turnAngleSamples > 0
            ? Number((turnAngleSum / turnAngleSamples).toFixed(1))
            : 0,
        inputCounts,
        upgradesPicked,
        endReason,
      },
      directionProfile,
      heatmap: {
        cols: gridCols,
        rows: gridRows,
        max: heatmapMax,
        cells: heatmap,
      },
      timeline,
      positionSamples,
      events,
    };
  }

  return {
    runId,
    recordEvent,
    recordSample,
    finalize,
  };
}

/* ==========================================================================
   Local Run History (비교 분석용)
   ========================================================================== */

export function loadSavedRuns() {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRunToHistory(runReport) {
  try {
    const prev = loadSavedRuns();
    // localStorage 용량 절약을 위해 저장 히스토리에는 핵심 요약/타임라인/히트맵만 보관
    const compact = {
      ...runReport,
      positionSamples: runReport.positionSamples.filter((_, idx) => idx % 2 === 0),
      events: runReport.events.slice(-400),
    };
    const next = [compact, ...prev.filter((r) => r.runId !== compact.runId)].slice(
      0,
      MAX_SAVED_RUNS,
    );
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadSavedRuns();
  }
}

/* ==========================================================================
   CSV / JSON Download Helpers (Python pandas / SQL 분석 바로 가능)
   ========================================================================== */

function triggerFileDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadRunJson(report) {
  triggerFileDownload(
    `${report.runId}_telemetry.json`,
    JSON.stringify(report, null, 2),
    'application/json;charset=utf-8',
  );
}

export function downloadPositionsCsv(report) {
  const headers = [
    'run_id',
    't_ms',
    'x',
    'y',
    'speed',
    'heading_deg',
    'delta_heading_deg',
    'is_idle',
    'hp',
    'kills',
    'enemy_count',
    'nearest_enemy_dist',
  ];
  const rows = (report.positionSamples || []).map((s) =>
    [
      report.runId,
      s.tMs,
      s.x,
      s.y,
      s.speed,
      s.headingDeg ?? '',
      s.deltaHeadingDeg,
      s.isIdle ? 1 : 0,
      s.hp,
      s.kills,
      s.enemyCount,
      s.nearestEnemyDist ?? '',
    ].join(','),
  );
  triggerFileDownload(
    `${report.runId}_positions.csv`,
    [headers.join(','), ...rows].join('\n'),
    'text/csv;charset=utf-8',
  );
}

export function downloadEventsCsv(report) {
  const headers = ['run_id', 't_ms', 'event_type', 'payload_json'];
  const rows = (report.events || []).map((ev) => {
    const { tMs, type, ...rest } = ev;
    const escaped = JSON.stringify(rest).replace(/"/g, '""');
    return `${report.runId},${tMs},${type},"${escaped}"`;
  });
  triggerFileDownload(
    `${report.runId}_events.csv`,
    [headers.join(','), ...rows].join('\n'),
    'text/csv;charset=utf-8',
  );
}
