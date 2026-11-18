/**
 * @OnlyCurrentDoc  — 이 스크립트가 붙어 있는 시트 하나에만 접근합니다.
 */

/**
 * 은계파크자이 작은도서관 홈페이지 · 대출반납일력표 — 설정 저장 서버 (Google Apps Script)
 *
 * - GET  : 현재 설정을 JSON으로 돌려줍니다. (누구나, 로그인 불필요)
 * - POST : PIN을 서버에서 확인한 뒤 설정을 저장합니다.
 *          { action: "verify" | "save" | "changePin" | "live" | "home", pin, ... }
 *          - live : 봉사자의 "열었어요/닫았어요" 버튼. { state, until } → home.live 만 바꿉니다.
 *          - home : 홈페이지 관리. 항목 하나씩 바꿔서 동시에 고쳐도 서로 지우지 않습니다.
 *                   { op: "add" | "remove", list: "schedule"|"notices"|"books"|"programs", item }
 *                   { op: "set", field: "volunteer"|"loanLimit", value }
 *
 * 서버 버전 2부터 홈페이지 내용(home: 일정, 공지, 새 책, 프로그램, 봉사자 모집)을 함께 저장합니다.
 *
 * 설정은 이 스크립트가 붙어 있는 구글 시트의 '설정' 탭 A1 칸에 JSON으로 저장됩니다.
 * PIN은 스크립트 속성(PIN_HASH)에 해시로만 저장되며, 처음에는 1234 입니다.
 */

const SHEET_NAME = '설정';
const DEFAULT_PIN = '1234';
const SALT = 'eungye-lib:';
const MAX_FAILS = 10;          // 10분 동안 PIN 10번 틀리면 잠시 차단
const FAIL_WINDOW_SEC = 600;
const SERVER_VERSION = 2;      // 홈페이지(home) 저장을 지원하는 버전
const TZ = 'Asia/Seoul';

const DEFAULT_SETTINGS = {
  loanDays: 7,
  closedWeekdays: [0],
  override: null,
  home: {},
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
  return json({ ok: true, version: SERVER_VERSION, settings: readSettings() });
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
      const cur = readSettings();
      const patch = Object.assign({}, body.patch || {});
      if (patch.home) {
        // 봉사자 버튼(live)은 관리자 화면이 아니라 서버 값을 유지합니다.
        patch.home = Object.assign({}, patch.home, { live: cur.home.live, updatedAt: nowStamp() });
      }
      const next = sanitize(Object.assign({}, cur, patch));
      writeSettings(next);
      return json({ ok: true, version: SERVER_VERSION, settings: next });
    }
    if (body.action === 'live') {
      const cur = readSettings();
      const state = body.state === 'open' ? 'open' : 'closed';
      const until = String(body.until || '');
      if (state === 'open' && !TIME_RE.test(until)) return json({ ok: false, error: 'bad_time' });
      cur.home.live = { date: todayStamp(), state: state, until: state === 'open' ? until : '', updatedAt: nowStamp() };
      const next = sanitize(cur);
      writeSettings(next);
      return json({ ok: true, version: SERVER_VERSION, settings: next });
    }
    if (body.action === 'home') {
      const cur = readSettings();
      const r = applyHomeOp(cur.home, body);
      if (r) return json({ ok: false, error: r });
      cur.home.updatedAt = nowStamp();
      const next = sanitize(cur);
      writeSettings(next);
      return json({ ok: true, version: SERVER_VERSION, settings: next });
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
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function todayStamp() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowStamp() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function list(a, max, fn) { return (Array.isArray(a) ? a : []).map(fn).filter(Boolean).slice(0, max); }

/** 목록마다 항목 검사 방법과 최대 개수 */
const HOME_LISTS = {
  schedule: { max: 200, clean: function (x) {
    if (!x || !DATE_RE.test(x.date) || !TIME_RE.test(x.start) || !TIME_RE.test(x.end) || x.end <= x.start) return null;
    return { date: x.date, start: x.start, end: x.end, note: str(x.note, 40) };
  } },
  notices: { max: 20, clean: function (x) {
    const title = str(x && x.title, 60);
    return title ? { date: DATE_RE.test(x.date) ? x.date : '', title: title, body: str(x.body, 300) } : null;
  } },
  books: { max: 30, clean: function (x) {
    const title = str(x && x.title, 60);
    return title ? { title: title, author: str(x.author, 40) } : null;
  } },
  programs: { max: 20, clean: function (x) {
    const title = str(x && x.title, 60);
    return title ? { title: title, when: str(x.when, 60), target: str(x.target, 40) } : null;
  } }
};

/** 관리자 화면의 변경 하나를 home에 적용합니다. 문제가 있으면 오류 이름을 돌려줍니다. */
function applyHomeOp(home, body) {
  if (body.op === 'set') {
    if (body.field === 'volunteer') { home.volunteer = body.value || {}; return null; }
    if (body.field === 'loanLimit') { home.loanLimit = body.value; return null; }
    return 'bad_request';
  }
  const spec = HOME_LISTS[body.list];
  if (!spec) return 'bad_request';
  const item = spec.clean(body.item);
  if (!item) return 'bad_item';
  const arr = home[body.list];
  const key = JSON.stringify(item);
  if (body.op === 'add') {
    if (arr.length >= spec.max) return 'full';
    if (body.list === 'notices' || body.list === 'books') arr.unshift(item); else arr.push(item);
    return null;
  }
  if (body.op === 'remove') {
    const i = arr.findIndex(function (x) { return JSON.stringify(spec.clean(x)) === key; });
    if (i >= 0) arr.splice(i, 1);
    return null;
  }
  return 'bad_request';
}

/** 홈페이지 내용(home)을 검사합니다. 모르는 값은 버리고, 글자 수를 제한합니다. */
function sanitizeHome(h) {
  h = h && typeof h === 'object' ? h : {};
  const keepFrom = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), TZ, 'yyyy-MM-dd');
  // 30일 지난 일정은 정리하고, 날짜순으로 정렬한 뒤 개수를 자릅니다.
  const schedule = list(h.schedule, 100000, function (x) {
    const c = HOME_LISTS.schedule.clean(x);
    return c && c.date >= keepFrom ? c : null;
  }).sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1; }).slice(0, HOME_LISTS.schedule.max);
  const l = h.live;
  const live = l && DATE_RE.test(l.date) && (l.state === 'open' || l.state === 'closed') && (l.state === 'closed' || TIME_RE.test(l.until))
    ? { date: l.date, state: l.state, until: l.state === 'open' ? l.until : '', updatedAt: str(l.updatedAt, 20) } : null;
  const v = h.volunteer || {};
  const limit = parseInt(h.loanLimit, 10);
  return {
    schedule: schedule,
    live: live,
    notices: list(h.notices, HOME_LISTS.notices.max, HOME_LISTS.notices.clean),
    books: list(h.books, HOME_LISTS.books.max, HOME_LISTS.books.clean),
    programs: list(h.programs, HOME_LISTS.programs.max, HOME_LISTS.programs.clean),
    volunteer: { text: str(v.text, 300), contact: str(v.contact, 100) },
    loanLimit: limit >= 1 && limit <= 50 ? limit : null,
    updatedAt: str(h.updatedAt, 20)
  };
}

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
  return { loanDays: loanDays, closedWeekdays: closedWeekdays, closedDates: closedDates, override: override, home: sanitizeHome(s.home) };
}

