// ============================================================================
// AUDIO-ENGINE.JS - HỆ THỐNG HIỆU ỨNG ÂM THANH & NHẠC NỀN (WEB AUDIO API)
// 100% Thuần Web Audio API - Tự tạo âm thanh lập trình (Procedural Synthesis)
// Không cần tải file MP3/WAV, 0KB dung lượng mạng, siêu nhẹ & không bao giờ lỗi 404
// ============================================================================

(function (window) {
  'use strict';

  class GameAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.bgmGain = null;
      this.sfxGain = null;

      // Trạng thái âm thanh
      this.isMuted = localStorage.getItem('bug_hunter_muted') === 'true';
      this.masterVolume = 0.75;
      this.currentTheme = null;
      this.isUnlocked = false;

      // Sequencer cho nhạc nền
      this.bgmInterval = null;
      this.bgmStep = 0;
      this.bgmTempo = 118; // BPM
      this.remainingQuestionTime = 45;

      // Tự động kích hoạt khi có tương tác đầu tiên của người dùng
      this._bindAutoUnlock();
    }

    _initContext() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('[AudioEngine] Web Audio API không được trình duyệt này hỗ trợ.');
        return;
      }

      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // BGM Gain (Nhạc nền dịu hơn một chút so với SFX)
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      // SFX Gain (Hiệu ứng âm thanh rõ ràng)
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }

    _bindAutoUnlock() {
      const unlockHandler = () => {
        this.unlock();
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
    }

    unlock() {
      if (!this.ctx) {
        this._initContext();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.isUnlocked = true;
          // Nếu có theme đang chờ, chạy ngay
          if (this.currentTheme && !this.bgmInterval) {
            this._runBGMSequencer();
          }
        }).catch((e) => console.log('[AudioEngine] Resume failed:', e));
      } else {
        this.isUnlocked = true;
      }
    }

    toggleMute() {
      this.setMuted(!this.isMuted);
      return this.isMuted;
    }

    setMuted(muted) {
      this._initContext();
      this.isMuted = !!muted;
      localStorage.setItem('bug_hunter_muted', this.isMuted ? 'true' : 'false');

      if (this.masterGain && this.ctx) {
        const targetGain = this.isMuted ? 0.0001 : this.masterVolume;
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(targetGain, this.ctx.currentTime + 0.08);
      }
    }

    setVolume(vol) {
      this.masterVolume = Math.max(0, Math.min(1, vol));
      if (!this.isMuted && this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      }
    }

    // ==========================================================================
    // CÁC HÀM HIỆU ỨNG ÂM THANH (SFX)
    // ==========================================================================

    // 1. Tiếng Click / Chạm nút (Thanh thoát, êm ái)
    playClick() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.exponentialRampToValueAtTime(260, t + 0.04);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.05);
    }

    // 2. Tiếng học sinh mới vào phòng (Ding - Dong vui tươi)
    playJoin() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // Note 1: E5 (659Hz)
      this._playTone(659.25, 'triangle', t, 0.22, 0.4, 0.02);
      // Note 2: B5 (987Hz)
      this._playTone(987.77, 'sine', t + 0.12, 0.32, 0.45, 0.05);
    }

    // 3. Tiếng tích tắc đếm ngược đồng hồ (Woodblock tick)
    playTick() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const t = this.ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.025);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, t);
      filter.Q.setValueAtTime(3.0, t);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.03);
    }

    // 4. Tiếng cảnh báo gấp khi còn dưới 5 giây (Tích tắc kép dồn dập)
    playUrgentTick() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      this._playTone(1800, 'square', t, 0.03, 0.35, 0.001);
      this._playTone(2200, 'sine', t + 0.04, 0.04, 0.45, 0.001);
    }

    // 5. Tiếng còi hết giờ (Times Up Game Buzzer)
    playTimesUp() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // Âm thanh hợp âm nghịch (Dissonant Buzz)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(196, t); // G3
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(247, t); // B3

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.55);

      gain.gain.setValueAtTime(0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.65);
      osc2.stop(t + 0.65);
    }

    // 6. Tiếng máy tính chạy & biên dịch Python (Retro Tech Computing Blips)
    playPythonRun() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const notes = [659, 880, 1175, 987, 1318, 1046, 1568];
      const startT = this.ctx.currentTime;

      notes.forEach((freq, i) => {
        const noteT = startT + i * 0.055;
        this._playTone(freq, 'sine', noteT, 0.045, 0.28, 0.01);
      });

      // Tiếng chốt hoàn tất (Execution Ding)
      setTimeout(() => {
        if (!this.ctx || this.isMuted) return;
        this._playTone(1760, 'triangle', this.ctx.currentTime, 0.2, 0.4, 0.05);
      }, 420);
    }

    // 7. Tiếng trả lời Đúng / Hoàn hảo (Triumphant Major Arpeggio Fanfare)
    playCorrect() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // C5 -> E5 -> G5 -> C6 ngân vang lấp lánh
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq, idx) => {
        this._playTone(freq, 'triangle', t + idx * 0.07, 0.45 - idx * 0.05, 0.45, 0.08);
        this._playTone(freq * 2, 'sine', t + idx * 0.07, 0.25, 0.15, 0.02);
      });
    }

    // 8. Tiếng trả lời Sai / Báo Bug (Womp-womp / Slide Buzz)
    playWrong() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.45);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, t);
      filter.frequency.exponentialRampToValueAtTime(180, t + 0.45);

      gain.gain.setValueAtTime(0.48, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.52);
    }

    // 9. Tiếng Whoosh / Chuyển cảnh Bảng xếp hạng
    playWhoosh() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // Mô phỏng tiếng gió / tiếng vút bằng bộ lọc quét tần số
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(450, t + 0.18);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.35);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.35);
      filter.Q.setValueAtTime(2.5, t);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.4);
    }

    // 10. Tiếng Vinh Quang Tổng Kết Chung Cuộc (Grand Fanfare)
    playVictory() {
      if (this.isMuted) return;
      this.unlock();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // Nhịp kèn khải hoàn: G4 - C5 - E5 - G5!
      const notes = [
        { f: 392.00, d: 0.14, dt: 0.0 },
        { f: 523.25, d: 0.14, dt: 0.15 },
        { f: 659.25, d: 0.14, dt: 0.30 },
        { f: 783.99, d: 0.65, dt: 0.45 },
        { f: 659.25, d: 0.15, dt: 0.95 },
        { f: 783.99, d: 0.95, dt: 1.12 }
      ];

      notes.forEach((n) => {
        this._playTone(n.f, 'sawtooth', t + n.dt, n.d, 0.38, 0.08);
        this._playTone(n.f * 0.5, 'triangle', t + n.dt, n.d, 0.3, 0.05);
      });
    }

    // Hàm tiện ích phát 1 âm đơn lẻ với envelope sạch
    _playTone(freq, type, startTime, duration, peakGain = 0.3, release = 0.05) {
      if (!this.ctx || this.isMuted) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
        gain.gain.setValueAtTime(peakGain, startTime + Math.max(0.015, duration - release));
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.02);
      } catch (err) {
        // Safe guard against timing edge-cases
      }
    }

    // ==========================================================================
    // HỆ THỐNG NHẠC NỀN TỰ SINH (PROCEDURAL BGM SEQUENCER)
    // ==========================================================================

    startBGM(theme) {
      if (this.currentTheme === theme && this.bgmInterval) return;
      this.stopBGM();
      this.currentTheme = theme;
      this.bgmStep = 0;

      this.unlock();
      if (!this.ctx) return;

      this._runBGMSequencer();
    }

    stopBGM() {
      if (this.bgmInterval) {
        clearInterval(this.bgmInterval);
        this.bgmInterval = null;
      }
      this.currentTheme = null;
    }

    setQuestionTimeRemaining(sec) {
      this.remainingQuestionTime = sec;
    }

    _runBGMSequencer() {
      if (this.bgmInterval) {
        clearInterval(this.bgmInterval);
      }

      // Mỗi step = 1 nốt móc đơn (8th note)
      // Với tempo 120 BPM: 1 beat = 500ms, 1 8th note = 250ms
      const stepMs = 250;
      this.bgmInterval = setInterval(() => {
        if (!this.ctx || this.isMuted || !this.currentTheme) return;

        try {
          if (this.currentTheme === 'lobby') {
            this._tickLobbyBGM(this.bgmStep);
          } else if (this.currentTheme === 'question') {
            this._tickQuestionBGM(this.bgmStep);
          } else if (this.currentTheme === 'suspense') {
            this._tickSuspenseBGM(this.bgmStep);
          } else if (this.currentTheme === 'leaderboard') {
            this._tickLeaderboardBGM(this.bgmStep);
          }
        } catch (e) {
          // Bỏ qua lỗi trình duyệt nếu tab bị background
        }

        this.bgmStep = (this.bgmStep + 1) % 64;
      }, stepMs);
    }

    // 1. Nhạc nền Phòng chờ (Lobby Groove) - Vui nhộn, thân thiện, hứng khởi
    _tickLobbyBGM(step) {
      const t = this.ctx.currentTime;
      const bar = Math.floor((step % 32) / 8); // 4 hợp âm: C -> Am -> F -> G
      const beatInBar = step % 8;

      // Hợp âm gốc
      const roots = [
        { bass: 130.81, chord: [261.63, 329.63, 392.00, 493.88] }, // Cmaj7
        { bass: 110.00, chord: [220.00, 261.63, 329.63, 392.00] }, // Am7
        { bass: 87.31,  chord: [174.61, 220.00, 261.63, 349.23] }, // Fmaj7
        { bass: 98.00,  chord: [196.00, 246.94, 293.66, 392.00] }  // G7
      ];
      const cur = roots[bar];

      // Bass nhún nhảy (Staccato synth bass)
      if (beatInBar === 0 || beatInBar === 3 || beatInBar === 6) {
        this._playBGMTone(cur.bass, 'triangle', t, 0.16, 0.35, 1400);
      }

      // Hợp âm rải êm ái (Soft warm synth stabs ở nhịp 2, 4, 7)
      if (beatInBar === 2 || beatInBar === 5) {
        cur.chord.forEach((freq) => {
          this._playBGMTone(freq, 'sine', t, 0.18, 0.15, 2000);
        });
      }

      // Tiếng gõ nhịp nhẹ (Hi-hat click giữ nhịp trên mỗi nốt chẵn)
      if (beatInBar % 2 === 0) {
        this._playNoiseTick(t, 0.02, 0.08);
      }
    }

    // 2. Nhạc nền Câu hỏi (Question Countdown Tension) - Kiểu Kahoot gay cấn, tăng tốc
    _tickQuestionBGM(step) {
      const t = this.ctx.currentTime;
      const beatInBar = step % 8;
      const urgent = this.remainingQuestionTime <= 10;
      const critical = this.remainingQuestionTime <= 5;

      // Bassline dồn dập (Driving Bass A2 -> C3 -> D3 -> E3)
      const bassSeq = [110, 110, 130.81, 146.83, 164.81, 146.83, 130.81, 98];
      const bassNote = urgent ? bassSeq[beatInBar] * 1.5 : bassSeq[beatInBar];

      // Bass đánh liên tục từng nốt
      this._playBGMTone(bassNote, 'sawtooth', t, 0.12, urgent ? 0.38 : 0.28, urgent ? 900 : 650);

      // Tiếng tích tắc đồng hồ gõ nhịp liên tục
      if (critical) {
        // Dưới 5s: Tích tắc gấp đôi
        this.playUrgentTick();
      } else {
        this._playNoiseTick(t, 0.025, 0.14);
      }

      // Synth rải giai điệu đếm ngược (Marimba arpeggio)
      const arpNotes = [440, 523.25, 659.25, 880, 783.99, 659.25, 587.33, 523.25];
      if (beatInBar % 2 === 1) {
        const noteFreq = arpNotes[beatInBar] * (urgent ? 1.25 : 1);
        this._playBGMTone(noteFreq, 'sine', t, 0.14, 0.22, 1800);
      }
    }

    // 3. Nhạc Hồi Hộp Chờ Chạy Code (Suspense Drumroll)
    _tickSuspenseBGM(step) {
      const t = this.ctx.currentTime;
      // Nhịp tim dồn dập & gõ trống hồi hộp
      if (step % 2 === 0) {
        this._playBGMTone(65.4, 'sine', t, 0.15, 0.45, 300); // Thump kick
      }
      this._playNoiseTick(t, 0.03, 0.18);
    }

    // 4. Nhạc Bảng Xếp Hạng (Leaderboard Sparkle Groove)
    _tickLeaderboardBGM(step) {
      const t = this.ctx.currentTime;
      const beatInBar = step % 8;
      const brightChords = [523.25, 659.25, 783.99, 987.77, 1046.50];

      if (beatInBar === 0 || beatInBar === 4) {
        this._playBGMTone(130.81, 'triangle', t, 0.22, 0.32, 1200);
      }
      if (beatInBar === 1 || beatInBar === 3 || beatInBar === 5) {
        const f = brightChords[beatInBar % brightChords.length];
        this._playBGMTone(f, 'sine', t, 0.15, 0.22, 2200);
      }
    }

    // Tiếng nhạc nền qua bộ lọc Lowpass ấm áp
    _playBGMTone(freq, type, startTime, duration, peakGain = 0.2, filterFreq = 1200) {
      if (!this.ctx || this.isMuted) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
      } catch (e) {}
    }

    // Tiếng gõ nhịp trống nhẹ (Hi-hat noise synth)
    _playNoiseTick(startTime, duration = 0.02, gainVal = 0.1) {
      if (!this.ctx || this.isMuted) return;
      try {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6000, startTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(gainVal, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        noise.start(startTime);
        noise.stop(startTime + duration);
      } catch (e) {}
    }
  }

  // Khởi tạo Singleton toàn cục
  window.GameAudio = new GameAudioEngine();

})(window);
