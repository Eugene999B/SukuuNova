export type LocalFaceBox = {
  centerX: number;
  centerY: number;
  widthRatio: number;
  heightRatio: number;
};

export type LocalFaceGateResult = {
  acceptable: boolean;
  faceCount: number;
  confidence: number;
  message: string;
  box: LocalFaceBox | null;
};

type MediaPipeCategory = { score?: number };
type MediaPipeBox = { originX?: number; originY?: number; width?: number; height?: number };
type MediaPipeDetection = { categories?: MediaPipeCategory[]; boundingBox?: MediaPipeBox };
type MediaPipeDetectionResult = { detections?: MediaPipeDetection[] };
type MediaPipeFaceDetector = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => MediaPipeDetectionResult;
  close?: () => void;
};
type MediaPipeVisionModule = {
  FilesetResolver: { forVisionTasks: (wasmRoot: string) => Promise<unknown> };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<MediaPipeFaceDetector>;
  };
};

export type LocalFaceDetector = {
  inspect: (video: HTMLVideoElement, timestampMs: number) => LocalFaceGateResult;
  close: () => void;
};

const MEDIAPIPE_VERSION = "1.0.1";
const VISION_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const VISION_WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

function finite(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function assessLocalFaceDetections(result: MediaPipeDetectionResult, frameWidth: number, frameHeight: number): LocalFaceGateResult {
  const detections = result.detections ?? [];
  if (detections.length === 0) return { acceptable: false, faceCount: 0, confidence: 0, message: "No face yet — keep one face clearly visible.", box: null };
  if (detections.length > 1) return { acceptable: false, faceCount: detections.length, confidence: 0, message: "Only one person should be in the portrait.", box: null };

  const detection = detections[0];
  const bounds = detection.boundingBox;
  if (!bounds || frameWidth <= 0 || frameHeight <= 0) return { acceptable: false, faceCount: 1, confidence: 0, message: "Face position could not be measured yet.", box: null };

  const confidence = finite(detection.categories?.[0]?.score);
  const width = finite(bounds.width);
  const height = finite(bounds.height);
  const originX = finite(bounds.originX);
  const originY = finite(bounds.originY);
  const widthRatio = width / frameWidth;
  const heightRatio = height / frameHeight;
  const centerX = (originX + width / 2) / frameWidth;
  const centerY = (originY + height / 2) / frameHeight;
  const box = { centerX, centerY, widthRatio, heightRatio };

  if (confidence < 0.7) return { acceptable: false, faceCount: 1, confidence, message: "Face is not clear enough yet — improve the light or face the camera.", box };
  if (widthRatio < 0.18 || heightRatio < 0.18) return { acceptable: false, faceCount: 1, confidence, message: "Move a little closer so the face is clear.", box };
  if (widthRatio > 0.7 || heightRatio > 0.78) return { acceptable: false, faceCount: 1, confidence, message: "Move back slightly so the head and shoulders fit comfortably.", box };
  if (centerX < 0.28 || centerX > 0.72 || centerY < 0.23 || centerY > 0.63) return { acceptable: false, faceCount: 1, confidence, message: "Center the face inside the portrait guide.", box };

  return { acceptable: true, faceCount: 1, confidence, message: "Face framed well — hold still for automatic capture.", box };
}

export function faceBoxesAreStable(previous: LocalFaceBox | null, current: LocalFaceBox | null) {
  if (!previous || !current) return false;
  return Math.abs(previous.centerX - current.centerX) <= 0.045
    && Math.abs(previous.centerY - current.centerY) <= 0.045
    && Math.abs(previous.widthRatio - current.widthRatio) <= 0.055
    && Math.abs(previous.heightRatio - current.heightRatio) <= 0.055;
}

async function importVisionModule() {
  const moduleUrl = VISION_MODULE_URL;
  return await import(/* webpackIgnore: true */ moduleUrl) as unknown as MediaPipeVisionModule;
}

export async function createLocalFaceDetector(): Promise<LocalFaceDetector> {
  const vision = await importVisionModule();
  if (!vision?.FilesetResolver?.forVisionTasks || !vision?.FaceDetector?.createFromOptions) throw new Error("On-device face detection could not be loaded.");
  const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_ROOT);
  let detector: MediaPipeFaceDetector;
  try {
    detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.7,
      minSuppressionThreshold: 0.3,
    });
  } catch {
    detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.7,
      minSuppressionThreshold: 0.3,
    });
  }

  return {
    inspect(video, timestampMs) {
      return assessLocalFaceDetections(detector.detectForVideo(video, timestampMs), video.videoWidth, video.videoHeight);
    },
    close() {
      detector.close?.();
    },
  };
}
