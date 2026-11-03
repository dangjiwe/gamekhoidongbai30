// ============================================================================
// HOST.JS - ĐIỀU KHIỂN MÀN HÌNH GIÁO VIÊN (CÓ XÁC THỰC & PHÂN QUYỀN HOST)
// ============================================================================
const socket = io();

// Phần tử xác thực Giáo viên
const hostAuthScreen = document.getElementById('host-auth-screen');
const hostAppWrapper = document.getElementById('host-app-wrapper');
const hostLoginForm = document.getElementById('host-login-form');
const hostInputUsername = document.getElementById('host-input-username');
const hostInputPassword = document.getElementById('host-input-password');
const btnTogglePassword = document.getElementById('btn-toggle-password');
const hostLoginError = document.getElementById('host-login-error');
const headerTeacherName = document.getElementById('header-teacher-name');
const btnHostLogout = document.getElementById('btn-host-logout');

let hostToken = sessionStorage.getItem('bug_hunter_host_token') || '';

// Các màn hình chính
const screens = {
  LOBBY: document.getElementById('screen-lobby'),
  QUESTION: document.getElementById('screen-question'),
  REVIEW: document.getElementById('screen-review'),
  LEADERBOARD: document.getElementById('screen-leaderboard'),
  FINAL: document.getElementById('screen-final')
};

// Phần tử trên Header
const headerPlayerCount = document.getElementById('header-player-count');
const headerQuestionBadge = document.getElementById('header-question-badge');
const headerQCurrent = document.getElementById('header-q-current');
const headerQTotal = document.getElementById('header-q-total');
const btnHeaderReset = document.getElementById('btn-header-reset');

// Phần tử màn hình Lobby & Modal phóng to QR
const qrImage = document.getElementById('qr-image');
const qrCardTrigger = document.getElementById('qr-card-trigger');
const btnExpandQr = document.getElementById('btn-expand-qr');
const qrFullscreenModal = document.getElementById('qr-fullscreen-modal');
const qrFullscreenImage = document.getElementById('qr-fullscreen-image');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const modalPlayerCount = document.getElementById('modal-player-count');

const lobbyPlayerCount = document.getElementById('lobby-player-count');
const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
const btnStartGame = document.getElementById('btn-start-game');

// Phần tử màn hình Live Question & Awaiting Run
const liveQuestionBadge = document.getElementById('live-question-badge');
const liveQuestionTitle = document.getElementById('live-question-title');
const liveQuestionPrompt = document.getElementById('live-question-prompt');
const liveAnsweredCount = document.getElementById('live-answered-count');
const liveTotalPlayers = document.getElementById('live-total-players');
const liveTimerText = document.getElementById('live-timer-text');
const liveTimerBar = document.getElementById('live-timer-bar');
const liveCodeLines = document.getElementById('live-code-lines');
const liveAllAnsweredBadge = document.getElementById('live-all-answered-badge');
const btnEndQuestionEarly = document.getElementById('btn-end-question-early');
const btnRunProgram = document.getElementById('btn-run-program');

// Phần tử màn hình Review / Kết quả chạy thử Python
const reviewBadge = document.getElementById('review-badge');
const reviewTitle = document.getElementById('review-title');
const reviewTestedWindow = document.getElementById('review-tested-window');
const reviewTestedHeader = document.getElementById('review-tested-header');
const reviewTestedStatusTag = document.getElementById('review-tested-status-tag');
const reviewBuggyLineTag = document.getElementById('review-buggy-line-tag');
const reviewBuggyCode = document.getElementById('review-buggy-code');
const reviewErrorSummaryBar = document.getElementById('review-error-summary-bar');
const reviewTerminalBadge = document.getElementById('review-terminal-badge');
const reviewPythonOutput = document.getElementById('review-python-output');
const reviewFixedCodeSection = document.getElementById('review-fixed-code-section');
const reviewFixedLineTag = document.getElementById('review-fixed-line-tag');
const reviewFixedCode = document.getElementById('review-fixed-code');
const reviewExplanation = document.getElementById('review-explanation');
const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');

// Phần tử màn hình Leaderboard
const leaderboardList = document.getElementById('leaderboard-list');
const btnNextQuestion = document.getElementById('btn-next-question');
const btnNextQuestionText = document.getElementById('btn-next-question-text');

// Phần tử màn hình Final Stage
const finalPodiumList = document.getElementById('final-podium-list');
const btnPlayAgainKeep = document.getElementById('btn-play-again-keep');
const btnPlayAgainNew = document.getElementById('btn-play-again-new');

// Quản lý trạng thái và Âm thanh Host
let currentScreenKey = 'LOBBY';
let previousLobbyPlayerCount = 0;

const btnSoundToggle = document.getElementById('btn-sound-toggle');
const soundIcon = document.getElementById('sound-icon');
const soundLabel = document.getElementById('sound-label');

function updateSoundUI() {
  if (!soundIcon || !soundLabel || !window.GameAudio) return;
  if (window.GameAudio.isMuted) {
    soundIcon.textContent = '🔇';
    soundLabel.textContent = 'Nhạc: TẮT';
    if (btnSoundToggle) {
      btnSoundToggle.className = 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5';
    }
  } else {
    soundIcon.textContent = '🔊';
    soundLabel.textContent = 'Nhạc: BẬT';
    if (btnSoundToggle) {
      btnSoundToggle.className = 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/40 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5';
    }
  }
}

if (btnSoundToggle) {
  updateSoundUI();
  btnSoundToggle.addEventListener('click', () => {
    if (!window.GameAudio) return;
    const isMuted = window.GameAudio.toggleMute();
    updateSoundUI();
    if (!isMuted) {
      window.GameAudio.unlock();
      if (currentScreenKey === 'LOBBY') window.GameAudio.startBGM('lobby');
      else if (currentScreenKey === 'QUESTION') window.GameAudio.startBGM('question');
      else if (currentScreenKey === 'AWAITING_RUN') window.GameAudio.startBGM('suspense');
      else if (currentScreenKey === 'LEADERBOARD' || currentScreenKey === 'FINAL') window.GameAudio.startBGM('leaderboard');
    }
  });
}

