/**
 * 이미지 픽셀 비교 유틸리티
 * pixelmatch를 사용하여 두 이미지의 차이를 계산합니다.
 */
import pixelmatch from "pixelmatch";

/**
 * 이미지 비교 결과 인터페이스
 */
export interface ImageComparisonResult {
  /** 다른 픽셀 수 */
  diffPixels: number;
  /** 전체 픽셀 수 */
  totalPixels: number;
  /** 차이 비율 (0-100) */
  diffPercentage: number;
  /** 매칭 여부 (threshold 기준) */
  isMatch: boolean;
  /** 차이 시각화 이미지 */
  diffImageData?: ImageData;
}

/**
 * base64 이미지 URL을 ImageData로 변환
 * @param base64Url - base64 인코딩된 이미지 URL
 * @returns ImageData와 크기 정보를 담은 Promise
 */
async function base64ToImageData(base64Url: string): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context를 가져올 수 없습니다"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);

      resolve({
        imageData,
        width: img.width,
        height: img.height,
      });
    };

    img.onerror = () => {
      reject(new Error("이미지 로드 실패"));
    };

    img.src = base64Url;
  });
}

/**
 * 두 이미지의 크기를 맞춤 (더 큰 크기에 맞춤)
 * @param imageData - 원본 ImageData
 * @param targetWidth - 목표 너비
 * @param targetHeight - 목표 높이
 * @returns 리사이즈된 ImageData
 */
function resizeImageData(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context를 가져올 수 없습니다");

  ctx.putImageData(imageData, 0, 0);

  // 새 캔버스에 리사이즈
  const resizedCanvas = document.createElement("canvas");
  resizedCanvas.width = targetWidth;
  resizedCanvas.height = targetHeight;

  const resizedCtx = resizedCanvas.getContext("2d");
  if (!resizedCtx) throw new Error("Canvas context를 가져올 수 없습니다");

  // 흰색 배경으로 채움
  resizedCtx.fillStyle = "#ffffff";
  resizedCtx.fillRect(0, 0, targetWidth, targetHeight);

  // 원본 이미지를 그림 (크기 유지, 위치는 좌상단)
  resizedCtx.drawImage(canvas, 0, 0);

  return resizedCtx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * 두 이미지를 비교합니다.
 * @param image1Url - 첫 번째 이미지 (base64 data URL)
 * @param image2Url - 두 번째 이미지 (base64 data URL)
 * @param threshold - 매칭으로 간주할 차이 비율 임계값 (기본값: 5%)
 * @returns 비교 결과를 담은 Promise
 */
export async function compareImages(
  image1Url: string,
  image2Url: string,
  threshold: number = 5
): Promise<ImageComparisonResult> {
  try {
    // 이미지 로드
    const [img1Data, img2Data] = await Promise.all([
      base64ToImageData(image1Url),
      base64ToImageData(image2Url),
    ]);

    // 크기 로그 (디버깅용)
    console.log(`🖼️ [ImageCompare] Image1: ${img1Data.width}x${img1Data.height}, Image2: ${img2Data.width}x${img2Data.height}`);

    // 크기가 다르면 더 큰 크기에 맞춤
    const maxWidth = Math.max(img1Data.width, img2Data.width);
    const maxHeight = Math.max(img1Data.height, img2Data.height);

    let pixels1 = img1Data.imageData;
    let pixels2 = img2Data.imageData;

    // 크기가 다르면 리사이즈
    if (img1Data.width !== maxWidth || img1Data.height !== maxHeight) {
      console.log(`🖼️ [ImageCompare] Resizing Image1 to ${maxWidth}x${maxHeight}`);
      pixels1 = resizeImageData(img1Data.imageData, maxWidth, maxHeight);
    }
    if (img2Data.width !== maxWidth || img2Data.height !== maxHeight) {
      console.log(`🖼️ [ImageCompare] Resizing Image2 to ${maxWidth}x${maxHeight}`);
      pixels2 = resizeImageData(img2Data.imageData, maxWidth, maxHeight);
    }

    // 차이 이미지 생성
    const diffImageData = new ImageData(maxWidth, maxHeight);

    // pixelmatch로 비교
    const diffPixels = pixelmatch(
      pixels1.data,
      pixels2.data,
      diffImageData.data,
      maxWidth,
      maxHeight,
      {
        threshold: 0.1,  // 픽셀 비교 민감도 (0-1, 낮을수록 민감)
        alpha: 0.1,      // 투명도 무시 정도
        includeAA: true, // anti-aliasing 포함
      }
    );

    const totalPixels = maxWidth * maxHeight;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    console.log(`🖼️ [ImageCompare] Result: ${diffPixels}/${totalPixels} pixels differ (${diffPercentage.toFixed(1)}%)`);

    return {
      diffPixels,
      totalPixels,
      diffPercentage,
      isMatch: diffPercentage <= threshold,
      diffImageData,
    };
  } catch (error) {
    console.error("이미지 비교 실패:", error);
    // 비교 실패 시 매칭하지 않는 것으로 처리
    return {
      diffPixels: -1,
      totalPixels: 0,
      diffPercentage: 100,
      isMatch: false,
    };
  }
}

/**
 * ImageData를 base64 data URL로 변환
 * @param imageData - 변환할 ImageData
 * @returns base64 인코딩된 PNG data URL
 */
export function imageDataToBase64(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context를 가져올 수 없습니다");

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
