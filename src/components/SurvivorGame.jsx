import { useCallback, useEffect, useRef, useState } from 'react';
import GameAnalyticsPanel from './GameAnalyticsPanel.jsx';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  createTelemetryRecorder,
  loadSavedRuns,
  saveRunToHistory,
} from '../utils/gameTelemetry.js';

const UPGRADE_POOL = [
  {
    id: 'multishot',
    name: '멀티 샷 +1',
    desc: '자동 조준 탄환 발사 수가 1발 증가합니다.',
    apply: (p) => {
      p.projectiles += 1;
    },
  },
  {
    id: 'rapid',
    name: '연사 가속',
    desc: '공격 쿨타임이 18% 짧아집니다.',
    apply: (p) => {
      p.fireInterval = Math.max(130, p.fireInterval * 0.82);
    },
  },
  {
    id: 'orbit',
    name: '헤일로 오비트 +1',
    desc: '주변을 회전하며 적을 베는 방어 드론을 추가합니다.',
    apply: (p) => {
      p.orbitCount += 1;
    },
  },
  {
    id: 'damage',
    name: '관통 화력 강화',
    desc: '공격력 +35% 및 탄환 관통력이 1 증가합니다.',
    apply: (p) => {
      p.damage = Math.round(p.damage * 1.35);
      p.pierce += 1;
    },
  },
  {
    id: 'speed',
    name: '기동력 부스트',
    desc: '이동 속도가 15% 빨라집니다.',
    apply: (p) => {
      p.speed = Math.min(360, Math.round(p.speed * 1.15));
    },
  },
  {
    id: 'magnet_heal',
    name: '응급 수복 + 자석',
    desc: '체력 +28 회복 및 경험치 자석 범위가 넓어집니다.',
    apply: (p) => {
      p.hp = Math.min(p.maxHp, p.hp + 28);
      p.pickupRadius += 38;
    },
  },
];

