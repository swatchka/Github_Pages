# YOONSUNG ARCHIVE — React + Vite GitHub Pages Gallery

GIF와 이미지를 전시하는 블루 아카이브 스타일의 **React + Vite** 갤러리 페이지입니다.

## 폴더 구조

```text
.
├── .github/workflows/deploy.yml   # GitHub Pages 자동 빌드·배포 워크플로우
├── public/
│   └── assets/images/             # 실제 GIF, PNG, JPG, WebP, SVG 파일 보관 폴더
├── src/
│   ├── data/gallery.json          # 게시할 GIF/이미지 목록 데이터 (수정 시 즉시 HMR 반영)
│   ├── App.jsx                    # 메인 상태 및 레이아웃
│   ├── components/
│   │   ├── Header.jsx             # 헤더 & 필터 & 상단 버튼 슬롯
│   │   ├── GalleryCard.jsx        # 미디어 카드 & 카드 버튼 슬롯
│   │   └── Lightbox.jsx           # 전체화면 미리보기 & 모달 버튼 슬롯
│   ├── styles/theme.css           # 블루 아카이브 스타일시트
│   └── utils/media.js             # 미디어 타입/경로 유틸리티
├── index.html
├── package.json
└── vite.config.js
```

## 로컬 개발 서버 실행

```powershell
npm install
npm run dev
```

## 새 GIF / 이미지 추가하는 방법

1. `public/assets/images/` 폴더에 올리고 싶은 `.gif`, `.png`, `.jpg`, `.webp` 파일을 넣습니다.
2. `src/data/gallery.json`의 `"items"` 배열에 항목을 추가합니다:

```json
{ "file": "assets/images/my-cool.gif" }
```

## GitHub Pages 배포 설정

1. `feature` 또는 `main` 브랜치로 푸시하면 `.github/workflows/deploy.yml`이 자동 실행됩니다.
2. 저장소의 **Settings → Pages → Build and deployment**에서 Source를 **GitHub Actions**로 선택해 두면 배포가 완료됩니다.
