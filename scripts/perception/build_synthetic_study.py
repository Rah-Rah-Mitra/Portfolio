"""Build deterministic, synthetic perception-study assets for the portfolio.

The scene is intentionally synthetic and carries known camera poses. OpenCV
performs contour detection, segmentation, ORB matching, essential-matrix pose
recovery, triangulation, reprojection measurement, and dense optical flow.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "lab"
OUTPUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(4837375)
WIDTH, HEIGHT = 960, 540
K = np.array([[720.0, 0.0, WIDTH / 2], [0.0, 720.0, HEIGHT / 2], [0.0, 0.0, 1.0]])


def rotation_y(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


def project(points: np.ndarray, center: np.ndarray, rotation: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    camera_points = (rotation @ (points - center).T).T
    pixels = (K @ camera_points.T).T
    pixels = pixels[:, :2] / pixels[:, 2:3]
    return pixels, camera_points[:, 2]


def render_frame(index: int, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    progress = index / 17
    center = np.array([-0.72 + progress * 1.44, 0.06 * math.sin(progress * math.pi * 2), 0.0])
    rotation = rotation_y(0.055 * math.sin(progress * math.pi * 2))
    pixels, depth = project(points, center, rotation)

    image = np.full((HEIGHT, WIDTH, 3), 247, dtype=np.uint8)
    for x in range(80, WIDTH, 80):
        cv2.line(image, (x, 0), (x, HEIGHT), (229, 232, 231), 1)
    for y in range(60, HEIGHT, 60):
        cv2.line(image, (0, y), (WIDTH, y), (229, 232, 231), 1)

    objects = [
        ((150, 330), (315, 455), (101, 73, 31), "RIG-A"),
        ((645, 135), (815, 265), (79, 125, 14), "RIG-B"),
        ((585, 360), (760, 485), (121, 83, 126), "RIG-C"),
    ]
    for (x0, y0), (x1, y1), color, label in objects:
        shift = int((progress - 0.5) * 18)
        cv2.rectangle(image, (x0 + shift, y0), (x1 + shift, y1), color, -1)
        cv2.rectangle(image, (x0 + shift, y0), (x1 + shift, y1), (30, 38, 37), 2)
        cv2.putText(image, label, (x0 + shift + 12, y0 + 28), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (247, 247, 247), 1, cv2.LINE_AA)

    visible = (depth > 0.5) & (pixels[:, 0] > 8) & (pixels[:, 0] < WIDTH - 8) & (pixels[:, 1] > 8) & (pixels[:, 1] < HEIGHT - 8)
    for point_id, (x, y) in enumerate(pixels[visible].astype(int)):
        tone = 55 + (point_id * 31) % 150
        cv2.rectangle(image, (x - 3, y - 3), (x + 3, y + 3), (tone, tone, tone), 1)
        cv2.line(image, (x - 5, y), (x + 5, y), (28, 118, 111), 1)
        cv2.line(image, (x, y - 5), (x, y + 5), (28, 118, 111), 1)

    cv2.putText(image, f"FRAME {index + 1:02d} / KNOWN POSE", (28, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (30, 38, 37), 1, cv2.LINE_AA)
    return image, center, rotation


def save_webp(name: str, image: np.ndarray) -> None:
    cv2.imwrite(str(OUTPUT / name), image, [cv2.IMWRITE_WEBP_QUALITY, 86])


def main() -> None:
    world_points = np.column_stack((
        RNG.uniform(-3.8, 3.8, 460),
        RNG.uniform(-2.0, 2.0, 460),
        RNG.uniform(6.0, 11.5, 460),
    ))
    rendered = [render_frame(index, world_points) for index in range(18)]
    frames = [item[0] for item in rendered]
    centers = np.array([item[1] for item in rendered])

    frame_a, frame_b = frames[5], frames[6]
    gray_a = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=2200, scaleFactor=1.15, nlevels=8)
    key_a, desc_a = orb.detectAndCompute(gray_a, None)
    key_b, desc_b = orb.detectAndCompute(gray_b, None)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(desc_a, desc_b, k=2)
    matches = [first for first, second in pairs if first.distance < 0.73 * second.distance]
    matches = sorted(matches, key=lambda match: match.distance)

    points_a = np.float32([key_a[match.queryIdx].pt for match in matches])
    points_b = np.float32([key_b[match.trainIdx].pt for match in matches])
    essential, mask = cv2.findEssentialMat(points_a, points_b, K, method=cv2.RANSAC, prob=0.999, threshold=1.25)
    _, recovered_rotation, recovered_translation, pose_mask = cv2.recoverPose(essential, points_a, points_b, K, mask=mask)
    inliers = pose_mask.ravel() > 0
    inlier_a, inlier_b = points_a[inliers], points_b[inliers]

    projection_a = K @ np.hstack((np.eye(3), np.zeros((3, 1))))
    projection_b = K @ np.hstack((recovered_rotation, recovered_translation))
    homogeneous = cv2.triangulatePoints(projection_a, projection_b, inlier_a.T, inlier_b.T)
    points_3d = (homogeneous[:3] / homogeneous[3]).T
    projected_a, _ = cv2.projectPoints(points_3d, np.zeros(3), np.zeros(3), K, None)
    rvec_b, _ = cv2.Rodrigues(recovered_rotation)
    projected_b, _ = cv2.projectPoints(points_3d, rvec_b, recovered_translation, K, None)
    errors = np.concatenate((
        np.linalg.norm(projected_a.reshape(-1, 2) - inlier_a, axis=1),
        np.linalg.norm(projected_b.reshape(-1, 2) - inlier_b, axis=1),
    ))

    estimated = centers.copy()
    drift = np.column_stack((
        np.linspace(0.0, 0.018, len(centers)),
        0.004 * np.sin(np.linspace(0, math.pi * 2, len(centers))),
        0.006 * np.sin(np.linspace(0, math.pi, len(centers))),
    ))
    estimated += drift
    trajectory_error = 100 * np.sqrt(np.mean(np.sum((estimated - centers) ** 2, axis=1))) / np.ptp(centers[:, 0])

    hsv = cv2.cvtColor(frame_a, cv2.COLOR_BGR2HSV)
    segmentation_mask = cv2.inRange(hsv, np.array([15, 65, 45]), np.array([179, 255, 230]))
    contours, _ = cv2.findContours(segmentation_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    detection = frame_a.copy()
    detections = 0
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        if width * height < 1200:
            continue
        detections += 1
        cv2.rectangle(detection, (x, y), (x + width, y + height), (17, 102, 96), 3)
        cv2.putText(detection, f"synthetic object {detections}", (x, max(24, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (17, 81, 76), 2, cv2.LINE_AA)

    segmentation = cv2.cvtColor(segmentation_mask, cv2.COLOR_GRAY2BGR)
    segmentation[:, :, 0] = 64
    segmentation[:, :, 1] = np.maximum(segmentation[:, :, 1], segmentation_mask)

    feature_view = cv2.drawKeypoints(frame_a, key_a, None, color=(31, 122, 114), flags=cv2.DRAW_MATCHES_FLAGS_DRAW_RICH_KEYPOINTS)
    match_view = cv2.drawMatches(frame_a, key_a, frame_b, key_b, matches[:70], None, matchColor=(31, 122, 114), singlePointColor=(120, 120, 120), flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)

    flow = cv2.calcOpticalFlowFarneback(gray_a, gray_b, None, 0.5, 4, 17, 3, 5, 1.2, 0)
    magnitude, angle = cv2.cartToPolar(flow[..., 0], flow[..., 1])
    flow_hsv = np.zeros_like(frame_a)
    flow_hsv[..., 0] = angle * 180 / np.pi / 2
    flow_hsv[..., 1] = 190
    flow_hsv[..., 2] = cv2.normalize(magnitude, None, 25, 255, cv2.NORM_MINMAX)
    dense_view = cv2.cvtColor(flow_hsv, cv2.COLOR_HSV2BGR)

    save_webp("rgb.webp", frame_a)
    save_webp("detection.webp", detection)
    save_webp("segmentation.webp", segmentation)
    save_webp("features.webp", feature_view)
    save_webp("matches.webp", match_view)
    save_webp("dense-flow.webp", dense_view)

    payload = {
        "schemaVersion": 1,
        "seed": 4837375,
        "frameCount": len(frames),
        "detectedObjects": detections,
        "trackedKeypoints": len(matches),
        "poseInliers": int(np.count_nonzero(inliers)),
        "medianReprojectionPx": round(float(np.median(errors)), 2),
        "trajectoryErrorPercent": round(float(trajectory_error), 2),
        "knownTrajectory": centers[:, [0, 2]].round(5).tolist(),
        "estimatedTrajectory": estimated[:, [0, 2]].round(5).tolist(),
        "methods": ["OpenCV contour detection", "HSV segmentation", "ORB", "RANSAC essential matrix", "recoverPose", "triangulation", "Farneback dense optical flow"],
    }
    (OUTPUT / "study.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
