# 은계파크자이 작은도서관 대출반납일력표

도서관 태블릿에 띄워 두는 대출일·반납일 안내 화면입니다.

- 일력표: https://dumokgom.github.io/eungye-library-calendar/
- 관리자: https://dumokgom.github.io/eungye-library-calendar/#admin (PIN 필요)

## 동작 방식
- 대출일은 오늘, 반납일은 오늘 + 대출 기간(기본 7일)입니다. 반납일이 휴관일이면 다음 개관일로 자동 연기됩니다.
- 관리자 화면에서 오늘만 적용되는 날짜 수정, 대출 기간, 휴관 요일, 휴관일, PIN을 바꿀 수 있습니다.
- 설정은 구글 시트(Apps Script 웹 앱)에 저장되고, PIN은 그 서버에서 확인합니다.

## 파일
| 파일 | 내용 |
|---|---|
| `index.html` | 일력표·관리자 화면 (GitHub Pages로 공개) |
| `apps-script/Code.gs` | 구글 시트에 붙여 넣는 저장 서버 코드 |
| `apps-script/설정방법.md` | 구글 시트·웹 앱 설정 안내 |

## 수정하고 반영하기
- `index.html`을 고쳐 `main` 브랜치에 올리면 1~2분 뒤 사이트에 반영됩니다.
- `Code.gs`를 고친 뒤에는 Apps Script 편집기에 붙여 넣고 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 합니다. (웹 앱 주소는 그대로)
