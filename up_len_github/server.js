const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const ip = require('ip');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================================================
// CẤU HÌNH TÀI KHOẢN & PHÂN QUYỀN GIÁO VIÊN (HOST AUTHENTICATION)
// Có thể đổi qua biến môi trường TEACHER_USER / TEACHER_PASS khi đưa lên Hosting
// ============================================================================
const TEACHER_ACCOUNTS = [
  {
    username: process.env.TEACHER_USER || 'giaovien',
    password: process.env.TEACHER_PASS || 'tinhoc10',
    role: 'TEACHER',
    displayName: 'Giáo viên Tin học 10'
  },
  {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || '123456',
    role: 'TEACHER',
    displayName: 'Quản trị viên (Host)'
  }
];

// Lưu phiên đăng nhập của Giáo viên (token -> { username, role, displayName, createdAt })
const hostSessions = new Map();

function createHostSession(account) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    token,
    username: account.username,
    role: account.role,
    displayName: account.displayName,
    createdAt: Date.now()
  };
  hostSessions.set(token, sessionData);
  return sessionData;
}

function getHostSession(token) {
  if (!token || typeof token !== 'string') return null;
  return hostSessions.get(token) || null;
}

// API Đăng nhập quyền Giáo viên
app.post('/api/host/login', (req, res) => {
  const { username, password } = req.body || {};
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  const matched = TEACHER_ACCOUNTS.find(
    (acc) => acc.username.toLowerCase() === cleanUser && acc.password === cleanPass
  );

  if (!matched) {
    return res.status(401).json({
      ok: false,
      message: 'Tài khoản hoặc mật khẩu Giáo viên không chính xác!'
    });
  }

  const session = createHostSession(matched);
  return res.json({
    ok: true,
    token: session.token,
    user: {
      username: session.username,
      role: session.role,
      displayName: session.displayName
    }
  });
});

// API Kiểm tra phiên đăng nhập Giáo viên
app.get('/api/host/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String(req.query.token || '');

  const session = getHostSession(token);
  if (!session) {
    return res.status(401).json({ ok: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }

  return res.json({
    ok: true,
    user: {
      username: session.username,
      role: session.role,
      displayName: session.displayName
    }
  });
});

// API Đăng xuất Giáo viên
app.post('/api/host/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String((req.body && req.body.token) || '');

  if (token) {
    hostSessions.delete(token);
  }
  return res.json({ ok: true });
});

// Phục vụ file tĩnh trong thư mục public (tắt cache để trình duyệt luôn nhận bản mới nhất)
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  })
);

// Định tuyến cho màn hình Giáo viên (Host) và Học sinh (Player)
app.get(['/host', '/teacher'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get(['/', '/join'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

/**
 * Tự động tìm địa chỉ IP LAN phù hợp nhất (ưu tiên Wi-Fi / Ethernet thực tế,
 * hạn chế chọn nhầm card mạng ảo như VirtualBox 192.168.56.1, WSL, Docker...)
 */
function getNetworkInterfacesList() {
  const interfaces = os.networkInterfaces();
  const list = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const lowerName = name.toLowerCase();
        const isVirtual =
          lowerName.includes('virtual') ||
          lowerName.includes('vbox') ||
          lowerName.includes('vmware') ||
          lowerName.includes('wsl') ||
          lowerName.includes('hyper-v') ||
          lowerName.includes('docker') ||
          lowerName.includes('loopback') ||
          addr.address.startsWith('192.168.56.') ||
          addr.address.startsWith('169.254.');

        list.push({
          name,
          address: addr.address,
          isVirtual
        });
      }
    }
  }

  list.sort((a, b) => Number(a.isVirtual) - Number(b.isVirtual));
  return list;
}

function getBestLanIp() {
  const list = getNetworkInterfacesList();
  if (list.length > 0) {
    return list[0].address;
  }
  return ip.address() || 'localhost';
}

// API lấy thông tin mạng và mã QR tham gia (hỗ trợ cả Hosting lẫn LAN cục bộ)
app.get('/api/network-info', async (req, res) => {
  try {
    const allIps = getNetworkInterfacesList();
    const selectedIp = req.query.ip || getBestLanIp();
    const customOrigin = req.query.origin ? String(req.query.origin).replace(/\/$/, '') : '';

    const joinUrl = customOrigin
      ? `${customOrigin}/join`
      : `http://${selectedIp}:${PORT}/join`;
    const hostUrl = customOrigin
      ? `${customOrigin}/host`
      : `http://${selectedIp}:${PORT}/host`;

    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 640,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      ip: selectedIp,
      port: PORT,
      joinUrl,
      hostUrl,
      qrCodeDataUrl,
      allIps
    });
  } catch (err) {
    console.error('Lỗi tạo QR Code:', err);
    res.status(500).json({ error: 'Không thể tạo mã QR' });
  }
});

// ============================================================================
// DỮ LIỆU CÂU HỎI MẶC ĐỊNH (45 GIÂY/CÂU, 1000 ĐIỂM, TRỪ 10 ĐIỂM/GIÂY)
// ============================================================================
const QUESTIONS_FILE_PATH = path.join(__dirname, 'questions.json');

