# Cloudflare Pages + R2 배포 가이드

이 프로젝트는 앱 본체와 누끼 모델 파일을 분리해서 배포하는 구성을 권장합니다.

- 앱 본체: Cloudflare Pages
- 모델 파일: Cloudflare R2

이 구성을 쓰면 Pages의 대용량 파일 제한을 피하면서 무료 범위 안에서 운영하기 좋습니다.

## 1. R2 버킷 만들기

Cloudflare 대시보드에서 `R2` 버킷을 생성합니다.

예시 버킷 이름:

- `ddingshop-image-filter-models`

## 2. 모델 파일 업로드

로컬 프로젝트의 `public/models` 폴더 안 파일을 R2에 그대로 업로드합니다.

업로드 대상:

- `isnet-general-use.onnx`
- `u2net.onnx`
- `u2netp.onnx`
- `ort-wasm-simd-threaded.mjs`
- `ort-wasm-simd-threaded.wasm`
- `ort-wasm-simd-threaded.jsep.mjs`
- `ort-wasm-simd-threaded.jsep.wasm`

R2 안 최종 경로 예시:

- `models/isnet-general-use.onnx`
- `models/u2net.onnx`
- `models/u2netp.onnx`
- `models/ort-wasm-simd-threaded.mjs`
- `models/ort-wasm-simd-threaded.wasm`
- `models/ort-wasm-simd-threaded.jsep.mjs`
- `models/ort-wasm-simd-threaded.jsep.wasm`

즉, R2 안에서도 `models/` 폴더 구조를 유지하는 방식이 가장 안전합니다.

## 3. R2 공개 주소 준비

R2 버킷의 공개 접근 또는 커스텀 도메인을 연결합니다.

예시:

- `https://pub-xxxxxxxx.r2.dev/models`
- `https://static.example.com/models`

중요:

- 최종 주소는 `models` 폴더를 가리켜야 합니다.
- 코드에서는 이 주소를 `VITE_MODEL_BASE_URL`로 받습니다.

## 4. Cloudflare Pages 환경 변수 설정

Pages 프로젝트의 환경 변수에 아래 값을 추가합니다.

```text
VITE_MODEL_BASE_URL=https://pub-xxxxxxxx.r2.dev/models
```

## 5. Pages 빌드 설정

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

## 6. 로컬 테스트 방법

배포 전 로컬에서 외부 모델 주소를 시험하려면 `.env.local` 파일을 만들어 값을 넣습니다.

```text
VITE_MODEL_BASE_URL=https://pub-xxxxxxxx.r2.dev/models
```

그 다음:

```bash
npm run build
```

또는 개발 서버:

```bash
npm run dev
```

## 7. 문제 생길 때 확인할 것

- R2에 파일명이 정확히 일치하는지
- `models/` 경로가 빠지지 않았는지
- `.onnx`, `.wasm`, `.mjs` 파일이 모두 공개 접근 가능한지
- Pages 환경 변수에 오타가 없는지
- 누끼컷 생성 페이지에서 모델 로드 실패 메시지가 뜨는지

## 8. 현재 프로젝트 기준 영향 범위

- `누끼컷 생성`은 외부 모델 주소를 사용할 수 있습니다.
- 대표이미지/사은품 영역의 기존 배치와 설정 로직은 이 문서 작업만으로 바뀌지 않습니다.
- 실험용 누끼 로직은 현재 `누끼컷 생성` 탭에만 적용되도록 분리되어 있습니다.
