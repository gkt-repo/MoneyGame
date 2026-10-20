import React, { useEffect, useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';

interface Dice3DProps {
  isRolling: boolean;
  targetNumber: number | null; // 1 to 10
  rollIndex: number;
  isMatch?: boolean;
  onLanded?: (number: number) => void;
}

// Web Audio sound synthesizer for realistic dice clatter and table impact
function playDiceRollSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(260 + (i * 25) + Math.random() * 80, now + i * 0.14);
      gain.gain.setValueAtTime(0.07, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.06);
    }
  } catch {
    // Audio autoplay restrictions gracefully handled
  }
}

function playDiceImpactSound(isMatch: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Felt table impact thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);

    if (isMatch) {
      // Victory fanfare chords (C5 -> E5 -> G5 -> C6)
      const chimeNotes = [523.25, 659.25, 783.99, 1046.5];
      chimeNotes.forEach((freq, idx) => {
        const chime = ctx.createOscillator();
        const cGain = ctx.createGain();
        chime.type = 'triangle';
        chime.frequency.setValueAtTime(freq, now + 0.08 + idx * 0.09);
        cGain.gain.setValueAtTime(0.12, now + 0.08 + idx * 0.09);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45 + idx * 0.09);
        chime.connect(cGain);
        cGain.connect(ctx.destination);
        chime.start(now + 0.08 + idx * 0.09);
        chime.stop(now + 0.45 + idx * 0.09);
      });
    }
  } catch {
    // Graceful fallback
  }
}