const DEFAULT_QUESTIONS = [
  {
    id: 1,
    isProgramCorrect: false,
    type: 'SyntaxError',
    liveBadge: 'Kịch bản kiểm thử #1',
    reviewBadge: 'Chương trình SAI • Lỗi cú pháp (SyntaxError)',
    title: 'Câu 1: Kiểm tra số nguyên chẵn hay lẻ',
    prompt: 'Đoạn chương trình dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
    timeLimit: 45,
    maxPoints: 1000,
    penaltyPerSecond: 10,
    buggyCode: [
      'n = int(input("Nhập số nguyên n: "))',
      'if n % 2 == 0',
      '    print(n, "là số chẵn")',
      'else:',
      '    print(n, "là số lẻ")'
    ],
    buggyLine: 2,
    errorSummary: 'SyntaxError: expected \':\' (Thiếu dấu hai chấm ở cuối dòng 2)',
    pythonOutput: [
      '$ python kiem_thu_cau_1.py',
      '  File "kiem_thu_cau_1.py", line 2',
      '    if n % 2 == 0',
      '                 ^',
      "SyntaxError: expected ':'"
    ],
    fixedCode: [
      'n = int(input("Nhập số nguyên n: "))',
      'if n % 2 == 0:',
      '    print(n, "là số chẵn")',
      'else:',
      '    print(n, "là số lẻ")'
    ],
    fixedLine: 2,
    options: [
      'Chương trình ĐÚNG (chạy tốt và in ra kết quả chẵn/lẻ chính xác)',
      'Chương trình SAI — Dòng 2 thiếu dấu hai chấm (:) ở cuối câu lệnh if',
      'Chương trình SAI — Dòng 2 phải dùng phép chia / thay vì %',
      'Chương trình SAI — Dòng 4 từ khóa else: không được có dấu hai chấm'
    ],
    correctIndex: 1,
    explanation:
      'Chương trình này BỊ LỖI CÚ PHÁP (SyntaxError)! Trong Python, cuối dòng điều kiện if bắt buộc phải có dấu hai chấm (:). Khi bấm chạy, trình thông dịch Python dừng ngay tại dòng 2 và báo lỗi SyntaxError: expected \':\'.'
  },
  {
    id: 2,
    isProgramCorrect: true,
    type: 'CorrectProgram',
    liveBadge: 'Kịch bản kiểm thử #2',
    reviewBadge: 'Chương trình ĐÚNG • Thuật toán chạy chính xác',
    title: 'Câu 2: Tính tổng các số tự nhiên từ 1 đến 5',
    prompt: 'Đoạn chương trình tính tổng các số từ 1 đến 5 dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
    timeLimit: 45,
    maxPoints: 1000,
    penaltyPerSecond: 10,
    buggyCode: [
      'tong = 0',
      'for i in range(1, 6):',
      '    tong = tong + i',
      'print("Tổng từ 1 đến 5 là:", tong)'
    ],
    buggyLine: null,
    errorSummary: 'Không có lỗi — Kết quả thuật toán: Tổng từ 1 đến 5 là: 15',
    pythonOutput: [
      '$ python kiem_thu_cau_2.py',
      '>>> Vòng lặp i = 1 -> tong = 1',
      '>>> Vòng lặp i = 2 -> tong = 3',
      '>>> Vòng lặp i = 3 -> tong = 6',
      '>>> Vòng lặp i = 4 -> tong = 10',
      '>>> Vòng lặp i = 5 -> tong = 15',
      'Tổng từ 1 đến 5 là: 15',
      '',
      '[Process finished with exit code 0 — Chương trình chạy ĐÚNG!]'
    ],
    fixedCode: [
      'tong = 0',
      'for i in range(1, 6):',
      '    tong = tong + i',
      'print("Tổng từ 1 đến 5 là:", tong)'
    ],
    fixedLine: 4,
    options: [
      'Chương trình SAI — Hàm range(1, 6) sẽ lặp từ 1 đến 6 làm kết quả bị dư',
      'Chương trình SAI — Dòng 3 không được viết tong = tong + i',
      'Chương trình ĐÚNG (chạy không lỗi và in ra Tổng từ 1 đến 5 là: 15)',
      'Chương trình SAI — Dòng 4 thiếu dấu hai chấm (:) trước lệnh print'
    ],
    correctIndex: 2,
    explanation:
      'Đây là CHƯƠNG TRÌNH HOÀN TOÀN ĐÚNG! Hàm range(1, 6) tạo dãy số từ 1 đến 5 (1, 2, 3, 4, 5). Qua mỗi vòng lặp biến tong cộng dồn chuẩn xác và in ra kết quả thuật toán là 15.'
  },
  {
    id: 3,
    isProgramCorrect: false,
    type: 'TypeError',
    liveBadge: 'Kịch bản kiểm thử #3',
    reviewBadge: 'Chương trình SAI • Lỗi kiểu dữ liệu (TypeError)',
    title: 'Câu 3: Tính tuổi của bạn sau 5 năm nữa',
    prompt: 'Khi nhập tuổi là 15, đoạn chương trình dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
    timeLimit: 45,
    maxPoints: 1000,
    penaltyPerSecond: 10,
    buggyCode: [
      'tuoi = input("Nhập tuổi hiện tại: ")',
      'tuoi_moi = tuoi + 5',
      'print("Tuổi sau 5 năm là:", tuoi_moi)'
    ],
    buggyLine: 2,
    errorSummary: 'TypeError: can only concatenate str (not "int") to str tại dòng 2',
    pythonOutput: [
      '$ python kiem_thu_cau_3.py',
      'Nhập tuổi hiện tại: 15',
      'Traceback (most recent call last):',
      '  File "kiem_thu_cau_3.py", line 2, in <module>',
      '    tuoi_moi = tuoi + 5',
      '               ~~~~~^~~',
      'TypeError: can only concatenate str (not "int") to str'
    ],
    fixedCode: [
      'tuoi = int(input("Nhập tuổi hiện tại: "))',
      'tuoi_moi = tuoi + 5',
      'print("Tuổi sau 5 năm là:", tuoi_moi)'
    ],
    fixedLine: 1,
    options: [
      'Chương trình SAI — Dòng 1 chưa ép kiểu int(input(...)) nên dòng 2 bị lỗi cộng chuỗi với số (TypeError)',
      'Chương trình ĐÚNG (nhập 15 chương trình sẽ in ra Tuổi sau 5 năm là: 20)',
      'Chương trình SAI — Tên biến tuoi_moi ở dòng 2 không được có dấu gạch dưới (_)',
      'Chương trình SAI — Lệnh print() ở dòng 3 không được dùng dấu phẩy (,)'
    ],
    correctIndex: 0,
    explanation:
      'Chương trình BỊ LỖI NGOẠI LỆ (TypeError)! Hàm input() luôn trả về kiểu xâu ký tự (str). Do dòng 1 chưa ép kiểu bằng int(input(...)), nên ở dòng 2 phép tính "15" + 5 lấy xâu cộng với số nguyên khiến Python dừng và báo lỗi TypeError.'
  },
  {
    id: 4,
    isProgramCorrect: false,
    type: 'IndexError',
    liveBadge: 'Kịch bản kiểm thử #4',
    reviewBadge: 'Chương trình SAI • Lỗi vượt chỉ số (IndexError)',
    title: 'Câu 4: In danh sách điểm 3 bài kiểm tra',
    prompt: 'Đoạn chương trình duyệt và in danh sách điểm dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
    timeLimit: 45,
    maxPoints: 1000,
    penaltyPerSecond: 10,
    buggyCode: [
      'diem = [8.5, 9.0, 10.0]',
      'for i in range(len(diem) + 1):',
      '    print("Lần", i + 1, "đạt:", diem[i])'
    ],
    buggyLine: 3,
    errorSummary: 'IndexError: list index out of range (Truy cập diem[3] vượt quá danh sách)',
    pythonOutput: [
      '$ python kiem_thu_cau_4.py',
      'Lần 1 đạt: 8.5',
      'Lần 2 đạt: 9.0',
      'Lần 3 đạt: 10.0',
      'Traceback (most recent call last):',
      '  File "kiem_thu_cau_4.py", line 3, in <module>',
      '    print("Lần", i + 1, "đạt:", diem[i])',
      '                                ~~~~^^^',
      'IndexError: list index out of range'
    ],
    fixedCode: [
      'diem = [8.5, 9.0, 10.0]',
      'for i in range(len(diem)):',
      '    print("Lần", i + 1, "đạt:", diem[i])'
    ],
    fixedLine: 2,
    options: [
      'Chương trình SAI — Danh sách diem ở dòng 1 không được chứa số thập phân',
      'Chương trình ĐÚNG (in ra đầy đủ 3 đầu điểm và kết thúc bình thường)',
      'Chương trình SAI — Không được đặt hàm len() bên trong hàm range()',
      'Chương trình SAI — Dòng 2 viết range(len(diem) + 1) làm chỉ số i chạy tới 3 gây lỗi IndexError ở dòng 3'
    ],
    correctIndex: 3,
    explanation:
      'Chương trình BỊ LỖI VƯỢT CHỈ SỐ (IndexError)! Danh sách diem có 3 phần tử (chỉ số 0, 1, 2). Do dòng 2 viết range(len(diem) + 1) tức là range(4), nên ở vòng lặp cuối khi i = 3, lệnh diem[3] ở dòng 3 truy cập vị trí không tồn tại.'
  },
  {
    id: 5,
    isProgramCorrect: false,
    type: 'LogicError',
    liveBadge: 'Kịch bản kiểm thử #5',
    reviewBadge: 'Chương trình SAI • Lỗi logic / ngữ nghĩa (LogicError)',
    title: 'Câu 5: Tính điểm trung bình cộng môn Toán và Tin',
    prompt: 'Chương trình tính trung bình cộng của Toán (8 điểm) và Tin (10 điểm) dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?',
    timeLimit: 45,
    maxPoints: 1000,
    penaltyPerSecond: 10,
    buggyCode: [
      'toan = 8',
      'tin = 10',
      'tb = toan + tin / 2',
      'print("Điểm trung bình:", tb)'
    ],
    buggyLine: 3,
    errorSummary: 'LogicError: Kết quả in ra 13.0 thay vì 9.0 do thiếu ngoặc đơn (toan + tin) / 2',
    pythonOutput: [
      '$ python kiem_thu_cau_5.py',
      'Điểm trung bình: 13.0',
      '',
      '[!] PHÁT HIỆN LỖI LOGIC KHI KIỂM THỬ (LogicError):',
      '  - Dữ liệu đầu vào: toan = 8, tin = 10',
      '  - Kết quả đúng của thuật toán: (8 + 10) / 2 = 9.0',
      '  - Kết quả chương trình in ra:  8 + 10 / 2   = 13.0 (SAI!)'
    ],
    fixedCode: [
      'toan = 8',
      'tin = 10',
      'tb = (toan + tin) / 2',
      'print("Điểm trung bình:", tb)'
    ],
    fixedLine: 3,
    options: [
      'Chương trình ĐÚNG (chạy ra kết quả Điểm trung bình: 9.0)',
      'Chương trình SAI — Dòng 3 phải dùng phép chia lấy nguyên // thay vì /',
      'Chương trình SAI — Dòng 3 thiếu dấu ngoặc đơn (toan + tin) / 2 nên máy tính chia trước cộng sau ra 13.0',
      'Chương trình SAI — Biến toan và tin ở dòng 1, 2 phải đặt trong dấu nháy kép'
    ],
    correctIndex: 2,
    explanation:
      'Chương trình BỊ LỖI LOGIC / NGỮ NGHĨA (LogicError)! Tuy Python chạy không báo lỗi đỏ nào, nhưng vì phép chia (/) có độ ưu tiên cao hơn phép cộng (+) nên dòng 3 tính 8 + (10 / 2) = 13.0 (sai kết quả bài toán). Cần sửa dòng 3 thành (toan + tin) / 2.'
  }
];