function pickRandomUpgrades(count = 3) {
  const pool = [...UPGRADE_POOL];
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function formatHudTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${String(min).padStart(2, '0')}:${sec}`;
}

export default function SurvivorGame() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const keysRef = useRef(new Set());
  const pointerRef = useRef({ active: false, x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 });

  const [phase, setPhase] = useState('ready'); // 'ready' | 'playing' | 'levelup' | 'gameover'
  const [hud, setHud] = useState({
    timeMs: 0,
    kills: 0,
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    xpToNext: 10,
    enemyCount: 0,
  });
  const [upgradeChoices, setUpgradeChoices] = useState([]);
  const [savedRuns, setSavedRuns] = useState(() => loadSavedRuns());
  const [activeReport, setActiveReport] = useState(null);

  const finishRun = useCallback((endReason) => {
    const g = gameRef.current;
    if (!g || g.ended) return;
    g.ended = true;

    const report = g.telemetry.finalize({
      survivalMs: g.elapsedMs,
      kills: g.kills,
      level: g.player.level,
      upgradesPicked: g.upgradesPicked,
      endReason,
    });

    const nextHistory = saveRunToHistory(report);
    setSavedRuns(nextHistory);
    setActiveReport(report);
    setUpgradeChoices([]);
    setPhase('gameover');
  }, []);

  const startNewGame = useCallback(() => {
    keysRef.current.clear();
    pointerRef.current.active = false;

    const telemetry = createTelemetryRecorder();
    telemetry.recordEvent('run_start', 0, {
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
    });

    gameRef.current = {
      ended: false,
      elapsedMs: 0,
      sampleAccMs: 0,
      hudAccMs: 0,
      spawnAccMs: 0,
      fireAccMs: 0,
      orbitAngle: 0,
      kills: 0,
      upgradesPicked: [],
      telemetry,
      player: {
        x: ARENA_WIDTH / 2,
        y: ARENA_HEIGHT / 2,
        vx: 0,
        vy: 0,
        radius: 15,
        hp: 100,
        maxHp: 100,
        speed: 215,
        damage: 20,
        fireInterval: 480,
        projectiles: 1,
        pierce: 0,
        orbitCount: 0,
        pickupRadius: 88,
        level: 1,
        xp: 0,
        xpToNext: 8,
        invulnMs: 0,
        hitFlashMs: 0,
      },
      enemies: [],
      bullets: [],
      gems: [],
      particles: [],
      nextEnemyId: 1,
    };

    setHud({
      timeMs: 0,
      kills: 0,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      xpToNext: 8,
      enemyCount: 0,
    });
    setUpgradeChoices([]);
    setActiveReport(null);
    setPhase('playing');
  }, []);

  const handleChooseUpgrade = useCallback((upgrade) => {
    const g = gameRef.current;
    if (!g || g.ended) return;

    upgrade.apply(g.player);
    g.upgradesPicked.push(upgrade.name);
    g.telemetry.recordEvent('upgrade_pick', g.elapsedMs, {
      upgradeId: upgrade.id,
      upgradeName: upgrade.name,
      level: g.player.level,
    });

    setUpgradeChoices([]);
    setPhase('playing');
  }, []);

  // 키보드 입력 리스너
  useEffect(() => {
    const moveKeys = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
    ]);

    const handleKeyDown = (e) => {
      if (moveKeys.has(e.code)) {
        if (phase === 'playing') e.preventDefault();
        keysRef.current.add(e.code);
      }
    };

    const handleKeyUp = (e) => {
      keysRef.current.delete(e.code);
    };

    const handleBlur = () => {
      keysRef.current.clear();
      pointerRef.current.active = false;
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [phase]);

  // 메인 60fps 게임 루프 + 10Hz 행동 텔레메트리 수집
  useEffect(() => {
    if (phase !== 'playing') return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    let rafId = 0;
    let lastTs = performance.now();

    const spawnEnemy = (g) => {
      const elapsedSec = g.elapsedMs / 1000;
      const edge = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      const margin = 26;
      if (edge === 0) {
        x = Math.random() * ARENA_WIDTH;
        y = -margin;
      } else if (edge === 1) {
        x = ARENA_WIDTH + margin;
        y = Math.random() * ARENA_HEIGHT;
      } else if (edge === 2) {
        x = Math.random() * ARENA_WIDTH;
        y = ARENA_HEIGHT + margin;
      } else {
        x = -margin;
        y = Math.random() * ARENA_HEIGHT;
      }

      const roll = Math.random();
      let kind = 'normal';
      if (elapsedSec > 24 && roll > 0.84) kind = 'heavy';
      else if (elapsedSec > 10 && roll > 0.62) kind = 'fast';

      const hpScale = 1 + elapsedSec * 0.025;
      const speedScale = 1 + Math.min(0.6, elapsedSec * 0.005);

      const specs = {
        normal: { radius: 13, hp: 32 * hpScale, speed: 78 * speedScale, damage: 11, xp: 2, color: '#ff5b8c' },
        fast: { radius: 10, hp: 20 * hpScale, speed: 128 * speedScale, damage: 9, xp: 3, color: '#ffb703' },
        heavy: { radius: 20, hp: 96 * hpScale, speed: 54 * speedScale, damage: 18, xp: 6, color: '#7b5cff' },
      };

      const spec = specs[kind];
      g.enemies.push({
        id: g.nextEnemyId++,
        kind,
        x,
        y,
        radius: spec.radius,
        hp: spec.hp,
        maxHp: spec.hp,
        speed: spec.speed,
        damage: spec.damage,
        xp: spec.xp,
        color: spec.color,
        hitFlashMs: 0,
        orbitHitCdMs: 0,
      });
    };

    const spawnParticles = (g, x, y, color, count = 6) => {
      for (let i = 0; i < count; i += 1) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 120;
        g.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 260 + Math.random() * 180,
          maxLife: 440,
          size: 2.5 + Math.random() * 3,
          color,
        });
      }
    };

    const killEnemy = (g, enemy) => {
      g.kills += 1;
      g.gems.push({
        x: enemy.x,
        y: enemy.y,
        xp: enemy.xp,
        radius: enemy.xp >= 5 ? 7 : 5,
      });
      spawnParticles(g, enemy.x, enemy.y, enemy.color, 7);
      g.telemetry.recordEvent('kill', g.elapsedMs, {
        enemyKind: enemy.kind,
        x: Math.round(enemy.x),
        y: Math.round(enemy.y),
        cumulativeKills: g.kills,
      });
    };

    const fireBullets = (g) => {
      if (g.enemies.length === 0) return;
      const p = g.player;

      let nearest = null;
      let nearestDistSq = Infinity;
      for (let i = 0; i < g.enemies.length; i += 1) {
        const e = g.enemies[i];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestDistSq) {
          nearestDistSq = d2;
          nearest = e;
        }
      }
      if (!nearest) return;

      const baseAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      const count = p.projectiles;
      const spreadStep = 0.16;

      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * spreadStep;
        const angle = baseAngle + offset;
        const bulletSpeed = 520;
        g.bullets.push({
          x: p.x + Math.cos(angle) * 14,
          y: p.y + Math.sin(angle) * 14,
          vx: Math.cos(angle) * bulletSpeed,
          vy: Math.sin(angle) * bulletSpeed,
          radius: 5,
          damage: p.damage,
          pierceLeft: p.pierce,
          hitIds: new Set(),
          lifeMs: 1400,
        });
      }
    };

    const renderScene = (g) => {
      const p = g.player;
      ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      // 1) 블루 아카이브 전술 아레나 바닥
      const bgGrad = ctx.createLinearGradient(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
      bgGrad.addColorStop(0, '#f4faff');
      bgGrad.addColorStop(1, '#e6f3ff');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      // 미세 전술 그리드
      ctx.strokeStyle = 'rgba(18, 138, 250, 0.09)';
      ctx.lineWidth = 1;
      const step = 46;
      for (let x = step; x < ARENA_WIDTH; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ARENA_HEIGHT);
        ctx.stroke();
      }
      for (let y = step; y < ARENA_HEIGHT; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ARENA_WIDTH, y);
        ctx.stroke();
      }

      // 중앙 샬레 링 마커
      ctx.strokeStyle = 'rgba(18, 138, 250, 0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 110, 0, Math.PI * 2);
      ctx.stroke();

      // 2) 경험치 보석
      for (let i = 0; i < g.gems.length; i += 1) {
        const gem = g.gems[i];
        ctx.save();
        ctx.translate(gem.x, gem.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = gem.xp >= 5 ? '#ffd43b' : '#28b4ff';
        ctx.fillRect(-gem.radius, -gem.radius, gem.radius * 2, gem.radius * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-gem.radius, -gem.radius, gem.radius * 2, gem.radius * 2);
        ctx.restore();
      }

      // 3) 적 몬스터
      for (let i = 0; i < g.enemies.length; i += 1) {
        const e = g.enemies[i];
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = e.hitFlashMs > 0 ? '#ffffff' : e.color;
        ctx.strokeStyle = '#1d2c48';
        ctx.lineWidth = 2;

        if (e.kind === 'fast') {
          const ang = Math.atan2(p.y - e.y, p.x - e.x);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(e.radius + 3, 0);
          ctx.lineTo(-e.radius, -e.radius * 0.85);
          ctx.lineTo(-e.radius, e.radius * 0.85);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (e.kind === 'heavy') {
          ctx.beginPath();
          for (let s = 0; s < 6; s += 1) {
            const a = (s * Math.PI) / 3;
            const px = Math.cos(a) * e.radius;
            const py = Math.sin(a) * e.radius;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        // 체력이 깎인 적은 미니 HP 바 표시
        if (e.hp < e.maxHp) {
          const bw = e.radius * 2.1;
          ctx.fillStyle = 'rgba(29, 44, 72, 0.22)';
          ctx.fillRect(e.x - bw / 2, e.y - e.radius - 9, bw, 4);
          ctx.fillStyle = e.color;
          ctx.fillRect(
            e.x - bw / 2,
            e.y - e.radius - 9,
            bw * Math.max(0, e.hp / e.maxHp),
            4,
          );
        }
      }

      // 4) 탄환
      for (let i = 0; i < g.bullets.length; i += 1) {
        const b = g.bullets[i];
        ctx.fillStyle = '#128afa';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // 5) 헤일로 오비트 드론
      if (p.orbitCount > 0) {
        const orbitR = 64;
        ctx.strokeStyle = 'rgba(18, 138, 250, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < p.orbitCount; i += 1) {
          const ang = g.orbitAngle + (i * Math.PI * 2) / p.orbitCount;
          const ox = p.x + Math.cos(ang) * orbitR;
          const oy = p.y + Math.sin(ang) * orbitR;
          ctx.fillStyle = '#ffd93d';
          ctx.beginPath();
          ctx.arc(ox, oy, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#128afa';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
      }

      // 6) 파티클
      for (let i = 0; i < g.particles.length; i += 1) {
        const pt = g.particles[i];
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 7) 플레이어 (샬레 헤일로 유닛)
      ctx.save();
      ctx.translate(p.x, p.y);
      // 픽업 범위 은은한 링
      ctx.strokeStyle = 'rgba(18, 138, 250, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, p.pickupRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 외부 헤일로 링
      ctx.strokeStyle = p.hitFlashMs > 0 ? '#ff3b6b' : '#32b4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 6, 0, Math.PI * 2);
      ctx.stroke();

      // 본체
      ctx.fillStyle = p.hitFlashMs > 0 ? '#ff5b8c' : '#128afa';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 이동 방향 화살표 표시
      if (Math.hypot(p.vx, p.vy) > 10) {
        const dirAng = Math.atan2(p.vy, p.vx);
        ctx.rotate(dirAng);
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath();
        ctx.moveTo(p.radius + 11, 0);
        ctx.lineTo(p.radius + 3, -5);
        ctx.lineTo(p.radius + 3, 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    const tick = (now) => {
      const g = gameRef.current;
      if (!g || g.ended) return;

      const dtMs = Math.min(50, Math.max(0, now - lastTs));
      const dt = dtMs / 1000;
      lastTs = now;

      g.elapsedMs += dtMs;
      const p = g.player;

      if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
      if (p.hitFlashMs > 0) p.hitFlashMs = Math.max(0, p.hitFlashMs - dtMs);

      // 1) 입력 처리 (키보드 우선, 마우스/터치 드래그 보조)
      const keys = keysRef.current;
      let moveX = 0;
      let moveY = 0;
      let inputMode = 'idle';

      if (keys.has('ArrowLeft') || keys.has('KeyA')) moveX -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) moveX += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) moveY -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) moveY += 1;

      if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        p.vx = (moveX / len) * p.speed;
        p.vy = (moveY / len) * p.speed;
        inputMode = 'keyboard';
      } else if (pointerRef.current.active) {
        const dx = pointerRef.current.x - p.x;
        const dy = pointerRef.current.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          p.vx = (dx / dist) * p.speed;
          p.vy = (dy / dist) * p.speed;
          inputMode = 'pointer';
        } else {
          p.vx = 0;
          p.vy = 0;
        }
      } else {
        p.vx = 0;
        p.vy = 0;
      }

      p.x = Math.max(p.radius + 6, Math.min(ARENA_WIDTH - p.radius - 6, p.x + p.vx * dt));
      p.y = Math.max(p.radius + 6, Math.min(ARENA_HEIGHT - p.radius - 6, p.y + p.vy * dt));

      // 2) 웨이브 스폰 (시간에 따라 스폰 주기 단축)
      const elapsedSec = g.elapsedMs / 1000;
      const spawnInterval = Math.max(260, 1050 - elapsedSec * 14);
      g.spawnAccMs += dtMs;
      while (g.spawnAccMs >= spawnInterval) {
        g.spawnAccMs -= spawnInterval;
        spawnEnemy(g);
        if (elapsedSec > 35 && Math.random() < 0.35) spawnEnemy(g);
      }

      // 3) 자동 공격
      g.fireAccMs += dtMs;
      if (g.fireAccMs >= p.fireInterval) {
        g.fireAccMs -= p.fireInterval;
        fireBullets(g);
      }

      // 4) 탄환 이동 & 충돌
      for (let i = g.bullets.length - 1; i >= 0; i -= 1) {
        const b = g.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.lifeMs -= dtMs;

        if (
          b.lifeMs <= 0 ||
          b.x < -30 ||
          b.x > ARENA_WIDTH + 30 ||
          b.y < -30 ||
          b.y > ARENA_HEIGHT + 30
        ) {
          g.bullets.splice(i, 1);
          continue;
        }

        let removeBullet = false;
        for (let j = g.enemies.length - 1; j >= 0; j -= 1) {
          const e = g.enemies[j];
          if (b.hitIds.has(e.id)) continue;
          const dist = Math.hypot(b.x - e.x, b.y - e.y);
          if (dist <= b.radius + e.radius) {
            b.hitIds.add(e.id);
            e.hp -= b.damage;
            e.hitFlashMs = 70;

            if (e.hp <= 0) {
              killEnemy(g, e);
              g.enemies.splice(j, 1);
            }

            if (b.pierceLeft > 0) {
              b.pierceLeft -= 1;
            } else {
              removeBullet = true;
              break;
            }
          }
        }
        if (removeBullet) g.bullets.splice(i, 1);
      }

      // 5) 오비트 드론 회전 & 충돌
      g.orbitAngle += dt * 3.4;
      if (p.orbitCount > 0) {
        const orbitR = 64;
        for (let i = 0; i < p.orbitCount; i += 1) {
          const ang = g.orbitAngle + (i * Math.PI * 2) / p.orbitCount;
          const ox = p.x + Math.cos(ang) * orbitR;
          const oy = p.y + Math.sin(ang) * orbitR;

          for (let j = g.enemies.length - 1; j >= 0; j -= 1) {
            const e = g.enemies[j];
            if (e.orbitHitCdMs > 0) continue;
            if (Math.hypot(ox - e.x, oy - e.y) <= 9 + e.radius) {
              e.hp -= Math.round(p.damage * 1.15);
              e.hitFlashMs = 70;
              e.orbitHitCdMs = 260;
              if (e.hp <= 0) {
                killEnemy(g, e);
                g.enemies.splice(j, 1);
              }
            }
          }
        }
      }

      // 6) 적 추적 이동 & 플레이어 피격
      let nearestEnemyDist = null;
      for (let i = 0; i < g.enemies.length; i += 1) {
        const e = g.enemies[i];
        if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
        if (e.orbitHitCdMs > 0) e.orbitHitCdMs = Math.max(0, e.orbitHitCdMs - dtMs);

        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (nearestEnemyDist === null || dist < nearestEnemyDist) {
          nearestEnemyDist = dist;
        }
        if (dist > 0.01) {
          e.x += (dx / dist) * e.speed * dt;
          e.y += (dy / dist) * e.speed * dt;
        }

        if (dist <= p.radius + e.radius - 2 && p.invulnMs <= 0) {
          p.hp = Math.max(0, p.hp - e.damage);
          p.invulnMs = 460;
          p.hitFlashMs = 180;
          spawnParticles(g, p.x, p.y, '#ff3b6b', 9);
          g.telemetry.recordEvent('damage_taken', g.elapsedMs, {
            amount: e.damage,
            enemyKind: e.kind,
            remainingHp: p.hp,
          });
          if (p.hp <= 0) {
            renderScene(g);
            finishRun('defeated');
            return;
          }
        }
      }

      // 7) 경험치 자석 흡수 & 레벨업 체크
      let leveledUp = false;
      for (let i = g.gems.length - 1; i >= 0; i -= 1) {
        const gem = g.gems[i];
        const dx = p.x - gem.x;
        const dy = p.y - gem.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= p.pickupRadius) {
          const pullSpeed = 390;
          if (dist > 1) {
            gem.x += (dx / dist) * pullSpeed * dt;
            gem.y += (dy / dist) * pullSpeed * dt;
          }
        }
        if (dist <= p.radius + gem.radius + 6) {
          p.xp += gem.xp;
          g.gems.splice(i, 1);
          if (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level += 1;
            p.xpToNext = Math.round(p.xpToNext * 1.42 + 4);
            leveledUp = true;
            g.telemetry.recordEvent('level_up', g.elapsedMs, {
              level: p.level,
            });
          }
        }
      }

      // 8) 파티클 업데이트
      for (let i = g.particles.length - 1; i >= 0; i -= 1) {
        const pt = g.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dtMs;
        if (pt.life <= 0) g.particles.splice(i, 1);
      }

      // 9) 10Hz(100ms) 행동 텔레메트리 샘플 기록
      g.sampleAccMs += dtMs;
      if (g.sampleAccMs >= 100) {
        const sampleDt = g.sampleAccMs;
        g.sampleAccMs = 0;
        g.telemetry.recordSample({
          tMs: g.elapsedMs,
          dtSampleMs: sampleDt,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          hp: p.hp,
          kills: g.kills,
          enemyCount: g.enemies.length,
          nearestEnemyDist,
          inputMode,
        });
      }

      // 10) HUD 동기화 (~10fps)
      g.hudAccMs += dtMs;
      if (g.hudAccMs >= 100 || leveledUp) {
        g.hudAccMs = 0;
        setHud({
          timeMs: g.elapsedMs,
          kills: g.kills,
          hp: p.hp,
          maxHp: p.maxHp,
          level: p.level,
          xp: p.xp,
          xpToNext: p.xpToNext,
          enemyCount: g.enemies.length,
        });
      }

      renderScene(g);

      if (leveledUp) {
        keysRef.current.clear();
        pointerRef.current.active = false;
        setUpgradeChoices(pickRandomUpgrades(3));
        setPhase('levelup');
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [phase, finishRun]);

  // 캔버스 포인터(마우스/터치) 좌표 변환
  const updatePointerPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = ARENA_WIDTH / rect.width;
    const scaleY = ARENA_HEIGHT / rect.height;
    pointerRef.current.x = (e.clientX - rect.left) * scaleX;
    pointerRef.current.y = (e.clientY - rect.top) * scaleY;
  };

  return (
    <section className="game-workspace" aria-label="서바이버 미니게임 및 행동 데이터 분석">
      {/* 게임 상단 HUD 바 */}
      <div className="game-hud-bar">
        <div className="hud-stats">
          <div className="hud-chip">
            <span className="hud-chip-label mono">TIME</span>
            <strong className="hud-chip-value mono">{formatHudTime(hud.timeMs)}</strong>
          </div>
          <div className="hud-chip">
            <span className="hud-chip-label mono">KILLS</span>
            <strong className="hud-chip-value mono">{hud.kills}</strong>
          </div>
          <div className="hud-chip">
            <span className="hud-chip-label mono">LV.{hud.level}</span>
            <div className="hud-mini-bar">
              <div
                className="hud-mini-fill hud-mini-fill--xp"
                style={{ width: `${Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100)}%` }}
              />
            </div>
          </div>
          <div className="hud-chip hud-chip--hp">
            <span className="hud-chip-label mono">HP {Math.round(hud.hp)}</span>
            <div className="hud-mini-bar">
              <div
                className="hud-mini-fill hud-mini-fill--hp"
                style={{ width: `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="hud-controls">
          {phase === 'playing' && (
            <button
              type="button"
              className="ba-btn"
              onClick={() => finishRun('manual_stop')}
            >
              <span className="ba-btn-label">■ 종료 &amp; 그래프 분석</span>
            </button>
          )}
          {phase === 'ready' && savedRuns.length > 0 && (
            <button
              type="button"
              className="ba-btn"
              onClick={() => {
                setActiveReport(savedRuns[0]);
                setPhase('gameover');
              }}
            >
              <span className="ba-btn-label">최근 분석 보기 ({savedRuns.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 아레나 캔버스 컨테이너 (게임오버 분석 화면일 때는 숨김 가능) */}
      {phase !== 'gameover' && (
        <div className="game-stage-wrap">
          <canvas
            ref={canvasRef}
            width={ARENA_WIDTH}
            height={ARENA_HEIGHT}
            className="game-canvas"
            onPointerDown={(e) => {
              if (phase !== 'playing') return;
              pointerRef.current.active = true;
              updatePointerPos(e);
            }}
            onPointerMove={(e) => {
              if (!pointerRef.current.active) return;
              updatePointerPos(e);
            }}
            onPointerUp={() => {
              pointerRef.current.active = false;
            }}
            onPointerLeave={() => {
              pointerRef.current.active = false;
            }}
          />

          {/* 시작 전 오버레이 */}
          {phase === 'ready' && (
            <div className="game-overlay">
              <div className="game-modal-card">
                <span className="analytics-kicker mono">SCHALE TACTICAL SURVIVOR</span>
                <h2 className="game-modal-title">탕탕 서바이버 · 행동 텔레메트리</h2>
                <p className="game-modal-desc">
                  몰려오는 드론을 피해 살아남으세요! 공격은 자동 조준으로 발사되며,
                  플레이하는 동안 <strong>10Hz 이동 궤적·유휴(Idle) 시간·초당 처치·방향 편향</strong>이
                  자동으로 기록되어 종료 즉시 그래프로 분석됩니다.
                </p>
                <div className="game-controls-hint mono">
                  <span>이동: WASD / 방향키</span>
                  <span>또는 캔버스 드래그</span>
                </div>
                <button
                  type="button"
                  className="ba-btn ba-btn--yellow game-start-btn"
                  onClick={startNewGame}
                >
                  <span className="ba-btn-label">▶ 작전 개시 (START)</span>
                </button>
              </div>
            </div>
          )}

          {/* 레벨업 3지선다 오버레이 */}
          {phase === 'levelup' && (
            <div className="game-overlay">
              <div className="game-modal-card game-modal-card--wide">
                <span className="analytics-kicker mono">LEVEL UP! · LV.{hud.level}</span>
                <h2 className="game-modal-title">전술 업그레이드 선택</h2>
                <div className="upgrade-grid">
                  {upgradeChoices.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="upgrade-option-card"
                      onClick={() => handleChooseUpgrade(u)}
                    >
                      <strong>{u.name}</strong>
                      <span>{u.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 게임 종료 시 행동 데이터 그래프 대시보드 */}
      {phase === 'gameover' && (
        <GameAnalyticsPanel
          report={activeReport}
          savedRuns={savedRuns}
          onSelectRun={setActiveReport}
          onReplay={startNewGame}
        />
      )}
    </section>
  );
}
