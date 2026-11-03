// ============================================================================
// PLAYER.JS - ĐIỀU KHIỂN MÀN HÌNH HỌC SINH (PLAYER VIEW)
// ============================================================================
const socket = io();

const AVATAR_LIST = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐨', '🐙', '🦄', '🐝', '🦉', '🐬', '🚀'];
const LETTERS = ['A', 'B', 'C', 'D'];

const screens = {
  LOGIN: document.getElementById('player-screen-login'),
  WAITING: document.getElementById('player-screen-waiting'),
  QUESTION: document.getElementById('player-screen-question'),
  RESULT: document.getElementById('player-screen-result'),
  FINAL: document.getElementById('player-screen-final')
};

// Header cá nhân
const playerHeader = document.getElementById('player-header');
const headerAvatar = document.getElementById('header-avatar');
const headerName = document.getElementById('header-name');
const headerScore = document.getElementById('header-score');
const playerSoundToggle = document.getElementById('player-sound-toggle');

function updatePlayerSoundUI() {
  if (!playerSoundToggle || !window.GameAudio) return;
  playerSoundToggle.textContent = window.GameAudio.isMuted ? '🔇' : '🔊';
  playerSoundToggle.title = window.GameAudio.isMuted ? 'Bật âm thanh' : 'Tắt âm thanh';
  if (window.GameAudio.isMuted) {
    playerSoundToggle.classList.add('text-slate-500');
    playerSoundToggle.classList.remove('text-slate-300');
  } else {
    playerSoundToggle.classList.remove('text-slate-500');
    playerSoundToggle.classList.add('text-slate-300');
  }
}

if (playerSoundToggle) {
  updatePlayerSoundUI();
  playerSoundToggle.addEventListener('click', () => {
    if (!window.GameAudio) return;
    window.GameAudio.toggleMute();
    updatePlayerSoundUI();
  });
}

// Form đăng nhập
const loginForm = document.getElementById('login-form');
const inputPlayerName = document.getElementById('input-player-name');
const avatarPicker = document.getElementById('avatar-picker');
const loginError = document.getElementById('login-error');

// Màn hình chờ
const waitingAvatar = document.getElementById('waiting-avatar');
const waitingName = document.getElementById('waiting-name');

// Màn hình câu hỏi (30s)
const playerQBadge = document.getElementById('player-q-badge');
const playerQTitle = document.getElementById('player-q-title');
const playerQPrompt = document.getElementById('player-q-prompt');
const playerTimer = document.getElementById('player-timer');
const playerTimerBar = document.getElementById('player-timer-bar');
const playerCodeLines = document.getElementById('player-code-lines');
const optionButtons = Array.from(document.querySelectorAll('.player-option-btn'));
const playerLockedBanner = document.getElementById('player-locked-banner');
const playerLockedIcon = document.getElementById('player-locked-icon');
const playerLockedTitle = document.getElementById('player-locked-title');
const playerChosenSummary = document.getElementById('player-chosen-summary');

// Màn hình kết quả chạy thử Python & giải thích sau mỗi câu
const resultCard = document.getElementById('result-card');
const resultIcon = document.getElementById('result-icon');
const resultTitle = document.getElementById('result-title');
const resultPoints = document.getElementById('result-points');
const resultCorrectLetter = document.getElementById('result-correct-letter');
const resultCorrectText = document.getElementById('result-correct-text');
const resultExplanation = document.getElementById('result-explanation');
const resultRankBadge = document.getElementById('result-rank-badge');

const playerTestedWindow = document.getElementById('player-tested-window');
const playerTestedHeader = document.getElementById('player-tested-header');
const playerTestedStatusTag = document.getElementById('player-tested-status-tag');
const playerBuggyLineTag = document.getElementById('player-buggy-line-tag');
const playerReviewBuggyCode = document.getElementById('player-review-buggy-code');
const playerTerminalBadge = document.getElementById('player-terminal-badge');
const playerPythonOutput = document.getElementById('player-python-output');
const playerFixedCodeWrap = document.getElementById('player-fixed-code-wrap');
const playerFixedLineTag = document.getElementById('player-fixed-line-tag');
const playerReviewFixedCode = document.getElementById('player-review-fixed-code');

