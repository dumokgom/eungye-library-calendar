# 은계파크자이 작은도서관 홈페이지 · 대출반납일력표

봉사자가 운영하는 작은도서관의 홈페이지입니다. 운영시간이 불규칙해서, 오늘 지금 열려 있는지와 다음에 언제 여는지를 가장 먼저 보여 줍니다.

| 주소 | 내용 |
|---|---|
| https://dumokgom.github.io/eungye-library-calendar/ | 홈페이지 |
| https://dumokgom.github.io/eungye-library-calendar/#open | 봉사자용 "열었어요 / 닫았어요" (PIN 필요) |
| https://dumokgom.github.io/eungye-library-calendar/#admin | 홈페이지 관리: 여는 날 일정, 공지, 새 책, 프로그램, 봉사자 모집 (PIN 필요) |
| https://dumokgom.github.io/eungye-library-calendar/calendar/ | 대출반납일력표 (도서관 태블릿용) |
| https://dumokgom.github.io/eungye-library-calendar/calendar/#admin | 일력표 관리: 대출 기간, 휴관일, PIN (PIN 필요) |

> 도서관 태블릿에 저장된 일력표 주소는 `…/calendar/`로 바꿔 주세요.

## 문패(오늘 여는지)는 이렇게 정해져요
1. 봉사자가 `#open`에서 **열었어요**를 누르고 고른 시각 전이면 → 지금 열려 있어요
2. 일력표 휴관일(휴관 요일·휴관일)이면 → 오늘은 쉬어요
3. 관리 화면의 **여는 날 일정** 중 봉사자가 버튼을 누른 뒤에 시작하는 일정이 있으면 → 시간에 따라 열어요 / 열려 있어요
4. 봉사자가 **닫았어요**를 눌렀으면 → 지금은 닫았어요, 열었던 시간이 지났으면 → 오늘은 끝났어요
5. 그 밖에는 → 오늘은 끝났어요 / 오늘은 쉬어요 · 다음 일정 안내

자세한 기획은 [PLAN.md](PLAN.md)에 있습니다.

## 파일
| 파일 | 내용 |
|---|---|
| `index.html` | 홈페이지 · 봉사자 화면 · 홈페이지 관리 |
| `calendar/index.html` | 일력표 · 일력표 관리 |
| `assets/mascot.png` | 마스코트 그림 |
| `apps-script/Code.gs` | 구글 시트에 붙여 넣는 저장 서버 코드 (홈페이지와 일력표가 함께 씀) |
| `apps-script/설정방법.md` | 구글 시트·웹 앱 설정 안내 |

## 수정하고 반영하기
- `index.html`이나 `calendar/index.html`을 고쳐 `main` 브랜치에 올리면 1~2분 뒤 사이트에 반영됩니다.
- `Code.gs`를 고친 뒤에는 Apps Script 편집기에 붙여 넣고 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 합니다. (웹 앱 주소는 그대로) 홈페이지 관리 화면에도 같은 안내와 복사 버튼이 있습니다.