// Chuyển đổi qua lại giữa các màn hình
function showScreen(stageName) {
  currentScreenKey = stageName;
  const mappedStage = stageName === 'AWAITING_RUN' ? 'QUESTION' : stageName;
  Object.entries(screens).forEach(([key, el]) => {
    if (key === mappedStage) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  if (stageName !== 'LOBBY') {
    closeQrFullscreenModal();
  }

  if (
    stageName === 'QUESTION' ||
    stageName === 'AWAITING_RUN' ||
    stageName === 'REVIEW' ||
    stageName === 'LEADERBOARD'
  ) {
    headerQuestionBadge.classList.remove('hidden');
  } else {
    headerQuestionBadge.classList.add('hidden');
  }

  // Quản lý phát nhạc nền theo từng phân đoạn trò chơi
  if (window.GameAudio) {
    if (stageName === 'LOBBY') {
      window.GameAudio.startBGM('lobby');
    } else if (stageName === 'QUESTION') {
      window.GameAudio.startBGM('question');
    } else if (stageName === 'AWAITING_RUN') {
      window.GameAudio.startBGM('suspense');
    } else if (stageName === 'REVIEW') {
      window.GameAudio.stopBGM();
    } else if (stageName === 'LEADERBOARD') {
      window.GameAudio.playWhoosh();
      window.GameAudio.startBGM('leaderboard');
    } else if (stageName === 'FINAL') {
      window.GameAudio.playVictory();
      window.GameAudio.startBGM('leaderboard');
    }
  }
}

// Escape HTML an toàn
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Định dạng mã Python có màu sắc trực quan
function highlightPythonLine(rawLine) {
  const tokens = rawLine.split(/(".*?")/g);
  return tokens
    .map((token) => {
      if (token.startsWith('"') && token.endsWith('"')) {
        return `<span class="py-str">${escapeHtml(token)}</span>`;
      }
      let safe = escapeHtml(token);
      safe = safe.replace(/\b(if|else|elif|for|in|while|def|return)\b/g, '<span class="py-kw">$1</span>');
      safe = safe.replace(/\b(int|input|print|range|len|str|float)\b/g, '<span class="py-fn">$1</span>');
      safe = safe.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="py-num">$1</span>');
      return safe;
    })
    .join('');
}

// Render khối code Python với số dòng và tuỳ chọn highlight dòng lỗi/sửa
function renderCodeBlock(container, lines, highlightLine = null, mode = null) {
  container.innerHTML = lines
    .map((lineText, idx) => {
      const lineNumber = idx + 1;
      let extraClass = '';
      let badgeIcon = '';

      if (highlightLine === lineNumber) {
        if (mode === 'buggy') {
          extraClass = 'line-buggy';
          badgeIcon = '<span class="code-line-badge badge-buggy">🐛 Lỗi</span>';
        } else if (mode === 'fixed') {
          extraClass = 'line-fixed';
          badgeIcon = '<span class="code-line-badge badge-fixed">✅ Đã sửa</span>';
        } else if (mode === 'correct-program') {
          extraClass = 'line-fixed';
          badgeIcon = '<span class="code-line-badge badge-fixed">✅ Chạy đúng</span>';
        }
      }

      return `
        <div class="code-line ${extraClass}">
          <span class="code-line-num">${lineNumber}</span>
          <span class="code-line-content">${highlightPythonLine(lineText)}</span>
          ${badgeIcon}
        </div>
      `;
    })
    .join('');
}

// Render cửa sổ Terminal kết quả chạy Python
function renderPythonTerminalOutput(container, outputLines = [], isProgramCorrect = false) {
  if (!container) return;
  container.innerHTML = outputLines
    .map((line) => {
      const safe = escapeHtml(line);
      if (line.startsWith('$ ')) {
        return `<div class="term-cmd">${safe}</div>`;
      }
      if (isProgramCorrect) {
        if (line.includes('Process finished') || line.includes('Tổng từ')) {
          return `<div class="term-ok">${safe}</div>`;
        }
        return `<div class="term-std">${safe}</div>`;
      } else {
        if (
          line.includes('Error') ||
          line.includes('Traceback') ||
          line.includes('File ') ||
          line.includes('^') ||
          line.includes('~') ||
          line.includes('[!]') ||
          line.includes('SAI')
        ) {
          return `<div class="term-err">${safe}</div>`;
        }
        return `<div class="term-std">${safe}</div>`;
      }
    })
    .join('');
}

// Tải mã QR (Tự động nhận diện tên miền Hosting hoặc IP LAN khi chạy localhost)
async function loadNetworkInfo() {
  try {
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const query = !isLocalhost ? `?origin=${encodeURIComponent(window.location.origin)}` : '';

    const res = await fetch(`/api/network-info${query}`);
    const data = await res.json();

    qrImage.src = data.qrCodeDataUrl;
    if (qrFullscreenImage) {
      qrFullscreenImage.src = data.qrCodeDataUrl;
    }
  } catch (err) {
    console.error('Không thể tải mã QR:', err);
  }
}

// Mở / Đóng Modal phóng to mã QR toàn màn hình
function openQrFullscreenModal() {
  if (qrFullscreenModal) {
    qrFullscreenModal.classList.remove('hidden');
  }
}

function closeQrFullscreenModal() {
  if (qrFullscreenModal) {
    qrFullscreenModal.classList.add('hidden');
  }
}

if (btnExpandQr) {
  btnExpandQr.addEventListener('click', openQrFullscreenModal);
}
if (qrCardTrigger) {
  qrCardTrigger.addEventListener('click', openQrFullscreenModal);
}
if (btnCloseQrModal) {
  btnCloseQrModal.addEventListener('click', closeQrFullscreenModal);
}
if (qrFullscreenModal) {
  qrFullscreenModal.addEventListener('click', (e) => {
    if (e.target === qrFullscreenModal) {
      closeQrFullscreenModal();
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeQrFullscreenModal();
  }
});

// Cập nhật danh sách học sinh trong phòng chờ
function renderLobbyPlayers(players) {
  const count = players.length;
  headerPlayerCount.textContent = count;
  lobbyPlayerCount.textContent = count;
  if (modalPlayerCount) {
    modalPlayerCount.textContent = count;
  }

  // Phát tiếng chuông Ding-Dong vui tươi khi có học sinh mới tham gia phòng
  if (count > previousLobbyPlayerCount && currentScreenKey === 'LOBBY') {
    if (window.GameAudio) window.GameAudio.playJoin();
  }
  previousLobbyPlayerCount = count;

  if (count === 0) {
    lobbyPlayersGrid.innerHTML = `
      <div class="w-full h-44 flex flex-col items-center justify-center text-slate-400 text-center">
        <div class="text-4xl mb-2 animate-bounce">📱</div>
        <p class="font-semibold text-slate-300">Đang chờ học sinh quét mã QR tham gia...</p>
        <p class="text-xs text-slate-500 mt-1">Tên và biểu tượng của học sinh sẽ xuất hiện ngay tại đây</p>
      </div>
    `;
    return;
  }

  lobbyPlayersGrid.innerHTML = players
    .map(
      (p) => `
      <div class="animate-pop inline-flex items-center gap-2 bg-slate-800/95 border ${
        p.connected ? 'border-emerald-500/40' : 'border-slate-700 opacity-60'
      } px-3.5 py-2 rounded-2xl shadow">
        <span class="text-xl">${escapeHtml(p.avatar)}</span>
        <span class="font-bold text-sm text-white">${escapeHtml(p.name)}</span>
      </div>
    `
    )
    .join('');
}

// Cập nhật biểu đồ thanh và phần trăm realtime
function updateLiveStats(stats) {
  if (!stats) return;
  const { counts = [0, 0, 0, 0], percentages = [0, 0, 0, 0], totalAnswered = 0, totalPlayers = 0 } = stats;

  liveAnsweredCount.textContent = totalAnswered;
  liveTotalPlayers.textContent = totalPlayers;

  for (let i = 0; i < 4; i++) {
    const labelEl = document.getElementById(`stat-label-${i}`);
    const barEl = document.getElementById(`stat-bar-${i}`);
    if (labelEl) {
      labelEl.textContent = `${counts[i]} HS (${percentages[i]}%)`;
    }
    if (barEl) {
      barEl.style.width = `${percentages[i]}%`;
    }
  }

  if (totalPlayers > 0 && totalAnswered >= totalPlayers) {
    liveAllAnsweredBadge.classList.remove('hidden');
  } else {
    liveAllAnsweredBadge.classList.add('hidden');
  }
}

// Hiển thị màn hình Câu hỏi trực tiếp (45 giây)
function renderLiveQuestion(question, remainingTime, stats, isAwaitingRun = false) {
  showScreen('QUESTION');

  headerQCurrent.textContent = question.index + 1;
  headerQTotal.textContent = question.totalQuestions;

  liveQuestionBadge.textContent = question.badge;
  liveQuestionTitle.textContent = question.title;
  liveQuestionPrompt.textContent = question.prompt;

  renderCodeBlock(liveCodeLines, question.buggyCode, null, null);

  for (let i = 0; i < 4; i++) {
    const optEl = document.getElementById(`live-opt-${i}`);
    if (optEl) optEl.textContent = question.options[i];
  }

  updateLiveStats(stats);

  if (isAwaitingRun) {
    setAwaitingRunUI();
  } else {
    btnEndQuestionEarly.classList.remove('hidden');
    btnRunProgram.classList.add('hidden');
    updateTimerUI(remainingTime, question.timeLimit);
  }
}

// Chuyển giao diện sang trạng thái hết giờ -> Hiện nút "▶️ CHẠY THỬ CHƯƠNG TRÌNH (PYTHON)"
function setAwaitingRunUI() {
  liveTimerText.textContent = '0s';
  liveTimerText.classList.add('text-rose-400');
  liveTimerBar.style.width = '0%';

  if (window.GameAudio) {
    window.GameAudio.playTimesUp();
    window.GameAudio.startBGM('suspense');
  }

  btnEndQuestionEarly.classList.add('hidden');
  btnRunProgram.classList.remove('hidden');
}

function updateTimerUI(remainingTime, timeLimit) {
  liveTimerText.textContent = `${remainingTime}s`;
  const pct = timeLimit > 0 ? Math.max(0, Math.min(100, (remainingTime / timeLimit) * 100)) : 0;
  liveTimerBar.style.width = `${pct}%`;

  if (window.GameAudio) {
    window.GameAudio.setQuestionTimeRemaining(remainingTime);
    if (remainingTime > 0 && remainingTime <= 5) {
      window.GameAudio.playUrgentTick();
    }
  }

  if (remainingTime <= 5) {
    liveTimerText.classList.add('text-rose-400', 'animate-pulse');
  } else {
    liveTimerText.classList.remove('text-rose-400', 'animate-pulse');
  }
}

// Hiển thị màn hình Kết quả chạy thử Python & Giải thích (Review/Correction)
function renderReviewScreen(question, stats) {
  showScreen('REVIEW');

  if (window.GameAudio) {
    window.GameAudio.stopBGM();
    setTimeout(() => {
      if (question.isProgramCorrect) {
        window.GameAudio.playCorrect();
      } else {
        window.GameAudio.playWrong();
      }
    }, 280);
  }

  headerQCurrent.textContent = question.index + 1;
  headerQTotal.textContent = question.totalQuestions;

  reviewBadge.textContent = question.badge;
  reviewTitle.textContent = question.title;

  if (question.isProgramCorrect) {
    reviewTestedWindow.className = 'lg:col-span-6 code-window border-emerald-500/60 flex flex-col justify-between';
    reviewTestedHeader.className = 'code-window-header bg-emerald-950/60 border-b border-emerald-500/30';
    reviewTestedStatusTag.className = 'px-2.5 py-0.5 rounded-md text-xs font-black bg-emerald-500 text-slate-950';
    reviewTestedStatusTag.textContent = '✅ CHƯƠNG TRÌNH ĐÚNG';
    reviewBuggyLineTag.className = 'text-xs text-emerald-300 font-mono-code';
    reviewBuggyLineTag.textContent = 'Không có lỗi cú pháp hay logic';

    renderCodeBlock(reviewBuggyCode, question.buggyCode, question.fixedLine, 'correct-program');

    reviewErrorSummaryBar.className =
      'bg-emerald-950/50 border-t border-emerald-500/30 px-4 py-2.5 text-xs font-mono-code font-bold text-emerald-300';
    reviewErrorSummaryBar.textContent = `✅ ${question.errorSummary}`;

    reviewTerminalBadge.className =
      'text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
    reviewTerminalBadge.textContent = 'Exit Code: 0 (Thành công)';

    reviewFixedCodeSection.classList.add('hidden');
  } else {
    reviewTestedWindow.className = 'lg:col-span-6 code-window border-rose-500/60 flex flex-col justify-between';
    reviewTestedHeader.className = 'code-window-header bg-rose-950/60 border-b border-rose-500/30';
    reviewTestedStatusTag.className = 'px-2.5 py-0.5 rounded-md text-xs font-black bg-rose-500 text-white';
    reviewTestedStatusTag.textContent = `❌ BÁO LỖI (${question.type})`;
    reviewBuggyLineTag.className = 'text-xs text-rose-300 font-mono-code';
    reviewBuggyLineTag.textContent = `Tô đỏ lỗi tại dòng ${question.buggyLine}`;

    renderCodeBlock(reviewBuggyCode, question.buggyCode, question.buggyLine, 'buggy');

    reviewErrorSummaryBar.className =
      'bg-rose-950/60 border-t border-rose-500/40 px-4 py-2.5 text-xs font-mono-code font-bold text-rose-300';
    reviewErrorSummaryBar.textContent = `🚨 ${question.errorSummary}`;

    reviewTerminalBadge.className =
      'text-[11px] font-bold px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-400/30';
    reviewTerminalBadge.textContent = `Phát hiện lỗi: ${question.type}`;

    reviewFixedCodeSection.classList.remove('hidden');
    reviewFixedLineTag.textContent = `Đã sửa đúng tại dòng ${question.fixedLine}`;
    renderCodeBlock(reviewFixedCode, question.fixedCode, question.fixedLine, 'fixed');
  }

  renderPythonTerminalOutput(reviewPythonOutput, question.pythonOutput || [], question.isProgramCorrect);

  reviewExplanation.textContent = question.explanation;

  const counts = (stats && stats.counts) || [0, 0, 0, 0];
  const percentages = (stats && stats.percentages) || [0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    const cardEl = document.getElementById(`review-card-${i}`);
    const optEl = document.getElementById(`review-opt-${i}`);
    const countEl = document.getElementById(`review-count-${i}`);

    if (optEl) optEl.textContent = question.options[i];
    if (countEl) countEl.textContent = `${counts[i]} HS (${percentages[i]}%)`;

    if (cardEl) {
      cardEl.classList.remove('review-correct', 'review-wrong');
      if (i === question.correctIndex) {
        cardEl.classList.add('review-correct');
        if (countEl) {
          countEl.innerHTML = `✅ ĐÁP ÁN ĐÚNG • ${counts[i]} HS (${percentages[i]}%)`;
        }
      } else {
        cardEl.classList.add('review-wrong');
      }
    }
  }
}

// Hiển thị màn hình Bảng xếp hạng Top 5
function renderLeaderboardScreen({ top5 = [], currentQuestionIndex = 0, totalQuestions = 5, isLastQuestion = false }) {
  showScreen('LEADERBOARD');

  headerQCurrent.textContent = currentQuestionIndex + 1;
  headerQTotal.textContent = totalQuestions;

  btnNextQuestionText.textContent = isLastQuestion ? '🎯 Tổng kết bài học' : 'Câu hỏi tiếp theo';

  if (top5.length === 0) {
    leaderboardList.innerHTML = `
      <div class="text-center py-12 text-slate-400">
        Chưa có dữ liệu điểm của học sinh trong lượt này.
      </div>
    `;
    return;
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  const rowStyles = [
    'bg-gradient-to-r from-amber-500/25 to-yellow-500/10 border-amber-400/50',
    'bg-gradient-to-r from-slate-300/20 to-slate-400/10 border-slate-300/40',
    'bg-gradient-to-r from-orange-500/20 to-amber-600/10 border-orange-400/40',
    'bg-slate-800/80 border-slate-700',
    'bg-slate-800/80 border-slate-700'
  ];

  leaderboardList.innerHTML = top5
    .map(
      (player, idx) => `
      <div class="animate-pop flex items-center justify-between p-4 rounded-2xl border ${rowStyles[idx] || rowStyles[4]}">
        <div class="flex items-center gap-4">
          <span class="text-2xl md:text-3xl w-10 text-center font-black">${medals[idx] || idx + 1}</span>
          <span class="text-3xl">${escapeHtml(player.avatar)}</span>
          <div>
            <div class="text-lg md:text-xl font-extrabold text-white">${escapeHtml(player.name)}</div>
            <div class="text-xs text-slate-300">
              Trả lời đúng: <strong>${player.correctCount}/${player.totalQuestions}</strong> câu
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="text-xl md:text-2xl font-black text-amber-300 font-mono-code">
            ${player.score} đ
          </div>
          ${
            player.lastPoints > 0
              ? `<span class="inline-block text-xs font-extrabold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md">+${player.lastPoints} đ</span>`
              : `<span class="inline-block text-xs text-slate-400">+0 đ</span>`
          }
        </div>
      </div>
    `
    )
    .join('');
}

// Hiển thị màn hình Tổng kết bài học (Final Stage)
function renderFinalStage({ top5 = [] }) {
  showScreen('FINAL');

  if (top5.length === 0) {
    finalPodiumList.innerHTML = `
      <div class="text-xs text-slate-400 py-2">
        Hoàn thành tất cả câu hỏi khởi động Bài 30!
      </div>
    `;
    return;
  }

  const medals = ['🥇 Hạng 1', '🥈 Hạng 2', '🥉 Hạng 3'];
  finalPodiumList.innerHTML = top5
    .slice(0, 3)
    .map(
      (p, idx) => `
      <div class="flex items-center justify-between bg-slate-900/80 border border-slate-700/80 px-3.5 py-2 rounded-xl">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-extrabold text-amber-300">${medals[idx]}</span>
          <span class="text-xl">${escapeHtml(p.avatar)}</span>
          <span class="font-bold text-white text-sm">${escapeHtml(p.name)}</span>
        </div>
        <div class="text-sm font-black text-emerald-400 font-mono-code">
          ${p.score} đ (${p.correctCount}/${p.totalQuestions} câu)
        </div>
      </div>
    `
    )
    .join('');
}

// ============================================================================
// SỰ KIỆN NÚT BẤM ĐIỀU KHIỂN CỦA GIÁO VIÊN
// ============================================================================
btnStartGame.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:startGame');
});

btnEndQuestionEarly.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:endQuestionEarly');
});