export const Dice3D: React.FC<Dice3DProps> = ({
  isRolling,
  targetNumber,
  rollIndex,
  isMatch = false,
  onLanded,
}) => {
  // 3D rotation angles
  // Resting position: Face 1 forward (0 deg Y), tilted 14 deg on X so 3D top facet is visible
  const [rotX, setRotX] = useState(14);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(-3);
  const [transY, setTransY] = useState(0);
  const [bouncePhase, setBouncePhase] = useState<'idle' | 'airborne' | 'landed'>('idle');
  const [shockwave, setShockwave] = useState(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geometric configuration of the 10-faced prism
  // 10 faces around Y-axis: 36 deg per face
  // Radius R = (faceWidth / 2) / tan(18 deg) ~ (54 / 2) / 0.3249 ~ 83.1px
  const faceWidth = 54;
  const faceHeight = 84;
  const radius = 83;
  const faces = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // Whenever rolling begins or targetNumber updates:
  useEffect(() => {
    if (isRolling) {
      setBouncePhase('airborne');
      playDiceRollSound();

      // Launch dynamic 3D tumbling motion in the air
      // Random tumbling speed
      const tumbleRounds = 4 + Math.floor(Math.random() * 2);
      const targetFace = targetNumber ?? 7;
      // Formula to bring face `targetFace` to front (0 deg):
      // Each face k is positioned at (k - 1) * 36 deg.
      // So rotating by -((targetFace - 1) * 36) brings it to 0 deg facing camera!
      const finalY = (tumbleRounds * 360) - ((targetFace - 1) * 36);
      const finalX = (tumbleRounds * 360) + 14;
      const finalZ = (tumbleRounds % 2 === 0 ? 360 : -360) - 3;

      setTransY(-85); // Leap up in the air
      setRotX(finalX);
      setRotY(finalY);
      setRotZ(finalZ);

      // Schedule landing and bounce sequence after 1.5 seconds of tumbling
      animTimeoutRef.current = setTimeout(() => {
        setTransY(0);
        setBouncePhase('landed');
        setShockwave(true);
        playDiceImpactSound(isMatch);
        if (onLanded && targetNumber) {
          onLanded(targetNumber);
        }
        setTimeout(() => setShockwave(false), 800);
      }, 1500);

      return () => {
        if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
      };
    } else if (targetNumber !== null) {
      // Resting on target number
      const targetFace = targetNumber;
      const currentSpins = Math.floor(rotY / 360);
      const alignedY = (currentSpins * 360) - ((targetFace - 1) * 36);
      setRotX(14);
      setRotY(alignedY);
      setRotZ(-3);
      setTransY(0);
      setBouncePhase('landed');
    }
  }, [isRolling, targetNumber, rollIndex, isMatch]);

  return (
    <div className="relative flex flex-col items-center justify-center select-none py-6 overflow-hidden">
      {/* ─── 3D ARENA CONTAINER ─── */}
      <div
        className="relative w-72 h-64 flex items-center justify-center"
        style={{ perspective: '1100px', perspectiveOrigin: '50% 50%' }}
      >
        {/* Ambient Felt Table Glow */}
        <div
          className={`absolute w-48 h-48 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
            isMatch
              ? 'bg-amber-400/30 scale-125'
              : bouncePhase === 'airborne'
              ? 'bg-emerald-500/15 scale-90'
              : 'bg-emerald-500/25 scale-105'
          }`}
        />

        {/* Dynamic Ground Shadow Under Dice */}
        <div
          className="absolute bottom-10 w-32 h-10 rounded-full transition-all duration-500 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.75) 0%, rgba(15, 23, 42, 0.25) 50%, transparent 75%)',
            transform:
              bouncePhase === 'airborne'
                ? 'scale(0.55) translateY(18px)'
                : 'scale(1.1) translateY(0px)',
            opacity: bouncePhase === 'airborne' ? 0.35 : 0.85,
            filter: bouncePhase === 'airborne' ? 'blur(6px)' : 'blur(2px)',
          }}
        />

        {/* Shockwave ripple ring on impact */}
        {shockwave && (
          <div
            className={`absolute bottom-12 rounded-full pointer-events-none animate-ping ${
              isMatch
                ? 'w-36 h-12 border-2 border-amber-400/70 bg-amber-400/20'
                : 'w-32 h-10 border-2 border-emerald-400/60 bg-emerald-400/15'
            }`}
          />
        )}

        {/* ─── 3D 10-FACED POLYHEDRAL PRISM DICE ─── */}
        <div
          className="relative transition-all"
          style={{
            width: `${faceWidth}px`,
            height: `${faceHeight}px`,
            transformStyle: 'preserve-3d',
            transform: `translateY(${transY}px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`,
            transition: isRolling
              ? 'transform 1.5s cubic-bezier(0.2, 0.85, 0.32, 1.05)'
              : 'transform 0.4s ease-out',
          }}
        >
          {/* Top Decagonal Beveled Cap */}
          <div
            className="absolute top-0 left-0 flex items-center justify-center font-bold text-xs"
            style={{
              width: `${faceWidth}px`,
              height: `${faceWidth}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #f59e0b 0%, #b45309 60%, #78350f 100%)',
              border: '2px solid rgba(254, 240, 138, 0.8)',
              boxShadow: 'inset 0 0 8px rgba(0,0,0,0.5), 0 0 6px rgba(245, 158, 11, 0.4)',
              transform: `rotateX(90deg) translateZ(${faceHeight / 2}px)`,
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="w-5 h-5 rounded-full border border-amber-200/80 flex items-center justify-center text-[9px] text-amber-100 font-black">
              ★
            </div>
          </div>

          {/* Bottom Decagonal Beveled Cap */}
          <div
            className="absolute bottom-0 left-0"
            style={{
              width: `${faceWidth}px`,
              height: `${faceWidth}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #064e3b 0%, #022c22 100%)',
              border: '2px solid rgba(16, 185, 129, 0.6)',
              transform: `rotateX(-90deg) translateZ(${faceHeight / 2}px)`,
              backfaceVisibility: 'hidden',
            }}
          />

          {/* 10 Faces around the cylinder */}
          {faces.map((num) => {
            const angle = (num - 1) * 36;
            const isTarget = targetNumber === num;
            return (
              <div
                key={num}
                className="absolute inset-0 flex flex-col items-center justify-between py-2 rounded-md transition-colors"
                style={{
                  width: `${faceWidth}px`,
                  height: `${faceHeight}px`,
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  background: isTarget && isMatch
                    ? 'linear-gradient(145deg, #f59e0b 0%, #d97706 50%, #92400e 100%)'
                    : isTarget
                    ? 'linear-gradient(145deg, #10b981 0%, #059669 50%, #064e3b 100%)'
                    : 'linear-gradient(145deg, #047857 0%, #065f46 60%, #022c22 100%)',
                  border: isTarget && isMatch
                    ? '2px solid rgba(254, 240, 138, 0.95)'
                    : isTarget
                    ? '2px solid rgba(110, 231, 183, 0.9)'
                    : '1.5px solid rgba(251, 191, 36, 0.65)',
                  boxShadow: isTarget && isMatch
                    ? 'inset 0 0 12px rgba(254, 240, 138, 0.6), 0 0 14px rgba(245, 158, 11, 0.8)'
                    : 'inset 0 0 8px rgba(0, 0, 0, 0.45)',
                  backfaceVisibility: 'hidden',
                }}
              >
                {/* Top pip indicator */}
                <div className="flex items-center gap-0.5">
                  <span
                    className={`text-[8px] font-black ${
                      isTarget && isMatch ? 'text-amber-100' : 'text-emerald-200/90'
                    }`}
                  >
                    ✦ {num} ✦
                  </span>
                </div>

                {/* Main Large Face Number (1-10) */}
                <div className="relative">
                  <span
                    className={`font-black font-mono tracking-tight select-none block leading-none ${
                      num === 10 ? 'text-2xl' : 'text-3xl'
                    } ${
                      isTarget && isMatch
                        ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                        : 'text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                    }`}
                  >
                    {num}
                  </span>
                </div>

                {/* Bottom decorative pips */}
                <div className="flex items-center justify-center gap-1">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isTarget && isMatch ? 'bg-amber-100' : 'bg-amber-400/80'
                    }`}
                  />
                  <div
                    className={`w-1 h-1 rounded-full ${
                      isTarget && isMatch ? 'bg-amber-200' : 'bg-emerald-300/70'
                    }`}
                  />
                </div>

                {/* Subtle Glass Sheen Reflection */}
                <div
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 45%, transparent 60%)',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── STATUS BADGE & ROLL METRIC ─── */}
      <div className="mt-2 text-center space-y-1 z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700 shadow-md text-xs font-bold text-white">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>ROLL #{rollIndex}</span>
          <span className="text-slate-400 font-normal">| 10-Digit 3D Dice</span>
        </div>

        {targetNumber !== null && !isRolling && (
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {isMatch ? (
              <span className="inline-flex items-center gap-1 text-sm font-extrabold text-amber-500 animate-bounce">
                <Sparkles className="w-4 h-4" />
                NUMBER MATCHED: #{targetNumber}!
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-600">
                Landed on #{targetNumber}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
