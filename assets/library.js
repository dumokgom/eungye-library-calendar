/*
 * 은계파크자이 작은도서관 — 홈페이지와 일력표가 함께 쓰는 계산 코드
 * - 서울 시간, 날짜 계산
 * - "오늘 여는지" 문패 판단 (PLAN.md 6장)
 * - 이번 주 여는 날 7칸
 * 화면에 그리는 일은 각 페이지가 해요. 여기에는 계산만 있어요.
 */
(function () {
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");

  // 확인용: 주소에 ?now=2026-11-18T15:00 을 붙이면 그 시각으로 계산해요.
  const testNow = new URLSearchParams(location.search).get("now");
  function seoulNow() {
    if (testNow && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(testNow)) return { date: testNow.slice(0, 10), time: testNow.slice(11, 16) };
    const parts = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }

  const toUTC = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const wday = (s) => toUTC(s).getUTCDay();
  const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
  const hm = (t) => { const [h, m] = t.split(":").map(Number); return m ? `${h}시 ${m}분` : `${h}시`; };
  const hShort = (t) => { const [h, m] = t.split(":").map(Number); return m ? `${h}:${pad(m)}` : `${h}`; };
  // 정시면 "14–17시", 분이 있으면 "16:30–18:40"
  const slotShort = (s) => (s.start.endsWith(":00") && s.end.endsWith(":00")) ? `${hShort(s.start)}–${hShort(s.end)}시` : `${hShort(s.start)}–${hShort(s.end)}`;
  const mdw = (s) => { const d = toUTC(s); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WD[d.getUTCDay()]})`; };
  function dayName(s, today) {
    const n = diffDays(today, s);
    if (n === 0) return "오늘";
    if (n === 1) return "내일";
    if (n > 1 && n < 7) return `${WD[wday(s)]}요일`;
    return mdw(s);
  }
  const clock = (stamp) => (stamp && stamp.length >= 16 ? stamp.slice(11, 16) : "");
  // "오늘 11:20 업데이트" / "어제 18:05 업데이트" / "11월 10일 (화) 업데이트"
  function stampText(stamp, today) {
    if (!stamp || stamp.length < 16) return "";
    const d = stamp.slice(0, 10), t = stamp.slice(11, 16);
    const n = diffDays(d, today);
    const when = n === 0 ? `오늘 ${t}` : n === 1 ? `어제 ${t}` : mdw(d);
    return `${when} 업데이트`;
  }

  const homeOf = (settings) => (settings && settings.home) || {};
  const scheduleOf = (settings) => (Array.isArray(homeOf(settings).schedule) ? homeOf(settings).schedule : []);

  function closedReason(settings, date) {
    const hol = (settings.closedDates || []).find((h) => h.date === date);
    if (hol) return hol.name || "휴관일";
    if ((settings.closedWeekdays || []).includes(wday(date))) return `${WD[wday(date)]}요일 휴관`;
    return null;
  }
  const slotsOn = (settings, date) => scheduleOf(settings).filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start));

  function nextOpening(settings, now, includeTodayAfter) {
    const list = scheduleOf(settings)
      .filter((s) => !closedReason(settings, s.date) && (s.date > now.date || (includeTodayAfter && s.date === now.date && s.start > now.time)))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return list[0] || null;
  }
  function nextText(settings, now, includeTodayAfter) {
    const n = nextOpening(settings, now, includeTodayAfter);
    return n ? `다음은 ${dayName(n.date, now.date)} ${hm(n.start)}` : "다음 일정은 곧 알려 드릴게요";
  }

  /** 문패 판단 (PLAN.md 6장). kind: open | planned | closed */
  function status(settings, now) {
    const home = homeOf(settings);
    const live = home.live;
    const liveToday = !!(live && live.date === now.date);
    const liveAt = liveToday ? clock(live.updatedAt) : "";
    const stamp = stampText(home.updatedAt, now.date);
    const basis = (s) => [s, stamp].filter(Boolean).join(" · ");
    // 1. 봉사자가 연 시간 안
    if (liveToday && live.state === "open" && now.time < live.until) {
      return { kind: "open", title: "지금 열려 있어요", sub: `오늘 ${hm(live.until)}까지`, note: `봉사자가 ${liveAt}에 열었어요` };
    }
    // 2. 일력표 휴관일
    const reason = closedReason(settings, now.date);
    if (reason) {
      return { kind: "closed", title: "오늘은 쉬어요", sub: `${reason} · ${nextText(settings, now, false)}`, note: stamp };
    }
    // 3. 오늘 일정 — 봉사자가 버튼을 누른 뒤에 시작하는 일정만 살아 있어요
    const slots = slotsOn(settings, now.date).filter((s) => !liveAt || s.start > liveAt);
    const cur = slots.find((s) => s.start <= now.time && now.time < s.end);
    if (cur) return { kind: "open", title: "지금 열려 있어요", sub: `오늘 ${hm(cur.end)}까지`, note: basis("일정표 기준") };
    const later = slots.find((s) => s.start > now.time);
    if (later) return { kind: "planned", title: `오늘 ${hm(later.start)}에 열어요`, sub: `${later.start} – ${later.end}`, note: basis("일정표 기준") };
    // 4. 봉사자가 닫았거나, 열었던 시간이 끝남
    if (liveToday && live.state === "closed") {
      return { kind: "closed", title: "지금은 닫았어요", sub: nextText(settings, now, true), note: `봉사자가 ${liveAt}에 닫았어요` };
    }
    if (liveToday) {
      return { kind: "closed", title: "오늘은 끝났어요", sub: nextText(settings, now, false), note: `봉사자가 ${liveAt}에 열고 ${hm(live.until)}까지 있었어요` };
    }
    // 5. 오늘 일정이 끝났거나 없음
    if (slotsOn(settings, now.date).length) return { kind: "closed", title: "오늘은 끝났어요", sub: nextText(settings, now, false), note: basis("일정표 기준") };
    return { kind: "closed", title: "오늘은 쉬어요", sub: nextText(settings, now, false), note: stamp };
  }

  /** 오늘부터 7일: [{ date, day, wd, isToday, reason, slots, text, label }] */
  function week(settings, now) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(now.date, i);
      const reason = closedReason(settings, date);
      const slots = reason ? [] : slotsOn(settings, date);
      out.push({
        date,
        day: String(toUTC(date).getUTCDate()),
        wd: i === 0 ? "오늘" : WD[wday(date)],
        isToday: i === 0,
        reason,
        slots,
        text: reason ? "쉬어요" : slots.length ? slots.map(slotShort).join("\n") : "–",
        label: `${mdw(date)} ${reason || (slots.length ? slots.map((s) => `${s.start}–${s.end}`).join(", ") : "여는 일정 없음")}`,
      });
    }
    return out;
  }

  window.EungyeLib = { WD, pad, seoulNow, toUTC, addDays, wday, diffDays, hm, hShort, slotShort, mdw, dayName, clock, stampText, closedReason, slotsOn, nextOpening, nextText, status, week };
})();