function cloneDefaultQuestions() {
  return JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
}

function loadQuestionsFromDisk() {
  try {
    if (fs.existsSync(QUESTIONS_FILE_PATH)) {
      const raw = fs.readFileSync(QUESTIONS_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Lỗi đọc file questions.json, dùng bộ câu hỏi mặc định:', err.message);
  }
  return cloneDefaultQuestions();
}

function saveQuestionsToDisk(questions) {
  try {
    fs.writeFileSync(QUESTIONS_FILE_PATH, JSON.stringify(questions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Không thể lưu file questions.json:', err.message);
  }
}

let QUESTIONS = loadQuestionsFromDisk();

// Middleware kiểm tra quyền Giáo viên cho các API quản lý câu hỏi
function requireHostAuthApi(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String(req.query.token || '');

  const session = getHostSession(token);
  if (!session) {
    return res.status(401).json({ ok: false, message: 'Chưa đăng nhập quyền Giáo viên!' });
  }
  req.hostSession = session;
  next();
}

// API Lấy danh sách toàn bộ câu hỏi để Giáo viên chỉnh sửa
app.get('/api/host/questions', requireHostAuthApi, (req, res) => {
  res.json({
    ok: true,
    questions: QUESTIONS
  });
});

// API Cập nhật danh sách câu hỏi, thời gian và cấu hình điểm số
app.put('/api/host/questions', requireHostAuthApi, (req, res) => {
  const { questions } = req.body || {};
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ ok: false, message: 'Phải có ít nhất 1 câu hỏi!' });
  }

  const normalized = questions.map((q, idx) => {
    const isCorrectProg = Boolean(q.isProgramCorrect);
    const type = String(q.type || (isCorrectProg ? 'CorrectProgram' : 'SyntaxError')).trim();
    const timeLimit = Math.max(5, Math.min(300, Number(q.timeLimit) || 45));
    const maxPoints = Math.max(100, Math.min(100000, Number(q.maxPoints) || 1000));
    const penaltyPerSecond = Math.max(0, Math.min(1000, q.penaltyPerSecond !== undefined ? Number(q.penaltyPerSecond) : 10));
    const correctIndex = Math.max(0, Math.min(3, Number(q.correctIndex) || 0));

    const buggyCode = Array.isArray(q.buggyCode)
      ? q.buggyCode
      : String(q.buggyCode || '').split(/\r?\n/);
    const fixedCode = Array.isArray(q.fixedCode)
      ? q.fixedCode
      : String(q.fixedCode || '').split(/\r?\n/);
    const pythonOutput = Array.isArray(q.pythonOutput)
      ? q.pythonOutput
      : String(q.pythonOutput || '').split(/\r?\n/);

    const options = Array.isArray(q.options) && q.options.length === 4
      ? q.options.map((opt) => String(opt || '').trim())
      : ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'];

    return {
      id: idx + 1,
      isProgramCorrect: isCorrectProg,
      type,
      liveBadge: String(q.liveBadge || `Kịch bản kiểm thử #${idx + 1}`).trim(),
      reviewBadge: String(
        q.reviewBadge ||
          (isCorrectProg
            ? 'Chương trình ĐÚNG • Thuật toán chạy chính xác'
            : `Chương trình SAI • Lỗi (${type})`)
      ).trim(),
      title: String(q.title || `Câu ${idx + 1}`).trim(),
      prompt: String(q.prompt || 'Đoạn chương trình dưới đây ĐÚNG hay SAI? Nếu sai thì sai ở chỗ nào?').trim(),
      timeLimit,
      maxPoints,
      penaltyPerSecond,
      buggyCode,
      buggyLine: isCorrectProg ? null : Math.max(1, Number(q.buggyLine) || 1),
      errorSummary: String(q.errorSummary || '').trim(),
      pythonOutput,
      fixedCode: fixedCode.length > 0 ? fixedCode : buggyCode,
      fixedLine: Math.max(1, Number(q.fixedLine) || 1),
      options,
      correctIndex,
      explanation: String(q.explanation || '').trim()
    };
  });

  QUESTIONS = normalized;
  saveQuestionsToDisk(QUESTIONS);

  io.to('hosts').emit('host:questionsUpdated', {
    totalQuestions: QUESTIONS.length,
    questions: QUESTIONS
  });

  return res.json({
    ok: true,
    message: 'Đã lưu bộ câu hỏi và cài đặt điểm số thành công!',
    questions: QUESTIONS
  });
});

// API Khôi phục bộ câu hỏi mặc định ban đầu
app.post('/api/host/questions/reset', requireHostAuthApi, (req, res) => {
  QUESTIONS = cloneDefaultQuestions();
  saveQuestionsToDisk(QUESTIONS);

  io.to('hosts').emit('host:questionsUpdated', {
    totalQuestions: QUESTIONS.length,
    questions: QUESTIONS
  });

  return res.json({
    ok: true,
    message: 'Đã khôi phục bộ câu hỏi mặc định!',
    questions: QUESTIONS
  });
});

// Nội dung chuẩn 3 khái niệm cốt lõi cho màn hình Tổng kết
const LESSON_SUMMARY = [
  {
    key: 'BUG',
    title: 'BUG (Lỗi)',
    color: 'red',
    description: 'Trạng thái bất thường hoặc sai sót logic tất yếu xảy ra trong mọi phần mềm.'
  },
  {
    key: 'TESTING',
    title: 'TESTING (Kiểm thử)',
    color: 'yellow',
    description: 'Quá trình chạy thử với các kịch bản cố tình để tìm ra lỗi.'
  },
  {
    key: 'DEBUGGING',
    title: 'DEBUGGING (Gỡ lỗi)',
    color: 'green',
    description: 'Quá trình truy tìm tận gốc nguyên nhân và khắc phục mã nguồn.'
  }
];

// ============================================================================
// QUẢN LÝ TRẠNG THÁI TRÒ CHƠI (GAME STATE)
// ============================================================================
const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐨', '🐙', '🦄', '🐝', '🦉', '🐬', '🦋', '🦖', '🚀', '⚡', '🌟'];

let gameState = {
  // Các trạng thái:
  // 'LOBBY' | 'QUESTION' (đang đếm ngược 30s) | 'AWAITING_RUN' (hết 30s, chờ GV bấm Chạy thử) | 'REVIEW' (đã chạy thử & hiện kết quả code) | 'LEADERBOARD' | 'FINAL'
  stage: 'LOBBY',
  currentQuestionIndex: -1,
  questionStartTime: null,
  remainingTime: 0,
  timerInterval: null,
  players: new Map(),
  currentAnswers: new Map()
};

function clearQuestionTimer() {
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
}

function getPlayersArray() {
  return Array.from(gameState.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    lastPoints: p.lastPoints || 0,
    correctCount: p.correctCount || 0,
    connected: p.connected
  }));
}

