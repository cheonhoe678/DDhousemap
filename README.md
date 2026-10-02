# 든든전세 지도

HUG 든든전세의 주소·전용면적·보증금·신청자 수와 KB부동산의 공개 지도 좌표를 결합해 비교하는 로컬 웹앱입니다. 모집 차수, 지역, 시·군·구, 평수, 보증금으로 주택을 걸러보고 HUG 상세 신청 페이지로 이동할 수 있습니다.

별도의 지도 API 키는 필요하지 않습니다.

## 실행에 필요한 환경

- Windows 10 또는 Windows 11
- [Node.js](https://nodejs.org/) LTS 버전 권장(Node.js 20 이상)
- npm(Node.js 설치 시 함께 설치됨)
- Chrome, Edge 등 최신 웹 브라우저
- 인터넷 연결
  - 첫 실행 시 npm 패키지 설치
  - OpenStreetMap 지도 타일 표시
  - HUG·KB 최신 데이터 갱신 시 필요

Git은 실행에 필요하지 않습니다. GitHub에서 ZIP 파일로 내려받아도 실행할 수 있습니다.

## 가장 간단한 실행 방법

1. GitHub에서 프로젝트를 ZIP으로 내려받습니다.
2. ZIP 압축을 풉니다.
3. 폴더 안의 `실행.bat`을 더블클릭합니다.
4. 첫 실행 시 필요한 패키지를 자동 설치합니다.
5. 브라우저에서 <http://127.0.0.1:4173>이 자동으로 열립니다.

Windows가 실행 여부를 물으면 파일 내용을 확인한 뒤 실행을 선택하세요. 서버를 종료하려면 열린 명령 프롬프트 창에서 `Ctrl+C`를 누릅니다.

## 터미널에서 실행

```powershell
cd "프로젝트를 받은 경로\hug-jeonse-map"
npm install
npm start
```

브라우저에서 <http://127.0.0.1:4173>을 엽니다.

최신 주택 정보를 다시 수집하려면 다음 명령을 실행합니다.

```powershell
npm run refresh
```

수집 후 서버가 이미 실행 중이면 브라우저를 새로고침합니다. 화면의 새로고침 버튼으로도 갱신할 수 있으며 약 1분 정도 걸릴 수 있습니다.

## 기술 스택

| 구분 | 기술 | 역할 |
|---|---|---|
| 런타임 | Node.js 20+ | 로컬 서버와 데이터 수집 스크립트 실행 |
| 서버 | Express 5 | 정적 화면·데이터 제공, 새로고침 API 처리 |
| 수집 | Node.js Fetch API | HUG 목록과 KB 공개 지도 응답 요청 |
| HTML 분석 | Cheerio | HUG HTML 표에서 주택 정보 추출 |
| 프런트엔드 | HTML, CSS, Vanilla JavaScript | 검색, 필터, 정렬, 반응형 UI |
| 지도 | Leaflet 1.9.4 | 지도와 주택 마커 렌더링 |
| 지도 타일 | OpenStreetMap | 배경 지도 제공 |
| 데이터 저장 | JSON | 차수별로 수집한 주택과 좌표를 `public/data.json`에 보관 |

React나 별도의 데이터베이스는 사용하지 않습니다.

## Git 없이 GitHub 웹사이트로 올리기

1. GitHub 웹사이트에서 새 저장소를 만듭니다.
2. 저장소 화면에서 `Add file` → `Upload files`를 선택합니다.
3. 이 프로젝트 폴더의 파일과 폴더를 업로드합니다.
4. 아래의 `올려야 하는 항목`이 저장소 최상위에 보이는지 확인합니다.
5. 변경 설명을 입력하고 `Commit changes`를 누릅니다.

### 올려야 하는 항목

```text
public/
scripts/
.gitignore
package.json
package-lock.json
README.md
server.mjs
실행.bat
```

`public/data.json`도 반드시 올려야 내려받은 사람이 별도 수집 없이 바로 지도를 볼 수 있습니다.

### 올리지 말아야 하는 항목

```text
node_modules/
server.out.log
server.err.log
preview*.png
```

`node_modules`는 파일이 매우 많고 `npm install`로 다시 생성되므로 업로드하지 않습니다. `.gitignore`가 Git 사용 시 이를 자동으로 제외하지만, 웹사이트에서 직접 업로드할 때는 사용자가 직접 빼야 합니다.

## 데이터 갱신 원리

1. HUG 최신 모집의 전체 페이지를 읽어 주소·면적·보증금·신청자 수를 추출합니다.
2. KB부동산의 공개 지도 응답에서 주택 좌표를 가져옵니다.
3. HUG 상세번호를 기준으로 두 데이터를 결합합니다.
4. 기존 차수는 보존하고 최신 차수만 갱신해 `public/data.json`에 저장합니다.

원본 사이트의 HTML이나 요청 방식이 바뀌면 수집 코드도 수정해야 할 수 있습니다.

## 데이터 출처

- 주택 정보: HUG 안심전세포털 `모집공고 및 입주신청`
- 좌표: KB부동산 `HUG 든든전세주택` 공개 지도 데이터
- 배경 지도: OpenStreetMap

공식 신청 전에는 반드시 HUG 상세 페이지와 등기부등본·건축물대장을 다시 확인하세요.
