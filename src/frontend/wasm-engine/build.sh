#!/bin/bash

# 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔨 Building Engine.cpp with Emscripten...${NC}"

# 경로 설정
VCPKG_INCLUDE="/Users/namhyeon-u/Desktop/________/vcpkg/installed/arm64-osx/include"
SOURCE_FILE="src/Engine.cpp"
OUTPUT_DIR="build"
OUTPUT_FILE="Engine"

# 출력 디렉토리 생성
mkdir -p $OUTPUT_DIR

# Emscripten 빌드
em++ \
  -std=c++17 \
  -I"$VCPKG_INCLUDE" \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME="'createEngine'" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT='web' \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -O3 \
  "$SOURCE_FILE" \
  -o "$OUTPUT_DIR/$OUTPUT_FILE.js"

# 빌드 결과 확인
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Build successful!${NC}"
  echo -e "${GREEN}📦 Output: $OUTPUT_DIR/$OUTPUT_FILE.js${NC}"
  echo -e "${GREEN}📦 Output: $OUTPUT_DIR/$OUTPUT_FILE.wasm${NC}"
else
  echo -e "${RED}❌ Build failed!${NC}"
  exit 1
fi