function getSortedLeaderboard() {
  const list = Array.from(gameState.players.values());
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.totalTimeMs || 0) - (b.totalTimeMs || 0);
  });
  return list.map((p, index) => ({
    rank: index + 1,
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    lastPoints: p.lastPoints || 0,
    correctCount: p.correctCount || 0,
    totalQuestions: QUESTIONS.length
  }));
}

function getAnswerDistribution() {
  const counts = [0, 0, 0, 0];
  for (const ans of gameState.currentAnswers.values()) {
    if (ans.optionIndex >= 0 && ans.optionIndex < 4) {
      counts[ans.optionIndex]++;
    }
  }
  const totalAnswered = gameState.currentAnswers.size;
  const totalPlayers = gameState.players.size;
  const percentages = counts.map((c) =>
    totalAnswered > 0 ? Math.round((c / totalAnswered) * 100) : 0
  );

  return {
    counts,
    percentages,
    totalAnswered,
    totalPlayers,
    allAnswered: checkAllPlayersAnswered()
  };
}

function sanitizeQuestionForLive(question, index) {
  return {
    index,
    totalQuestions: QUESTIONS.length,
    id: question.id,
    badge: question.liveBadge,
    title: question.title,
    prompt: question.prompt,
    timeLimit: question.timeLimit,
    buggyCode: question.buggyCode,
    options: question.options
  };
}