// Màn hình tổng kết
const finalPlayerRank = document.getElementById('final-player-rank');
const finalPlayerScore = document.getElementById('final-player-score');
const finalPlayerCorrect = document.getElementById('final-player-correct');

// Trạng thái người chơi cục bộ
let playerState = {
  id: sessionStorage.getItem('bug_hunter_player_id') || null,
  name: sessionStorage.getItem('bug_hunter_player_name') || '',
  avatar: sessionStorage.getItem('bug_hunter_player_avatar') || AVATAR_LIST[0],
  score: 0,
  joined: false,
  hasAnsweredCurrent: false,
  chosenOptionIndex: null,
  currentTimeLimit: 45
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function renderCodeBlock(container, lines, highlightLine = null, mode = null) {
  if (!container || !Array.isArray(lines)) return;
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

function showPlayerScreen(screenKey) {
  Object.entries(screens).forEach(([key, el]) => {
    if (key === screenKey) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  if (screenKey === 'LOGIN') {
    playerHeader.classList.add('hidden');
  } else {
    playerHeader.classList.remove('hidden');
  }
}

function initAvatarPicker() {
  avatarPicker.innerHTML = AVATAR_LIST.map(
    (av) => `
    <button
      type="button"
      data-avatar="${av}"
      class="avatar-btn text-2xl py-2 rounded-xl border transition ${
        av === playerState.avatar
          ? 'bg-sky-500/30 border-sky-400 scale-105'
          : 'bg-slate-800/70 border-slate-700 hover:bg-slate-800'
      }"
    >
      ${av}
    </button>
  `
  ).join('');

  avatarPicker.querySelectorAll('.avatar-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playerState.avatar = btn.dataset.avatar;
      initAvatarPicker();
    });
  });
}

if (playerState.name) {
  inputPlayerName.value = playerState.name;
}
initAvatarPicker();

function updateHeaderUI() {
  headerAvatar.textContent = playerState.avatar;
  headerName.textContent = playerState.name;
  headerScore.textContent = `${playerState.score} đ`;
  waitingAvatar.textContent = playerState.avatar;
  waitingName.textContent = `Xin chào, ${playerState.name}!`;
}

function joinGame(name, avatar) {
  socket.emit(
    'player:join',
    {
      playerId: playerState.id,
      name,
      avatar
    },
    (res) => {
      if (!res || !res.ok) {
        loginError.textContent = (res && res.message) || 'Không thể tham gia phòng chơi.';
        loginError.classList.remove('hidden');
        return;
      }

      loginError.classList.add('hidden');
      playerState.id = res.player.id;
      playerState.name = res.player.name;
      playerState.avatar = res.player.avatar;
      playerState.score = res.player.score || 0;
      playerState.joined = true;

      sessionStorage.setItem('bug_hunter_player_id', playerState.id);
      sessionStorage.setItem('bug_hunter_player_name', playerState.name);
      sessionStorage.setItem('bug_hunter_player_avatar', playerState.avatar);

      updateHeaderUI();
      handleSyncState(res.sync);
    }
  );
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (window.GameAudio) {
    window.GameAudio.unlock();
    window.GameAudio.playClick();
  }
  const cleanName = inputPlayerName.value.trim();
  if (!cleanName) {
    loginError.textContent = 'Vui lòng nhập Họ và Tên hoặc Biệt danh!';
    loginError.classList.remove('hidden');
    return;
  }
  joinGame(cleanName, playerState.avatar);
});

