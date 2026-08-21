# 이미지 필터 웹앱

커머스/MD 업무에서 상품 이미지를 빠르게 규격화하기 위한 React 기반 내부 이미지 제작 도구입니다. 브라우저에서 대표이미지 생성, 일괄 처리, 사은품 합성, 누끼컷 생성, 가이드 확인, 관리자 설정 저장까지 수행할 수 있도록 구성했습니다.

## 주요 기능

- 대표이미지 생성
- 대표이미지 일괄변경
- 사은품 이미지 생성
- 누끼컷 생성
- 가이드보기
- 관리자 페이지
- ZIP 일괄 다운로드
- 관리자 설정 `localStorage` 저장
- 가이드 파일 `IndexedDB` 저장

## 기술 스택

- React 19
- TypeScript
- Vite
- React Router
- CSS
- HTML Canvas API
- `@bunnio/rembg-web`
- `onnxruntime-web`
- `JSZip`
- `idb-keyval`

## 설치 방법

```bash
npm install
```

## 실행 방법

```bash
npm run dev
```

## 빌드 방법

```bash
npm run build
```

## 배포 방법

이 프로젝트는 정적 Vite 앱이라 무료 정적 호스팅에 배포할 수 있습니다. 다만 `public/models` 아래의 ONNX 모델 파일이 매우 커서, 호스팅 서비스의 파일 크기 제한에 따라 앱 본체와 모델 파일을 분리하는 구성이 필요할 수 있습니다.

### Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- 권장 방식: 앱은 Cloudflare Pages, 모델 파일은 별도 스토리지

`VITE_MODEL_BASE_URL` 환경 변수를 설정하면 누끼 모델 파일을 외부 주소에서 불러올 수 있습니다.

예시:

```bash
VITE_MODEL_BASE_URL=https://<your-model-host>/models npm run build
```

환경 변수를 지정하지 않으면 기본값으로 현재 사이트의 `/models` 경로를 사용합니다.

### GitHub Pages / Vercel / Netlify

- 모두 정적 배포 자체는 가능
- 단, 대용량 모델 파일 제한은 각 서비스 정책을 따르므로 사전 확인 필요
- 제한이 있는 경우 Cloudflare Pages와 동일하게 앱과 모델 파일을 분리하는 것이 안전합니다

## 이미지 배경제거 기술 설명

이 프로젝트는 브라우저 내에서 동작하는 `@bunnio/rembg-web`과 `onnxruntime-web` 조합을 사용합니다. 정적 배포 환경에서도 동작하도록 모델 파일을 `public/models` 아래에서 직접 서빙할 수 있고, 필요하면 `VITE_MODEL_BASE_URL`로 외부 모델 호스트를 지정할 수도 있습니다. 첫 실행 시 모델 초기화 시간이 있으며 이후 브라우저 캐시 영향을 받습니다.

## 관리자 데이터 저장 방식

- 대표이미지/사은품 기본 설정: `localStorage`
- 가이드 파일 업로드 정보와 바이너리: `IndexedDB` (`idb-keyval`)

현재 MVP 특성상 저장 데이터는 업로드한 브라우저 안에만 보존됩니다.

## 사용한 오픈소스 라이선스

- React: MIT
- React DOM: MIT
- React Router DOM: MIT
- Vite: MIT
- TypeScript: Apache-2.0
- Lucide React: ISC
- JSZip: MIT or GPL-3.0-or-later
- idb-keyval: Apache-2.0
- `@bunnio/rembg-web`: MIT
- `onnxruntime-web`: MIT
- U²-Net / U2NetP 모델 계열: Apache-2.0

라이선스 정책은 2026년 8월 14일 기준 공개 문서를 기준으로 정리했습니다. `JSZip`은 이중 라이선스 표기를 갖고 있으므로 조직 정책에 맞춰 검토하는 것이 안전합니다.

## 현재 MVP의 한계

- 브라우저 성능과 메모리에 따라 누끼 처리 속도가 크게 달라질 수 있습니다.
- `u2netp` 경량 모델은 빠르지만 복잡한 배경에서는 완벽하지 않을 수 있습니다.
- 관리자 데이터와 가이드 파일은 브라우저 로컬 저장이므로 기기 간 동기화되지 않습니다.
- 대량 배치 작업은 서버 방식보다 느릴 수 있으며, 저사양 환경에서는 탭 메모리 사용량이 커질 수 있습니다.
- 현재 배치 처리는 큐 기반 비동기 처리이며, 별도 Web Worker 분리는 후속 최적화 여지가 있습니다.

## 프로젝트 구조

```text
src/
  components/
  hooks/
  pages/
  services/
  types/
  utils/
```