function getFullQuestionForReview(question, index) {
  return {
    ...sanitizeQuestionForLive(question, index),
    isProgramCorrect: question.isProgramCorrect,
    type: question.type,
    badge: question.reviewBadge,
    buggyLine: question.buggyLine,
    errorSummary: question.errorSummary,
    pythonOutput: question.pythonOutput,
    fixedCode: question.fixedCode,
    fixedLine: question.fixedLine,
    correctIndex: question.correctIndex,
    explanation: question.explanation
  };
}

// Bắt đầu câu hỏi (30s)
function startQuestion(index) {
  clearQuestionTimer();

  if (index < 0 || index >= QUESTIONS.length) {
    finishGame();
    return;
  }

  gameState.stage = 'QUESTION';
  gameState.currentQuestionIndex = index;
  gameState.currentAnswers.clear();

  for (const player of gameState.players.values()) {
    player.lastPoints = 0;
  }

  const question = QUESTIONS[index];
  gameState.remainingTime = question.timeLimit;
  gameState.questionStartTime = Date.now();

  const liveQuestionData = sanitizeQuestionForLive(question, index);
  const stats = getAnswerDistribution();

  io.emit('game:questionStart', {
    question: liveQuestionData,
    remainingTime: gameState.remainingTime,
    stats
  });

  gameState.timerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - gameState.questionStartTime) / 1000);
    const remaining = Math.max(0, question.timeLimit - elapsedSec);
    gameState.remainingTime = remaining;

    io.emit('game:timerTick', {
      remainingTime: remaining,
      timeLimit: question.timeLimit
    });

    if (remaining <= 0) {
      enterAwaitingRunStage();
    }
  }, 250);
}

// Kiểm tra xem tất cả học sinh đã chọn xong đáp án chưa để tự động kết thúc sớm
function checkAllPlayersAnswered() {
  if (gameState.stage !== 'QUESTION') return false;
  const totalRegistered = gameState.players.size;
  if (totalRegistered === 0) return false;

  const totalAnswered = gameState.currentAnswers.size;

  // Trường hợp 1: Tất cả học sinh đã tham gia phòng đều đã nộp bài
  if (totalAnswered >= totalRegistered) {
    return true;
  }

  // Trường hợp 2: Nếu có học sinh mất kết nối / thoát ra giữa chừng,
  // chỉ cần tất cả học sinh đang trực tuyến (connected) đã hoàn thành bài
  const connectedPlayers = Array.from(gameState.players.values()).filter((p) => p.connected);
  if (connectedPlayers.length > 0 && connectedPlayers.every((p) => gameState.currentAnswers.has(p.id))) {
    return true;
  }

  return false;
}

