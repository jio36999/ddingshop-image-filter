$ErrorActionPreference = "Stop"
Set-Location "C:\Users\admin\Documents\띵샵 이미지 필터 웹앱제작"
npm.cmd run build
python -m http.server 4173 --directory dist --bind 127.0.0.1
