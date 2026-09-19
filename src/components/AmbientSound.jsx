import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, CloudRain, Disc, Waves, Coffee } from 'lucide-react';

export default function AmbientSound() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundType, setSoundType] = useState('rain'); // 'rain' | 'vinyl' | 'waves' | 'cafe'
  const [volume, setVolume] = useState(0.2);
  const [showMenu, setShowMenu] = useState(false);

  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sourceNodesRef = useRef([]);

  const sounds = [
    { id: 'rain', label: 'Quiet Rain', icon: CloudRain },
    { id: 'vinyl', label: 'Vinyl Crackle', icon: Disc },
    { id: 'waves', label: 'Soft Waves', icon: Waves },
    { id: 'cafe', label: 'Warm Cafe', icon: Coffee }
  ];

  const stopAudio = () => {
    if (sourceNodesRef.current.length) {
      sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch (e) {}
        try { node.disconnect(); } catch (e) {}
      });
      sourceNodesRef.current = [];
    }
  };

  const startAudio = (type) => {
    stopAudio();

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);
    gainNodeRef.current = masterGain;

    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    if (type === 'rain' || type === 'cafe') {
      // Pink noise synthesis for rain/cafe
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }
    } else if (type === 'waves') {
      // Soft undulating ocean noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.1;
      }
    } else {
      // Vinyl crackle noise
      for (let i = 0; i < bufferSize; i++) {
        const crackle = Math.random() > 0.997 ? (Math.random() * 2 - 1) * 0.4 : 0;
        output[i] = (Math.random() * 2 - 1) * 0.02 + crackle;
      }
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter sculpting
    const filter = ctx.createBiquadFilter();
    filter.type = type === 'rain' ? 'lowpass' : type === 'waves' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(type === 'rain' ? 800 : type === 'waves' ? 400 : 1200, ctx.currentTime);

    if (type === 'waves') {
      // Oscillating LFO for wave motion
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.2; // 0.2 Hz cycle
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 300;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      sourceNodesRef.current.push(lfo);
    }

    whiteNoise.connect(filter);
    filter.connect(masterGain);
    whiteNoise.start();

    sourceNodesRef.current.push(whiteNoise);
  };

  useEffect(() => {
    if (isPlaying) {
      startAudio(soundType);
    } else {
      stopAudio();
    }
    return () => stopAudio();
  }, [isPlaying, soundType]);

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime);
    }
  }, [volume]);

  return (
    <div className="relative inline-block text-xs font-sans">
      <button
        onClick={() => setShowMenu(prev => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
          isPlaying
            ? 'bg-[var(--accent-warm)] text-white border-[var(--accent-warm)] font-medium shadow-sm'
            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
        }`}
        title="Ambient Soundscapes for Focus"
      >
        {isPlaying ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
        <span>{isPlaying ? 'Sound: On' : 'Ambient Focus'}</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 bg-[var(--card-bg)] border border-[var(--border-subtle)] rounded-lg p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-[11px] font-sans uppercase tracking-wider text-[var(--text-muted)] font-medium mb-2 flex justify-between items-center">
            <span>Reading Soundscapes</span>
            <button onClick={() => setShowMenu(false)} className="hover:text-[var(--text-primary)] text-xs">✕</button>
          </div>

          <div className="space-y-1 mb-3">
            {sounds.map(s => {
              const Icon = s.icon;
              const active = isPlaying && soundType === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSoundType(s.id);
                    setIsPlaying(true);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors ${
                    active
                      ? 'bg-[var(--text-primary)] text-[var(--bg-main)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--code-bg)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                  </span>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]" />}
                </button>
              );
            })}
          </div>

          {/* Volume Slider */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1">
            <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
              <span>Volume</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--border-subtle)] rounded accent-[var(--accent-warm)] cursor-pointer"
            />
          </div>

          <div className="mt-3 text-center pt-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => setIsPlaying(prev => !prev)}
              className="quiet-button-secondary text-xs w-full py-1"
            >
              {isPlaying ? 'Pause Ambient Sound' : 'Play Selected Sound'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