btnRunProgram.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playPythonRun();
  socket.emit('host:runProgram');
});

btnShowLeaderboard.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:showLeaderboard');
});

btnNextQuestion.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:nextQuestion');
});

btnPlayAgainKeep.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:resetGame', { keepPlayers: true });
});

btnPlayAgainNew.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  socket.emit('host:resetGame', { keepPlayers: false });
});

btnHeaderReset.addEventListener('click', () => {
  if (window.GameAudio) window.GameAudio.playClick();
  if (confirm('Quay về màn hình Phòng chờ (giữ danh sách học sinh hiện tại)?')) {
    socket.emit('host:resetGame', { keepPlayers: true });
  }
});

// ============================================================================
// XỬ LÝ ĐĂNG NHẬP, XÁC THỰC & ĐĂNG XUẤT QUYỀN GIÁO VIÊN
// ============================================================================
function unlockHostDashboard(user) {
  if (hostAuthScreen) hostAuthScreen.classList.add('hidden');
  if (hostAppWrapper) hostAppWrapper.classList.remove('hidden');
  if (headerTeacherName && user && user.displayName) {
    headerTeacherName.textContent = user.displayName;
  }
  loadNetworkInfo();
  socket.emit('host:join', { token: hostToken });

  if (window.GameAudio) {
    window.GameAudio.unlock();
    if (currentScreenKey === 'LOBBY') {
      window.GameAudio.startBGM('lobby');
    }
  }
}