// Khi hết thời gian (hoặc tất cả HS đã chọn xong / GV bấm kết thúc sớm): Khóa trả lời và hiện nút "Chạy thử chương trình" trên màn hình GV
function enterAwaitingRunStage() {
  if (gameState.stage !== 'QUESTION') return;
  clearQuestionTimer();

  gameState.stage = 'AWAITING_RUN';
  gameState.remainingTime = 0;

  const index = gameState.currentQuestionIndex;
  const question = QUESTIONS[index];
  const stats = getAnswerDistribution();

  io.emit('game:awaitingRun', {
    question: sanitizeQuestionForLive(question, index),
    stats
  });
}

// Khi Giáo viên bấm nút "Chạy thử chương trình" -> Thực thi kiểm thử & trả về kết quả chạy Python
function executeProgramAndReview() {
  if (gameState.stage !== 'AWAITING_RUN' && gameState.stage !== 'QUESTION') return;
  clearQuestionTimer();

  gameState.stage = 'REVIEW';
  const index = gameState.currentQuestionIndex;
  const question = QUESTIONS[index];
  const reviewData = getFullQuestionForReview(question, index);
  const stats = getAnswerDistribution();
  const leaderboard = getSortedLeaderboard();

  // Gửi dữ liệu kết quả chạy code Python đầy đủ cho Host
  io.to('hosts').emit('game:questionReview', {
    question: reviewData,
    stats
  });

  // Gửi kết quả chạy code + điểm cá nhân cho từng Học sinh
  for (const player of gameState.players.values()) {
    const ans = gameState.currentAnswers.get(player.id);
    const rankInfo = leaderboard.find((item) => item.id === player.id);

    const personalResult = {
      answered: Boolean(ans),
      optionIndex: ans ? ans.optionIndex : -1,
      isCorrect: ans ? ans.isCorrect : false,
      pointsEarned: ans ? ans.points : 0,
      totalScore: player.score,
      rank: rankInfo ? rankInfo.rank : leaderboard.length,
      totalPlayers: leaderboard.length,
      correctIndex: question.correctIndex,
      correctOptionText: question.options[question.correctIndex],
      explanation: question.explanation,
      badge: question.reviewBadge,
      title: question.title,
      prompt: question.prompt,
      isProgramCorrect: question.isProgramCorrect,
      buggyCode: question.buggyCode,
      buggyLine: question.buggyLine,
      errorSummary: question.errorSummary,
      pythonOutput: question.pythonOutput,
      fixedCode: question.fixedCode,
      fixedLine: question.fixedLine
    };

    if (player.socketId) {
      io.to(player.socketId).emit('player:questionResult', personalResult);
    }
  }
}

// Chuyển sang màn hình Bảng xếp hạng (LEADERBOARD)
function showLeaderboard() {
  clearQuestionTimer();
  gameState.stage = 'LEADERBOARD';

  const leaderboard = getSortedLeaderboard();
  const top5 = leaderboard.slice(0, 5);
  const isLastQuestion = gameState.currentQuestionIndex >= QUESTIONS.length - 1;

  io.to('hosts').emit('game:leaderboard', {
    top5,
    totalPlayers: leaderboard.length,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: QUESTIONS.length,
    isLastQuestion
  });

  for (const player of gameState.players.values()) {
    const rankInfo = leaderboard.find((item) => item.id === player.id);
    if (player.socketId && rankInfo) {
      io.to(player.socketId).emit('player:leaderboardUpdate', {
        rank: rankInfo.rank,
        totalPlayers: leaderboard.length,
        score: player.score,
        lastPoints: player.lastPoints || 0,
        isLastQuestion
      });
    }
  }
}

// Chuyển sang màn hình Tổng kết bài học (FINAL STAGE)
function finishGame() {
  clearQuestionTimer();
  gameState.stage = 'FINAL';

  const leaderboard = getSortedLeaderboard();
  const top5 = leaderboard.slice(0, 5);

  io.to('hosts').emit('game:finalStage', {
    top5,
    leaderboard,
    totalPlayers: leaderboard.length,
    totalQuestions: QUESTIONS.length,
    lessonSummary: LESSON_SUMMARY
  });

  for (const player of gameState.players.values()) {
    const rankInfo = leaderboard.find((item) => item.id === player.id);
    if (player.socketId) {
      io.to(player.socketId).emit('player:finalStage', {
        rank: rankInfo ? rankInfo.rank : leaderboard.length,
        totalPlayers: leaderboard.length,
        score: player.score,
        correctCount: player.correctCount || 0,
        totalQuestions: QUESTIONS.length,
        lessonSummary: LESSON_SUMMARY
      });
    }
  }
}

// Đặt lại trò chơi về trạng thái phòng chờ ban đầu
function resetGame(keepPlayers = false) {
  clearQuestionTimer();
  gameState.stage = 'LOBBY';
  gameState.currentQuestionIndex = -1;
  gameState.questionStartTime = null;
  gameState.remainingTime = 0;
  gameState.currentAnswers.clear();

  if (keepPlayers) {
    for (const player of gameState.players.values()) {
      player.score = 0;
      player.lastPoints = 0;
      player.correctCount = 0;
      player.totalTimeMs = 0;
      player.answers = {};
    }
  } else {
    gameState.players.clear();
  }

  io.emit('game:reset', {
    keepPlayers,
    players: getPlayersArray()
  });
}

// ============================================================================
// XỬ LÝ KẾT NỐI SOCKET.IO REALTIME (CÓ PHÂN QUYỀN HOST / PLAYER)
// ============================================================================
function isAuthorizedHostSocket(socket) {
  if (!socket.data.isHost || !socket.data.hostToken) return false;
  const session = getHostSession(socket.data.hostToken);
  if (!session) {
    socket.data.isHost = false;
    socket.leave('hosts');
    return false;
  }
  return true;
}

