export type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];
export type Matrix4 = [[number, number, number, number], [number, number, number, number], [number, number, number, number], [number, number, number, number]];

export interface IntrinsicsInput {
  imageWidthPx: number; imageHeightPx: number; focalLengthMm: number;
  sensorWidthMm: number; sensorHeightMm: number; principalX: number; principalY: number;
  k1: number; k2: number;
}
export const DEFAULT_INTRINSICS: IntrinsicsInput = { imageWidthPx: 640, imageHeightPx: 480, focalLengthMm: 35, sensorWidthMm: 36, sensorHeightMm: 24, principalX: 320, principalY: 240, k1: 0, k2: 0 };

export const computeIntrinsics = (input: IntrinsicsInput) => {
  if (![input.imageWidthPx, input.imageHeightPx, input.focalLengthMm, input.sensorWidthMm, input.sensorHeightMm, input.principalX, input.principalY, input.k1, input.k2].every(Number.isFinite) || [input.imageWidthPx, input.imageHeightPx, input.focalLengthMm, input.sensorWidthMm, input.sensorHeightMm].some((value) => value <= 0)) {
    return { valid: false as const, error: 'Image, focal, and sensor dimensions must be positive.', fx: 0, fy: 0, horizontalFovDegrees: 0, verticalFovDegrees: 0, K: [[0, 0, 0], [0, 0, 0], [0, 0, 1]] as Matrix3 };
  }
  const fx = input.focalLengthMm / input.sensorWidthMm * input.imageWidthPx;
  const fy = input.focalLengthMm / input.sensorHeightMm * input.imageHeightPx;
  const horizontalFovDegrees = 2 * Math.atan(input.sensorWidthMm / (2 * input.focalLengthMm)) * 180 / Math.PI;
  const verticalFovDegrees = 2 * Math.atan(input.sensorHeightMm / (2 * input.focalLengthMm)) * 180 / Math.PI;
  return { valid: true as const, error: null, fx, fy, horizontalFovDegrees, verticalFovDegrees, K: [[fx, 0, input.principalX], [0, fy, input.principalY], [0, 0, 1]] as Matrix3 };
};

export const distortNormalizedPoint = ([x, y]: [number, number], k1: number, k2: number): [number, number] => {
  const r2 = x * x + y * y;
  const scale = 1 + k1 * r2 + k2 * r2 * r2;
  return [x * scale, y * scale];
};

export interface ExtrinsicsInput { camera: [number, number, number]; yawDegrees: number; pitchDegrees: number; rollDegrees: number; object: [number, number, number] }
export const DEFAULT_EXTRINSICS: ExtrinsicsInput = { camera: [0, 0, 0], yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, object: [0, 0, 3] };
const multiply3 = (matrix: Matrix3, vector: [number, number, number]): [number, number, number] => matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]) as [number, number, number];
const multiplyMatrices = (a: Matrix3, b: Matrix3): Matrix3 => a.map((row) => b[0].map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0))) as Matrix3;