function lockHostDashboard(errorMessage = '') {
  closeQrFullscreenModal();
  if (hostAppWrapper) hostAppWrapper.classList.add('hidden');
  if (hostAuthScreen) hostAuthScreen.classList.remove('hidden');

  if (errorMessage && hostLoginError) {
    hostLoginError.textContent = errorMessage;
    hostLoginError.classList.remove('hidden');
  } else if (hostLoginError) {
    hostLoginError.classList.add('hidden');
  }
}

async function verifySavedHostSession() {
  if (!hostToken) {
    lockHostDashboard();
    return;
  }

  try {
    const res = await fetch('/api/host/verify', {
      headers: {
        Authorization: `Bearer ${hostToken}`
      }
    });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      unlockHostDashboard(data.user);
    } else {
      sessionStorage.removeItem('bug_hunter_host_token');
      hostToken = '';
      lockHostDashboard();
    }
  } catch {
    lockHostDashboard();
  }
}

if (btnTogglePassword && hostInputPassword) {
  btnTogglePassword.addEventListener('click', () => {
    const isPassword = hostInputPassword.type === 'password';
    hostInputPassword.type = isPassword ? 'text' : 'password';
    btnTogglePassword.textContent = isPassword ? '🙈' : '👁️';
  });
}

if (hostLoginForm) {
  hostLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = hostInputUsername.value.trim();
    const password = hostInputPassword.value.trim();

    if (!username || !password) {
      lockHostDashboard('Vui lòng nhập đầy đủ tài khoản và mật khẩu!');
      return;
    }

    try {
      const res = await fetch('/api/host/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        lockHostDashboard(data.message || 'Sai tài khoản hoặc mật khẩu Giáo viên!');
        return;
      }

      hostToken = data.token;
      sessionStorage.setItem('bug_hunter_host_token', hostToken);
      hostInputPassword.value = '';
      if (hostLoginError) hostLoginError.classList.add('hidden');

      unlockHostDashboard(data.user);
    } catch {
      lockHostDashboard('Không thể kết nối tới máy chủ để đăng nhập.');
    }
  });
}