function handleSyncState(sync) {
  if (!sync || sync.stage === 'LOBBY') {
    showPlayerScreen('WAITING');
    if (window.GameAudio) window.GameAudio.playJoin();
    return;
  }

  if ((sync.stage === 'QUESTION' || sync.stage === 'AWAITING_RUN') && sync.question) {
    renderQuestionForPlayer(sync.question, sync.remainingTime);
    if (sync.alreadyAnswered) {
      lockAnswerUI(sync.chosenOptionIndex);
    }
    if (sync.stage === 'AWAITING_RUN') {
      lockForAwaitingRun();
    }
    return;
  }

  if (sync.stage === 'REVIEW' && sync.result) {
    renderPersonalResult(sync.result);
    return;
  }

  if (sync.stage === 'LEADERBOARD') {
    showPlayerScreen('RESULT');
    resultRankBadge.textContent = `Thứ hạng hiện tại: Hạng #${sync.rank} / ${sync.totalPlayers} HS`;
    playerState.score = sync.score;
    updateHeaderUI();
    return;
  }

  if (sync.stage === 'FINAL') {
    renderFinalForPlayer(sync);
  }
}

function updatePlayerTimerUI(remainingTime, timeLimit) {
  playerTimer.textContent = `${remainingTime}s`;
  const limit = timeLimit || playerState.currentTimeLimit || 45;
  const pct = limit > 0 ? Math.max(0, Math.min(100, (remainingTime / limit) * 100)) : 0;
  if (playerTimerBar) {
    playerTimerBar.style.width = `${pct}%`;
  }
  if (window.GameAudio && remainingTime > 0 && remainingTime <= 5) {
    window.GameAudio.playUrgentTick();
  }
  if (remainingTime <= 5) {
    playerTimer.classList.add('text-rose-400', 'animate-pulse');
  } else {
    playerTimer.classList.remove('text-rose-400', 'animate-pulse');
  }
}

function renderQuestionForPlayer(question, remainingTime) {
  playerState.hasAnsweredCurrent = false;
  playerState.chosenOptionIndex = null;
  playerState.currentTimeLimit = question.timeLimit || 45;
  showPlayerScreen('QUESTION');

  playerQBadge.textContent = `Câu ${question.index + 1}/${question.totalQuestions} • ${question.badge}`;
  playerQTitle.textContent = question.title;
  playerQPrompt.textContent = question.prompt || '';

  renderCodeBlock(playerCodeLines, question.buggyCode, null, null);

  updatePlayerTimerUI(remainingTime, question.timeLimit);
  playerLockedBanner.classList.add('hidden');

  optionButtons.forEach((btn, idx) => {
    btn.disabled = false;
    btn.classList.remove('selected-choice', 'dimmed-choice');
    const textSpan = document.getElementById(`player-opt-text-${idx}`);
    if (textSpan && question.options[idx]) {
      textSpan.textContent = question.options[idx];
    }
  });
}

function lockAnswerUI(chosenIndex, timeSec = null) {
  playerState.hasAnsweredCurrent = true;
  playerState.chosenOptionIndex = chosenIndex;

  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === chosenIndex) {
      btn.classList.add('selected-choice');
    } else {
      btn.classList.add('dimmed-choice');
    }
  });

  const letter = LETTERS[chosenIndex] || '';
  playerLockedIcon.textContent = '📨';
  playerLockedTitle.textContent = 'Đã gửi câu trả lời, hãy nhìn lên màn hình chính!';
  playerChosenSummary.textContent = timeSec
    ? `Bạn đã chọn đáp án ${letter} (trong ${timeSec}s) • Chờ Giáo viên chạy thử code Python!`
    : `Bạn đã chọn đáp án ${letter} • Chờ Giáo viên chạy thử code Python!`;
  playerLockedBanner.classList.remove('hidden');
}