io.on('connection', (socket) => {
  // 1. Giáo viên kết nối vào màn hình Host (Yêu cầu Token xác thực Giáo viên)
  socket.on('host:join', ({ token } = {}, callback) => {
    const session = getHostSession(token);
    if (!session) {
      socket.emit('host:unauthorized', { message: 'Vui lòng đăng nhập tài khoản Giáo viên!' });
      if (callback) callback({ ok: false, message: 'Vui lòng đăng nhập tài khoản Giáo viên!' });
      return;
    }

    socket.data.isHost = true;
    socket.data.hostToken = token;
    socket.data.role = 'TEACHER';
    socket.join('hosts');

    const leaderboard = getSortedLeaderboard();
    const currentQuestion =
      gameState.currentQuestionIndex >= 0
        ? QUESTIONS[gameState.currentQuestionIndex]
        : null;

    socket.emit('host:syncState', {
      stage: gameState.stage,
      players: getPlayersArray(),
      currentQuestionIndex: gameState.currentQuestionIndex,
      totalQuestions: QUESTIONS.length,
      remainingTime: gameState.remainingTime,
      question:
        currentQuestion && (gameState.stage === 'QUESTION' || gameState.stage === 'AWAITING_RUN')
          ? sanitizeQuestionForLive(currentQuestion, gameState.currentQuestionIndex)
          : currentQuestion && gameState.stage === 'REVIEW'
          ? getFullQuestionForReview(currentQuestion, gameState.currentQuestionIndex)
          : null,
      stats: getAnswerDistribution(),
      top5: leaderboard.slice(0, 5),
      isLastQuestion: gameState.currentQuestionIndex >= QUESTIONS.length - 1,
      lessonSummary: LESSON_SUMMARY
    });

    if (callback) {
      callback({
        ok: true,
        user: {
          username: session.username,
          role: session.role,
          displayName: session.displayName
        }
      });
    }
  });

  // 2. Học sinh đăng nhập / kết nối lại
  socket.on('player:join', ({ playerId, name, avatar }, callback) => {
    const cleanName = (name || '').trim().slice(0, 28);
    if (!cleanName) {
      if (callback) callback({ ok: false, message: 'Vui lòng nhập Họ và Tên hoặc Biệt danh!' });
      return;
    }

    const id = playerId || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let player = gameState.players.get(id);

    if (player) {
      player.socketId = socket.id;
      player.name = cleanName;
      if (avatar) player.avatar = avatar;
      player.connected = true;
    } else {
      const randomAvatar =
        avatar || AVATARS[gameState.players.size % AVATARS.length];
      player = {
        id,
        socketId: socket.id,
        name: cleanName,
        avatar: randomAvatar,
        score: 0,
        lastPoints: 0,
        correctCount: 0,
        totalTimeMs: 0,
        connected: true,
        answers: {}
      };
      gameState.players.set(id, player);
    }

    socket.data.playerId = id;
    socket.join('players');

    io.to('hosts').emit('host:playersUpdated', {
      players: getPlayersArray(),
      stats: getAnswerDistribution()
    });

    const syncPayload = buildPlayerSyncPayload(player);
    if (callback) {
      callback({
        ok: true,
        player: {
          id: player.id,
          name: player.name,
          avatar: player.avatar,
          score: player.score
        },
        sync: syncPayload
      });
    }
  });

  // 3. Học sinh gửi câu trả lời (chỉ nhận 1 lần duy nhất mỗi câu trong 45s)
  socket.on('player:submitAnswer', ({ playerId, optionIndex }, callback) => {
    if (gameState.stage !== 'QUESTION') {
      if (callback) callback({ ok: false, message: 'Đã hết thời gian trả lời câu hỏi này!' });
      return;
    }

    const id = playerId || socket.data.playerId;
    const player = gameState.players.get(id);
    if (!player) {
      if (callback) callback({ ok: false, message: 'Không tìm thấy thông tin người chơi!' });
      return;
    }

    if (gameState.currentAnswers.has(id)) {
      if (callback) callback({ ok: false, message: 'Bạn đã gửi câu trả lời cho câu hỏi này rồi!' });
      return;
    }

    const idx = Number(optionIndex);
    if (Number.isNaN(idx) || idx < 0 || idx > 3) {
      if (callback) callback({ ok: false, message: 'Đáp án không hợp lệ!' });
      return;
    }

    const question = QUESTIONS[gameState.currentQuestionIndex];
    const elapsedMs = Math.max(0, Date.now() - gameState.questionStartTime);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const maxPoints = Number(question.maxPoints) || 1000;
    const penaltyPerSecond =
      question.penaltyPerSecond !== undefined ? Number(question.penaltyPerSecond) : 10;
    const isCorrect = idx === question.correctIndex;

    let points = 0;
    if (isCorrect) {
      points = Math.max(0, maxPoints - elapsedSec * penaltyPerSecond);
      player.score += points;
      player.correctCount = (player.correctCount || 0) + 1;
    }

    player.lastPoints = points;
    player.totalTimeMs = (player.totalTimeMs || 0) + elapsedMs;
    player.answers[question.id] = { optionIndex: idx, isCorrect, points, elapsedSec };

    gameState.currentAnswers.set(id, {
      optionIndex: idx,
      timeMs: elapsedMs,
      elapsedSec,
      points,
      isCorrect
    });

    const stats = getAnswerDistribution();
    io.to('hosts').emit('host:answerStats', stats);

    if (callback) {
      callback({
        ok: true,
        optionIndex: idx,
        timeSec: (elapsedMs / 1000).toFixed(1)
      });
    }

    // Tự động kết thúc sớm khi tất cả học sinh đã chọn xong đáp án
    if (checkAllPlayersAnswered()) {
      setTimeout(() => {
        if (gameState.stage === 'QUESTION') {
          enterAwaitingRunStage();
        }
      }, 500);
    }
  });

  // 4. Các sự kiện điều khiển từ Giáo viên (Host - bắt buộc đã xác thực quyền TEACHER)
  socket.on('host:startGame', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    startQuestion(0);
  });

  socket.on('host:endQuestionEarly', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    enterAwaitingRunStage();
  });

  socket.on('host:runProgram', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    executeProgramAndReview();
  });

  socket.on('host:showLeaderboard', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    showLeaderboard();
  });

  socket.on('host:nextQuestion', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    const nextIdx = gameState.currentQuestionIndex + 1;
    if (nextIdx < QUESTIONS.length) {
      startQuestion(nextIdx);
    } else {
      finishGame();
    }
  });

  socket.on('host:showFinalStage', () => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    finishGame();
  });

  socket.on('host:resetGame', ({ keepPlayers } = {}) => {
    if (!isAuthorizedHostSocket(socket)) {
      socket.emit('host:unauthorized');
      return;
    }
    resetGame(Boolean(keepPlayers));
  });

  // 5. Xử lý khi ngắt kết nối
  socket.on('disconnect', () => {
    const playerId = socket.data.playerId;
    if (playerId && gameState.players.has(playerId)) {
      const player = gameState.players.get(playerId);
      player.connected = false;
      io.to('hosts').emit('host:playersUpdated', {
        players: getPlayersArray(),
        stats: getAnswerDistribution()
      });

      // Nếu có học sinh mất kết nối và tất cả các học sinh còn lại đang trực tuyến đã trả lời xong
      if (checkAllPlayersAnswered()) {
        setTimeout(() => {
          if (gameState.stage === 'QUESTION') {
            enterAwaitingRunStage();
          }
        }, 500);
      }
    }
  });
});