if (btnHostLogout) {
  btnHostLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/host/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hostToken}`
        },
        body: JSON.stringify({ token: hostToken })
      });
    } catch {
      // Bỏ qua lỗi mạng khi đăng xuất
    }
    sessionStorage.removeItem('bug_hunter_host_token');
    hostToken = '';
    lockHostDashboard();
  });
}

// ============================================================================
// LẮNG NGHE SỰ KIỆN SOCKET.IO TỪ SERVER
// ============================================================================
socket.on('connect', () => {
  if (hostToken) {
    socket.emit('host:join', { token: hostToken });
  }
});

socket.on('host:unauthorized', ({ message } = {}) => {
  sessionStorage.removeItem('bug_hunter_host_token');
  hostToken = '';
  lockHostDashboard(message || 'Phiên đăng nhập Giáo viên đã hết hạn. Vui lòng đăng nhập lại!');
});

socket.on('host:syncState', (data) => {
  renderLobbyPlayers(data.players || []);

  if (data.stage === 'LOBBY') {
    showScreen('LOBBY');
  } else if (data.stage === 'QUESTION' && data.question) {
    renderLiveQuestion(data.question, data.remainingTime, data.stats, false);
  } else if (data.stage === 'AWAITING_RUN' && data.question) {
    renderLiveQuestion(data.question, 0, data.stats, true);
  } else if (data.stage === 'REVIEW' && data.question) {
    renderReviewScreen(data.question, data.stats);
  } else if (data.stage === 'LEADERBOARD') {
    renderLeaderboardScreen(data);
  } else if (data.stage === 'FINAL') {
    renderFinalStage(data);
  }
});

socket.on('host:playersUpdated', ({ players, stats }) => {
  renderLobbyPlayers(players || []);
  if (stats) updateLiveStats(stats);
});

socket.on('game:questionStart', ({ question, remainingTime, stats }) => {
  renderLiveQuestion(question, remainingTime, stats, false);
});

socket.on('game:timerTick', ({ remainingTime, timeLimit }) => {
  updateTimerUI(remainingTime, timeLimit);
});

socket.on('host:answerStats', (stats) => {
  updateLiveStats(stats);
});

socket.on('game:awaitingRun', ({ stats }) => {
  if (stats) updateLiveStats(stats);
  setAwaitingRunUI();
});

socket.on('game:questionReview', ({ question, stats }) => {
  renderReviewScreen(question, stats);
});

socket.on('game:leaderboard', (data) => {
  renderLeaderboardScreen(data);
});

socket.on('game:finalStage', (data) => {
  renderFinalStage(data);
});

socket.on('game:reset', ({ players }) => {
  renderLobbyPlayers(players || []);
  showScreen('LOBBY');
});

socket.on('host:questionsUpdated', ({ totalQuestions }) => {
  if (headerQTotal && totalQuestions) {
    headerQTotal.textContent = totalQuestions;
  }
});

// ============================================================================
// TRÌNH QUẢN LÝ & CHỈNH SỬA CÂU HỎI, THỜI GIAN, ĐIỂM SỐ (QUESTION EDITOR)
// ============================================================================
const btnOpenQuestionEditor = document.getElementById('btn-open-question-editor');
const questionEditorModal = document.getElementById('question-editor-modal');
const btnCloseQuestionEditor = document.getElementById('btn-close-question-editor');
const btnResetDefaultQuestions = document.getElementById('btn-reset-default-questions');

const bulkTimeLimit = document.getElementById('bulk-time-limit');
const bulkMaxPoints = document.getElementById('bulk-max-points');
const bulkPenaltySec = document.getElementById('bulk-penalty-sec');
const btnApplyBulkSettings = document.getElementById('btn-apply-bulk-settings');

const qeTabsList = document.getElementById('qe-tabs-list');
const btnAddNewQuestion = document.getElementById('btn-add-new-question');
const btnDeleteCurrentQuestion = document.getElementById('btn-delete-current-question');
const btnSaveAllQuestions = document.getElementById('btn-save-all-questions');
const qeStatusMsg = document.getElementById('qe-status-msg');

// Các ô nhập liệu của câu hỏi đang chọn
const qeTitle = document.getElementById('qe-title');
const qePrompt = document.getElementById('qe-prompt');
const qeTimeLimit = document.getElementById('qe-time-limit');
const qeMaxPoints = document.getElementById('qe-max-points');
const qePenalty = document.getElementById('qe-penalty');
const qeIsCorrect = document.getElementById('qe-is-correct');
const qeType = document.getElementById('qe-type');
const qeBuggyCode = document.getElementById('qe-buggy-code');
const qeBuggyLine = document.getElementById('qe-buggy-line');
const qePythonOutput = document.getElementById('qe-python-output');
const qeFixedCode = document.getElementById('qe-fixed-code');
const qeFixedLine = document.getElementById('qe-fixed-line');
const qeErrorSummary = document.getElementById('qe-error-summary');
const qeExplanation = document.getElementById('qe-explanation');
const qeCorrectIndex = document.getElementById('qe-correct-index');
const qeOpt0 = document.getElementById('qe-opt-0');
const qeOpt1 = document.getElementById('qe-opt-1');
const qeOpt2 = document.getElementById('qe-opt-2');
const qeOpt3 = document.getElementById('qe-opt-3');

let editableQuestions = [];
let selectedQuestionIdx = 0;

function showQeStatus(msg, isError = false) {
  if (!qeStatusMsg) return;
  qeStatusMsg.textContent = msg;
  qeStatusMsg.className = isError
    ? 'text-xs font-extrabold text-rose-400'
    : 'text-xs font-extrabold text-emerald-400';
}

// Lưu dữ liệu từ các ô input hiện tại vào câu hỏi đang chọn trong bộ nhớ tạm
function syncFormToCurrentQuestion() {
  const q = editableQuestions[selectedQuestionIdx];
  if (!q) return;

  q.title = qeTitle.value.trim();
  q.prompt = qePrompt.value.trim();
  q.timeLimit = Math.max(5, Number(qeTimeLimit.value) || 45);
  q.maxPoints = Math.max(100, Number(qeMaxPoints.value) || 1000);
  q.penaltyPerSecond = Math.max(0, qePenalty.value !== '' ? Number(qePenalty.value) : 10);
  q.isProgramCorrect = qeIsCorrect.value === 'true';
  q.type = qeType.value;
  q.buggyCode = qeBuggyCode.value.split(/\r?\n/);
  q.buggyLine = q.isProgramCorrect ? null : Math.max(1, Number(qeBuggyLine.value) || 1);
  q.pythonOutput = qePythonOutput.value.split(/\r?\n/);
  q.fixedCode = qeFixedCode.value.split(/\r?\n/);
  q.fixedLine = Math.max(1, Number(qeFixedLine.value) || 1);
  q.errorSummary = qeErrorSummary.value.trim();
  q.explanation = qeExplanation.value.trim();
  q.correctIndex = Number(qeCorrectIndex.value) || 0;
  q.options = [
    qeOpt0.value.trim(),
    qeOpt1.value.trim(),
    qeOpt2.value.trim(),
    qeOpt3.value.trim()
  ];
}

// Đổ dữ liệu câu hỏi đang chọn lên form
function loadCurrentQuestionToForm() {
  const q = editableQuestions[selectedQuestionIdx];
  if (!q) return;

  qeTitle.value = q.title || '';
  qePrompt.value = q.prompt || '';
  qeTimeLimit.value = q.timeLimit || 45;
  qeMaxPoints.value = q.maxPoints || 1000;
  qePenalty.value = q.penaltyPerSecond !== undefined ? q.penaltyPerSecond : 10;
  qeIsCorrect.value = q.isProgramCorrect ? 'true' : 'false';
  qeType.value = q.type || (q.isProgramCorrect ? 'CorrectProgram' : 'SyntaxError');
  qeBuggyCode.value = Array.isArray(q.buggyCode) ? q.buggyCode.join('\n') : '';
  qeBuggyLine.value = q.buggyLine || 1;
  qeBuggyLine.disabled = Boolean(q.isProgramCorrect);
  qePythonOutput.value = Array.isArray(q.pythonOutput) ? q.pythonOutput.join('\n') : '';
  qeFixedCode.value = Array.isArray(q.fixedCode) ? q.fixedCode.join('\n') : '';
  qeFixedLine.value = q.fixedLine || 1;
  qeErrorSummary.value = q.errorSummary || '';
  qeExplanation.value = q.explanation || '';
  qeCorrectIndex.value = String(q.correctIndex || 0);

  const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
  qeOpt0.value = opts[0] || '';
  qeOpt1.value = opts[1] || '';
  qeOpt2.value = opts[2] || '';
  qeOpt3.value = opts[3] || '';
}

function renderQuestionEditorTabs() {
  if (!qeTabsList) return;
  qeTabsList.innerHTML = editableQuestions
    .map((q, idx) => {
      const isSelected = idx === selectedQuestionIdx;
      const badgeColor = q.isProgramCorrect ? 'text-emerald-400' : 'text-rose-400';
      return `
        <button
          type="button"
          data-qidx="${idx}"
          class="qe-tab-btn w-full text-left px-3 py-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
            isSelected
              ? 'bg-amber-500/20 border-amber-400 text-white font-black'
              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/70 font-semibold'
          }"
        >
          <div class="truncate">
            <div class="text-xs truncate">${escapeHtml(q.title || `Câu ${idx + 1}`)}</div>
            <div class="text-[10px] ${badgeColor}">
              ${q.isProgramCorrect ? '✅ Code Đúng' : `❌ ${escapeHtml(q.type)}`} • ${q.timeLimit}s • ${q.maxPoints || 1000}đ
            </div>
          </div>
          <span class="text-xs opacity-70">#${idx + 1}</span>
        </button>
      `;
    })
    .join('');

  qeTabsList.querySelectorAll('.qe-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncFormToCurrentQuestion();
      selectedQuestionIdx = Number(btn.dataset.qidx);
      renderQuestionEditorTabs();
      loadCurrentQuestionToForm();
    });
  });
}

async function openQuestionEditorModal() {
  showQeStatus('');
  try {
    const res = await fetch('/api/host/questions', {
      headers: { Authorization: `Bearer ${hostToken}` }
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.message || 'Không thể tải danh sách câu hỏi.');
      return;
    }

    editableQuestions = data.questions || [];
    selectedQuestionIdx = 0;

    if (editableQuestions.length > 0) {
      bulkTimeLimit.value = editableQuestions[0].timeLimit || 45;
      bulkMaxPoints.value = editableQuestions[0].maxPoints || 1000;
      bulkPenaltySec.value =
        editableQuestions[0].penaltyPerSecond !== undefined
          ? editableQuestions[0].penaltyPerSecond
          : 10;
    }

    renderQuestionEditorTabs();
    loadCurrentQuestionToForm();
    questionEditorModal.classList.remove('hidden');
  } catch {
    alert('Lỗi kết nối máy chủ khi tải câu hỏi.');
  }
}

function closeQuestionEditorModal() {
  if (questionEditorModal) {
    questionEditorModal.classList.add('hidden');
  }
}

if (btnOpenQuestionEditor) {
  btnOpenQuestionEditor.addEventListener('click', openQuestionEditorModal);
}
if (btnCloseQuestionEditor) {
  btnCloseQuestionEditor.addEventListener('click', closeQuestionEditorModal);
}
if (qeIsCorrect) {
  qeIsCorrect.addEventListener('change', () => {
    const isCorrectProg = qeIsCorrect.value === 'true';
    qeBuggyLine.disabled = isCorrectProg;
    if (isCorrectProg) {
      qeType.value = 'CorrectProgram';
    } else if (qeType.value === 'CorrectProgram') {
      qeType.value = 'SyntaxError';
    }
  });
}

// Áp dụng nhanh Thời gian, Điểm tối đa & Điểm trừ mỗi giây cho toàn bộ câu hỏi
if (btnApplyBulkSettings) {
  btnApplyBulkSettings.addEventListener('click', () => {
    syncFormToCurrentQuestion();
    const tLimit = Math.max(5, Number(bulkTimeLimit.value) || 45);
    const mPoints = Math.max(100, Number(bulkMaxPoints.value) || 1000);
    const pSec = Math.max(0, bulkPenaltySec.value !== '' ? Number(bulkPenaltySec.value) : 10);

    editableQuestions.forEach((q) => {
      q.timeLimit = tLimit;
      q.maxPoints = mPoints;
      q.penaltyPerSecond = pSec;
    });

    loadCurrentQuestionToForm();
    renderQuestionEditorTabs();
    showQeStatus(`⚡ Đã áp dụng ${tLimit}s, ${mPoints} điểm (-${pSec}đ/giây) cho tất cả ${editableQuestions.length} câu! Nhấn "Lưu tất cả thay đổi" để hoàn tất.`);
  });
}

// Thêm câu hỏi mới
if (btnAddNewQuestion) {
  btnAddNewQuestion.addEventListener('click', () => {
    syncFormToCurrentQuestion();
    const newIndex = editableQuestions.length + 1;
    editableQuestions.push({
      id: newIndex,
      isProgramCorrect: false,
      type: 'SyntaxError',
      liveBadge: `Kịch bản kiểm thử #${newIndex}`,
      reviewBadge: 'Chương trình SAI • Lỗi cú pháp (SyntaxError)',
      title: `Câu ${newIndex}: Kiểm tra đoạn chương trình Python`,
      prompt: 'Đoạn chương trình dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
      timeLimit: Number(bulkTimeLimit.value) || 45,
      maxPoints: Number(bulkMaxPoints.value) || 1000,
      penaltyPerSecond: bulkPenaltySec.value !== '' ? Number(bulkPenaltySec.value) : 10,
      buggyCode: [
        'x = 10',
        'if x > 5',
        '    print("Lớn hơn 5")'
      ],
      buggyLine: 2,
      errorSummary: "SyntaxError: expected ':' tại dòng 2",
      pythonOutput: [
        `$ python kiem_thu_cau_${newIndex}.py`,
        `  File "kiem_thu_cau_${newIndex}.py", line 2`,
        '    if x > 5',
        '            ^',
        "SyntaxError: expected ':'"
      ],
      fixedCode: [
        'x = 10',
        'if x > 5:',
        '    print("Lớn hơn 5")'
      ],
      fixedLine: 2,
      options: [
        'Chương trình ĐÚNG (chạy tốt và in ra Lớn hơn 5)',
        'Chương trình SAI — Dòng 2 thiếu dấu hai chấm (:) ở cuối lệnh if',
        'Chương trình SAI — Không được gán x = 10 ở dòng 1',
        'Chương trình SAI — Hàm print() không được in chuỗi có dấu'
      ],
      correctIndex: 1,
      explanation: 'Cuối câu lệnh điều kiện if trong Python bắt buộc phải có dấu hai chấm (:).'
    });

    selectedQuestionIdx = editableQuestions.length - 1;
    renderQuestionEditorTabs();
    loadCurrentQuestionToForm();
    showQeStatus(`➕ Đã thêm Câu ${newIndex}. Hãy chỉnh sửa nội dung và nhấn Lưu!`);
  });
}