// Khi hết 45s và đang chờ Giáo viên bấm nút "▶️ Chạy thử chương trình"
function lockForAwaitingRun() {
  playerState.hasAnsweredCurrent = true;
  updatePlayerTimerUI(0, playerState.currentTimeLimit);

  optionButtons.forEach((btn, idx) => {
    btn.disabled = true;
    if (playerState.chosenOptionIndex !== idx) {
      btn.classList.add('dimmed-choice');
    }
  });

  playerLockedIcon.textContent = '🐍';
  playerLockedTitle.textContent = 'Đã hết giờ! Chờ Giáo viên bấm [▶️ Chạy thử chương trình]...';
  playerChosenSummary.textContent =
    playerState.chosenOptionIndex !== null
      ? `Bạn đã chọn đáp án ${LETTERS[playerState.chosenOptionIndex]} • Hãy quan sát kết quả chạy Python!`
      : 'Bạn chưa kịp chọn đáp án • Hãy quan sát kết quả chạy Python!';
  playerLockedBanner.classList.remove('hidden');
}

optionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (playerState.hasAnsweredCurrent) return;
    if (window.GameAudio) window.GameAudio.playClick();
    const optionIndex = Number(btn.dataset.index);

    lockAnswerUI(optionIndex);

    socket.emit(
      'player:submitAnswer',
      {
        playerId: playerState.id,
        optionIndex
      },
      (res) => {
        if (res && res.ok) {
          lockAnswerUI(optionIndex, res.timeSec);
        }
      }
    );
  });
});

// Hiển thị kết quả chạy thử code Python & điểm cá nhân
function renderPersonalResult(result) {
  showPlayerScreen('RESULT');

  if (window.GameAudio) {
    if (result.isCorrect) {
      window.GameAudio.playCorrect();
    } else {
      window.GameAudio.playWrong();
    }
  }

  playerState.score = result.totalScore;
  updateHeaderUI();

  resultCorrectLetter.textContent = LETTERS[result.correctIndex] || 'A';
  resultCorrectText.textContent = result.correctOptionText || '';
  resultExplanation.textContent = result.explanation || '';
  resultRankBadge.textContent = `Thứ hạng hiện tại: Hạng #${result.rank} / ${result.totalPlayers} HS`;

  // Hiển thị kết quả chạy thử code Python (Đúng hoặc Tô đỏ dòng sai + Terminal)
  if (result.isProgramCorrect) {
    playerTestedWindow.className = 'code-window border-emerald-500/60';
    playerTestedHeader.className = 'code-window-header bg-emerald-950/60 border-b border-emerald-500/30';
    playerTestedStatusTag.className = 'px-2 py-0.5 rounded text-[11px] font-black bg-emerald-500 text-slate-950';
    playerTestedStatusTag.textContent = '✅ CHƯƠNG TRÌNH ĐÚNG';
    playerBuggyLineTag.className = 'text-[11px] text-emerald-300 font-mono-code font-bold';
    playerBuggyLineTag.textContent = 'Không có lỗi';

    renderCodeBlock(playerReviewBuggyCode, result.buggyCode, result.fixedLine, 'correct-program');

    playerTerminalBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300';
    playerTerminalBadge.textContent = 'Exit Code: 0';

    playerFixedCodeWrap.classList.add('hidden');
  } else {
    playerTestedWindow.className = 'code-window border-rose-500/60';
    playerTestedHeader.className = 'code-window-header bg-rose-950/60 border-b border-rose-500/30';
    playerTestedStatusTag.className = 'px-2 py-0.5 rounded text-[11px] font-black bg-rose-500 text-white';
    playerTestedStatusTag.textContent = '❌ CODE BỊ LỖI';
    playerBuggyLineTag.className = 'text-[11px] text-rose-300 font-mono-code font-bold';
    playerBuggyLineTag.textContent = `Dòng ${result.buggyLine} bị lỗi`;

    renderCodeBlock(playerReviewBuggyCode, result.buggyCode, result.buggyLine, 'buggy');

    playerTerminalBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300';
    playerTerminalBadge.textContent = 'Phát hiện Bug';

    playerFixedCodeWrap.classList.remove('hidden');
    playerFixedLineTag.textContent = `Dòng ${result.fixedLine} đã sửa`;
    renderCodeBlock(playerReviewFixedCode, result.fixedCode, result.fixedLine, 'fixed');
  }

  renderPythonTerminalOutput(playerPythonOutput, result.pythonOutput || [], result.isProgramCorrect);

  resultCard.classList.remove('border-emerald-500/50', 'border-rose-500/50', 'border-amber-500/50');

  if (result.isCorrect) {
    resultIcon.textContent = '🎉';
    resultTitle.textContent = 'BẠN ĐÃ TRẢ LỜI CHÍNH XÁC!';
    resultTitle.className = 'text-lg sm:text-xl font-black text-emerald-400';
    resultPoints.textContent = `+${result.pointsEarned} điểm`;
    resultPoints.className = 'text-xl font-black text-emerald-400 font-mono-code';
    resultCard.classList.add('border', 'border-emerald-500/50');
  } else if (result.answered) {
    resultIcon.textContent = '😢';
    resultTitle.textContent = `CHƯA ĐÚNG (Bạn chọn ${LETTERS[result.optionIndex]})`;
    resultTitle.className = 'text-base sm:text-lg font-black text-rose-400';
    resultPoints.textContent = '+0 điểm';
    resultPoints.className = 'text-xl font-black text-slate-400 font-mono-code';
    resultCard.classList.add('border', 'border-rose-500/50');
  } else {
    resultIcon.textContent = '⏰';
    resultTitle.textContent = 'HẾT THỜI GIAN CHƯA TRẢ LỜI!';
    resultTitle.className = 'text-lg sm:text-xl font-black text-amber-400';
    resultPoints.textContent = '+0 điểm';
    resultPoints.className = 'text-xl font-black text-slate-400 font-mono-code';
    resultCard.classList.add('border', 'border-amber-500/50');
  }
}

