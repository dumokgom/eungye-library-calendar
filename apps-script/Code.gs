/**
 * @OnlyCurrentDoc  — 이 스크립트가 붙어 있는 시트 하나에만 접근합니다.
 */

/**
 * 은계파크자이 작은도서관 대출반납일력표 — 설정 저장 서버 (Google Apps Script)
 *
 * - GET  : 현재 설정을 JSON으로 돌려줍니다. (누구나, 로그인 불필요)
 * - POST : PIN을 서버에서 확인한 뒤 설정을 저장합니다.
 *          { action: "verify" | "save" | "changePin", pin, patch?, newPin? }
 *
 * 설정은 이 스크립트가 붙어 있는 구글 시트의 '설정' 탭 A1 칸에 JSON으로 저장됩니다.
 * PIN은 스크립트 속성(PIN_HASH)에 해시로만 저장되며, 처음에는 1234 입니다.
 */

const SHEET_NAME = '설정';
const DEFAULT_PIN = '1234';
const SALT = 'eungye-lib:';
const MAX_FAILS = 10;          // 10분 동안 PIN 10번 틀리면 잠시 차단
const FAIL_WINDOW_SEC = 600;

const DEFAULT_SETTINGS = {
  loanDays: 7,
  closedWeekdays: [0],
  override: null,
  closedDates: [
    { date: '2026-12-25', name: '성탄절' },
    { date: '2027-01-01', name: '신정' },
    { date: '2027-02-06', name: '설날 연휴' },
    { date: '2027-02-07', name: '설날' },
    { date: '2027-02-08', name: '설날 연휴' },
    { date: '2027-02-09', name: '설날 대체공휴일' },
    { date: '2027-03-01', name: '삼일절' },
    { date: '2027-05-05', name: '어린이날' },
    { date: '2027-05-13', name: '부처님오신날' },
    { date: '2027-06-06', name: '현충일' },
    { date: '2027-08-15', name: '광복절' },
    { date: '2027-08-16', name: '광복절 대체공휴일' },
    { date: '2027-09-14', name: '추석 연휴' },
    { date: '2027-09-15', name: '추석' },
    { date: '2027-09-16', name: '추석 연휴' },
    { date: '2027-10-03', name: '개천절' },
    { date: '2027-10-04', name: '개천절 대체공휴일' },
    { date: '2027-10-09', name: '한글날' },
    { date: '2027-10-11', name: '한글날 대체공휴일' },
    { date: '2027-12-25', name: '성탄절' },
    { date: '2027-12-27', name: '성탄절 대체공휴일' }
  ]
};

/* ---------------- 처음 한 번 실행 ---------------- */

/** 편집기 위쪽 함수 선택 칸에서 이 'setup'을 고르고 [실행]을 누르세요.
 *  '설정' 탭에 기본값(대출 7일, 일요일 휴관, 공휴일)을 써 넣습니다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('시트에 연결되지 않은 스크립트입니다. 구글 시트에서 [확장 프로그램 → Apps Script]로 연 편집기에 붙여 넣어 주세요.');
  writeSettings(readSettings());
  SpreadsheetApp.flush();
  ss.setActiveSheet(sheet());
  Logger.log('완료: "' + ss.getName() + '" 시트의 \'' + SHEET_NAME + '\' 탭에 기본 설정을 저장했습니다. A1 칸과 3행부터의 휴관일 목록을 확인하세요.');
}

/* ---------------- HTTP ---------------- */

function doGet() {
  return json({ ok: true, settings: readSettings() });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }

  if (isBlocked()) return json({ ok: false, error: 'too_many_attempts' });
  if (!checkPin(body.pin)) {
    recordFail();
    Utilities.sleep(700);
    return json({ ok: false, error: 'wrong_pin' });
  }

  if (body.action === 'verify') return json({ ok: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (body.action === 'save') {
      const next = sanitize(Object.assign({}, readSettings(), body.patch || {}));
      writeSettings(next);
      return json({ ok: true, settings: next });
    }
    if (body.action === 'changePin') {
      const p = String(body.newPin || '');
      if (!/^\d{4,8}$/.test(p)) return json({ ok: false, error: 'bad_pin' });
      PropertiesService.getScriptProperties().setProperty('PIN_HASH', hash(p));
      return json({ ok: true });
    }
  } finally {
    lock.releaseLock();
  }
  return json({ ok: false, error: 'unknown_action' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- PIN ---------------- */

function hash(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SALT + s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function checkPin(pin) {
  if (typeof pin !== 'string' || !pin) return false;
  const stored = PropertiesService.getScriptProperties().getProperty('PIN_HASH') || hash(DEFAULT_PIN);
  return hash(pin) === stored;
}

function isBlocked() {
  return Number(CacheService.getScriptCache().get('fails') || 0) >= MAX_FAILS;
}

function recordFail() {
  const cache = CacheService.getScriptCache();
  cache.put('fails', String(Number(cache.get('fails') || 0) + 1), FAIL_WINDOW_SEC);
}

/* ---------------- Storage ---------------- */

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function readSettings() {
  const raw = sheet().getRange('A1').getValue();
  if (!raw) {
    // 비어 있으면 기본값을 바로 써 넣어 둡니다.
    const defaults = sanitize(DEFAULT_SETTINGS);
    writeSettings(defaults);
    return defaults;
  }
  try {
    return sanitize(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)));
  } catch (err) {
    return sanitize(DEFAULT_SETTINGS);
  }
}

function writeSettings(s) {
  const sh = sheet();
  sh.getRange('A1').setValue(JSON.stringify(s));
  // 사람이 보기 쉬운 휴관일 목록 (참고용, A3부터)
  sh.getRange('A3:B1000').clearContent();
  sh.getRange('A2:B2').setValues([['휴관일', '이름']]);
  const rows = s.closedDates.map(function (h) { return [h.date, h.name]; });
  if (rows.length) sh.getRange(3, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(s) {
  const loanDays = Math.min(60, Math.max(1, parseInt(s.loanDays, 10) || 7));
  const closedWeekdays = (Array.isArray(s.closedWeekdays) ? s.closedWeekdays : [])
    .map(Number).filter(function (n, i, a) { return n >= 0 && n <= 6 && a.indexOf(n) === i; })
    .slice(0, 6);
  const seen = {};
  const closedDates = (Array.isArray(s.closedDates) ? s.closedDates : [])
    .filter(function (h) { return h && DATE_RE.test(h.date) && !seen[h.date] && (seen[h.date] = true); })
    .map(function (h) { return { date: h.date, name: String(h.name || '휴관일').slice(0, 30) }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
    .slice(0, 400);
  const o = s.override;
  const override = o && DATE_RE.test(o.on) && DATE_RE.test(o.loan) && DATE_RE.test(o.due) && o.due >= o.loan
    ? { on: o.on, loan: o.loan, due: o.due } : null;
  return { loanDays: loanDays, closedWeekdays: closedWeekdays, closedDates: closedDates, override: override };
}