// Xóa câu hỏi đang chọn
if (btnDeleteCurrentQuestion) {
  btnDeleteCurrentQuestion.addEventListener('click', () => {
    if (editableQuestions.length <= 1) {
      showQeStatus('Phải giữ lại ít nhất 1 câu hỏi trong trò chơi!', true);
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa "${editableQuestions[selectedQuestionIdx].title}"?`)) {
      return;
    }
    editableQuestions.splice(selectedQuestionIdx, 1);
    selectedQuestionIdx = Math.max(0, selectedQuestionIdx - 1);
    renderQuestionEditorTabs();
    loadCurrentQuestionToForm();
    showQeStatus('🗑️ Đã xóa câu hỏi. Nhấn "Lưu tất cả thay đổi" để cập nhật lên máy chủ.');
  });
}

// Khôi phục bộ câu hỏi mặc định
if (btnResetDefaultQuestions) {
  btnResetDefaultQuestions.addEventListener('click', async () => {
    if (!confirm('Khôi phục lại 5 câu hỏi mặc định ban đầu (45s/câu, 1000 điểm, -10đ/giây)?')) {
      return;
    }
    try {
      const res = await fetch('/api/host/questions/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${hostToken}` }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        editableQuestions = data.questions;
        selectedQuestionIdx = 0;
        renderQuestionEditorTabs();
        loadCurrentQuestionToForm();
        showQeStatus('✅ Đã khôi phục bộ câu hỏi mặc định thành công!');
      }
    } catch {
      showQeStatus('Lỗi kết nối khi khôi phục mặc định.', true);
    }
  });
}

// Lưu toàn bộ câu hỏi và cấu hình điểm lên Server
if (btnSaveAllQuestions) {
  btnSaveAllQuestions.addEventListener('click', async () => {
    syncFormToCurrentQuestion();
    try {
      const res = await fetch('/api/host/questions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hostToken}`
        },
        body: JSON.stringify({ questions: editableQuestions })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showQeStatus(data.message || 'Không thể lưu câu hỏi!', true);
        return;
      }

      editableQuestions = data.questions;
      renderQuestionEditorTabs();
      loadCurrentQuestionToForm();
      showQeStatus('✅ Đã lưu toàn bộ câu hỏi, thời gian và điểm số thành công!');
    } catch {
      showQeStatus('Lỗi kết nối khi lưu câu hỏi!', true);
    }
  });
}

// Kiểm tra phiên đăng nhập Giáo viên khi mở trang
verifySavedHostSession();