function renderFinalForPlayer(data) {
  showPlayerScreen('FINAL');

  if (window.GameAudio) {
    window.GameAudio.playVictory();
  }

  playerState.score = data.score || 0;
  updateHeaderUI();

  finalPlayerRank.textContent = `#${data.rank || 1}`;
  finalPlayerScore.textContent = `${data.score || 0} đ`;
  finalPlayerCorrect.textContent = `${data.correctCount || 0}/${data.totalQuestions || 5}`;
}

// ============================================================================
// LẮNG NGHE SỰ KIỆN SOCKET.IO TỪ SERVER
// ============================================================================
socket.on('connect', () => {
  if (playerState.id && playerState.name) {
    joinGame(playerState.name, playerState.avatar);
  }
});

socket.on('game:questionStart', ({ question, remainingTime }) => {
  if (!playerState.joined) return;
  renderQuestionForPlayer(question, remainingTime);
});

socket.on('game:timerTick', ({ remainingTime, timeLimit }) => {
  if (!playerState.joined) return;
  updatePlayerTimerUI(remainingTime, timeLimit);
});

socket.on('game:awaitingRun', () => {
  if (!playerState.joined) return;
  lockForAwaitingRun();
});

socket.on('player:questionResult', (result) => {
  if (!playerState.joined) return;
  renderPersonalResult(result);
});

socket.on('player:leaderboardUpdate', ({ rank, totalPlayers, score }) => {
  if (!playerState.joined) return;
  playerState.score = score;
  updateHeaderUI();
  resultRankBadge.textContent = `Thứ hạng hiện tại: Hạng #${rank} / ${totalPlayers} HS`;
});

socket.on('player:finalStage', (data) => {
  if (!playerState.joined) return;
  renderFinalForPlayer(data);
});

socket.on('game:reset', ({ keepPlayers }) => {
  if (!keepPlayers) {
    sessionStorage.removeItem('bug_hunter_player_id');
    playerState.id = null;
    playerState.joined = false;
    playerState.score = 0;
    showPlayerScreen('LOGIN');
  } else if (playerState.joined) {
    playerState.score = 0;
    updateHeaderUI();
    showPlayerScreen('WAITING');
  }
});