export const computeExtrinsics = (input: ExtrinsicsInput, intrinsicsInput: IntrinsicsInput) => {
  if (![...input.camera, input.yawDegrees, input.pitchDegrees, input.rollDegrees, ...input.object].every(Number.isFinite)) {
    return { valid: false as const, error: 'Camera and object pose values must be finite.', viewPoint: [0, 0, 0] as [number, number, number], pixel: null, matrix: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] as Matrix4 };
  }
  const intrinsics = computeIntrinsics(intrinsicsInput);
  const radians = [input.yawDegrees, input.pitchDegrees, input.rollDegrees].map((value) => -value * Math.PI / 180);
  const [yaw, pitch, roll] = radians;
  const ry: Matrix3 = [[Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0], [-Math.sin(yaw), 0, Math.cos(yaw)]];
  const rx: Matrix3 = [[1, 0, 0], [0, Math.cos(pitch), -Math.sin(pitch)], [0, Math.sin(pitch), Math.cos(pitch)]];
  const rz: Matrix3 = [[Math.cos(roll), -Math.sin(roll), 0], [Math.sin(roll), Math.cos(roll), 0], [0, 0, 1]];
  const rotation = multiplyMatrices(rz, multiplyMatrices(rx, ry));
  const translated: [number, number, number] = [input.object[0] - input.camera[0], input.object[1] - input.camera[1], input.object[2] - input.camera[2]];
  const viewPoint = multiply3(rotation, translated);
  const translation = multiply3(rotation, [-input.camera[0], -input.camera[1], -input.camera[2]]);
  const matrix: Matrix4 = [[...rotation[0], translation[0]], [...rotation[1], translation[1]], [...rotation[2], translation[2]], [0, 0, 0, 1]];
  if (!intrinsics.valid) return { valid: false as const, error: intrinsics.error, viewPoint, pixel: null, matrix };
  if (viewPoint[2] <= 0) return { valid: false as const, error: 'Point is at or behind the camera.', viewPoint, pixel: null, matrix };
  const normalized = distortNormalizedPoint([viewPoint[0] / viewPoint[2], viewPoint[1] / viewPoint[2]], intrinsicsInput.k1, intrinsicsInput.k2);
  return { valid: true as const, error: null, viewPoint, pixel: [intrinsics.fx * normalized[0] + intrinsicsInput.principalX, intrinsics.fy * normalized[1] + intrinsicsInput.principalY] as [number, number], matrix };
};

export interface OpticsInput { fNumber: number; focalLengthMm: number; objectDistanceMm: number; focusDistanceMm: number }
export const DEFAULT_OPTICS: OpticsInput = { fNumber: 4, focalLengthMm: 50, objectDistanceMm: 2000, focusDistanceMm: 3000 };
export const computeOptics = (input: OpticsInput) => {
  if (![input.fNumber, input.focalLengthMm, input.objectDistanceMm, input.focusDistanceMm].every(Number.isFinite) || input.fNumber < 1.4 || input.fNumber > 16 || input.focalLengthMm <= 0 || input.objectDistanceMm <= input.focalLengthMm || input.focusDistanceMm <= input.focalLengthMm) return { valid: false as const, error: 'Use finite values; f-number must be 1.4–16 and object/focus distances must exceed focal length.', imageDistanceMm: null, focusImageDistanceMm: null, apertureDiameterMm: null, blurCircleMm: null };
  const imageDistanceMm = input.focalLengthMm * input.objectDistanceMm / (input.objectDistanceMm - input.focalLengthMm);
  const focusImageDistanceMm = input.focalLengthMm * input.focusDistanceMm / (input.focusDistanceMm - input.focalLengthMm);
  const apertureDiameterMm = input.focalLengthMm / input.fNumber;
  const blurCircleMm = apertureDiameterMm * Math.abs(imageDistanceMm - focusImageDistanceMm) / imageDistanceMm;
  return { valid: true as const, error: null, imageDistanceMm, focusImageDistanceMm, apertureDiameterMm, blurCircleMm };
};

export interface StereoInput { focalPx: number; baselineMeters: number; disparityPx: number; referenceDepthMeters: number }
export const DEFAULT_STEREO: StereoInput = { focalPx: 700, baselineMeters: 0.12, disparityPx: 28, referenceDepthMeters: 3.2 };
export const computeStereo = (input: StereoInput) => {
  if (![input.focalPx, input.baselineMeters, input.disparityPx, input.referenceDepthMeters].every(Number.isFinite) || input.focalPx <= 0 || input.baselineMeters <= 0 || input.disparityPx <= 0 || input.referenceDepthMeters <= 0) return { valid: false as const, error: 'Focal length, baseline, disparity, and reference depth must be finite and positive.', depthMeters: null, absoluteErrorMeters: null, relativeError: null };
  const depthMeters = input.focalPx * input.baselineMeters / input.disparityPx;
  const absoluteErrorMeters = Math.abs(depthMeters - input.referenceDepthMeters);
  return { valid: true as const, error: null, depthMeters, absoluteErrorMeters, relativeError: absoluteErrorMeters / input.referenceDepthMeters };
};