function buildPlayerSyncPayload(player) {
  const leaderboard = getSortedLeaderboard();
  const rankInfo = leaderboard.find((item) => item.id === player.id);
  const currentQuestion =
    gameState.currentQuestionIndex >= 0
      ? QUESTIONS[gameState.currentQuestionIndex]
      : null;

  if (gameState.stage === 'LOBBY') {
    return { stage: 'LOBBY' };
  }

  if ((gameState.stage === 'QUESTION' || gameState.stage === 'AWAITING_RUN') && currentQuestion) {
    const existingAnswer = gameState.currentAnswers.get(player.id);
    return {
      stage: gameState.stage,
      question: sanitizeQuestionForLive(currentQuestion, gameState.currentQuestionIndex),
      remainingTime: gameState.remainingTime,
      alreadyAnswered: Boolean(existingAnswer),
      chosenOptionIndex: existingAnswer ? existingAnswer.optionIndex : null
    };
  }

  if (gameState.stage === 'REVIEW' && currentQuestion) {
    const ans = gameState.currentAnswers.get(player.id);
    return {
      stage: 'REVIEW',
      result: {
        answered: Boolean(ans),
        optionIndex: ans ? ans.optionIndex : -1,
        isCorrect: ans ? ans.isCorrect : false,
        pointsEarned: ans ? ans.points : 0,
        totalScore: player.score,
        rank: rankInfo ? rankInfo.rank : leaderboard.length,
        totalPlayers: leaderboard.length,
        correctIndex: currentQuestion.correctIndex,
        correctOptionText: currentQuestion.options[currentQuestion.correctIndex],
        explanation: currentQuestion.explanation,
        badge: currentQuestion.reviewBadge,
        title: currentQuestion.title,
        prompt: currentQuestion.prompt,
        isProgramCorrect: currentQuestion.isProgramCorrect,
        buggyCode: currentQuestion.buggyCode,
        buggyLine: currentQuestion.buggyLine,
        errorSummary: currentQuestion.errorSummary,
        pythonOutput: currentQuestion.pythonOutput,
        fixedCode: currentQuestion.fixedCode,
        fixedLine: currentQuestion.fixedLine
      }
    };
  }

  if (gameState.stage === 'LEADERBOARD') {
    return {
      stage: 'LEADERBOARD',
      rank: rankInfo ? rankInfo.rank : leaderboard.length,
      totalPlayers: leaderboard.length,
      score: player.score,
      lastPoints: player.lastPoints || 0,
      isLastQuestion: gameState.currentQuestionIndex >= QUESTIONS.length - 1
    };
  }

  if (gameState.stage === 'FINAL') {
    return {
      stage: 'FINAL',
      rank: rankInfo ? rankInfo.rank : leaderboard.length,
      totalPlayers: leaderboard.length,
      score: player.score,
      correctCount: player.correctCount || 0,
      totalQuestions: QUESTIONS.length,
      lessonSummary: LESSON_SUMMARY
    };
  }

  return { stage: 'LOBBY' };
}

// Khởi động máy chủ
server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getBestLanIp();
  console.log('====================================================================');
  console.log('🚀 TRUY TÌM BUG - KIỂM THỬ & GỠ LỖI (BÀI 30 - TIN HỌC 10)');
  console.log('====================================================================');
  console.log(`🖥️  Màn hình Giáo viên (Host):   http://localhost:${PORT}/host`);
  console.log(`🔐 Tài khoản Giáo viên:          giaovien | Mật khẩu: tinhoc10`);
  console.log(`📱 Link Học sinh tham gia (LAN): http://${lanIp}:${PORT}/join`);
  console.log('====================================================================');
});
