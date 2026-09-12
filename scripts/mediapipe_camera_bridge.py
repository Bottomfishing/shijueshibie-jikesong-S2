"""Laptop camera bridge: hand input, smile detection, and JPEG preview for Godot."""

import argparse
import ctypes
import json
import os
import socket
import struct
import sys
import time
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


ROOT = Path(__file__).resolve().parents[1]
HAND_MODEL = ROOT / "public" / "models" / "hand_landmarker.task"
HAND_CONNECTIONS = (
    (0, 5), (5, 9), (9, 13), (13, 17), (0, 17),
    (5, 8), (9, 12), (13, 16), (17, 20),
)


def distance(a, b):
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5


def camera_source(device: str):
    return int(device) if device.isdigit() else f"video={device}"


def process_is_running(pid: int) -> bool:
    if pid <= 0:
        return True
    if os.name == "nt":
        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def open_camera(device: str):
    for _ in range(3):
        capture = cv2.VideoCapture(camera_source(device), cv2.CAP_DSHOW)
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        capture.set(cv2.CAP_PROP_FPS, 24)
        if capture.isOpened():
            return capture
        capture.release()
        time.sleep(0.25)
    return None


def detect_smile(frame, face_detector, smile_detector):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    faces = face_detector.detectMultiScale(
        gray, scaleFactor=1.16, minNeighbors=6, minSize=(80, 80)
    )
    if len(faces) == 0:
        return False, 0.0, None, None

    x, y, width, height = max(faces, key=lambda rect: rect[2] * rect[3])
    mouth_y = y + int(height * 0.48)
    mouth_roi = gray[mouth_y:y + height, x:x + width]
    smiles = smile_detector.detectMultiScale(
        mouth_roi,
        scaleFactor=1.45,
        minNeighbors=18,
        minSize=(max(24, width // 4), max(12, height // 10)),
    )
    if len(smiles) == 0:
        return True, 0.0, (x, y, width, height), None

    sx, sy, sw, sh = max(smiles, key=lambda rect: rect[2] * rect[3])
    width_ratio = sw / max(float(width), 1.0)
    score = max(0.0, min(1.0, (width_ratio - 0.28) / 0.38))
    return True, score, (x, y, width, height), (x + sx, mouth_y + sy, sw, sh)


def hand_payload(result, frame):
    payload = {
        "active": False,
        "x": 0.5,
        "y": 0.5,
        "grab": 0.0,
        "spread": 0.5,
        "confidence": 0.0,
    }
    if not result.hand_landmarks:
        return payload

    hand = result.hand_landmarks[0]
    palm_points = (0, 5, 9, 13, 17)
    tips = (4, 8, 12, 16, 20)
    palm_x = sum(hand[index].x for index in palm_points) / len(palm_points)
    palm_y = sum(hand[index].y for index in palm_points) / len(palm_points)
    palm_size = max(distance(hand[0], hand[9]), 1e-4)
    pinch = distance(hand[4], hand[8]) / palm_size

    class PalmCenter:
        x = palm_x
        y = palm_y

    spread = sum(distance(hand[index], PalmCenter) for index in tips) / len(tips) / palm_size
    payload.update(
        active=True,
        x=palm_x,
        y=palm_y,
        grab=max(0.0, min(1.0, 1.0 - (pinch - 0.35) / 0.9)),
        spread=max(0.0, min(1.0, (spread - 0.6) / 1.1)),
        confidence=1.0,
    )
    for start, end in HAND_CONNECTIONS:
        cv2.line(
            frame,
            (int(hand[start].x * 640), int(hand[start].y * 480)),
            (int(hand[end].x * 640), int(hand[end].y * 480)),
            (125, 217, 255),
            2,
        )
    for point in hand:
        cv2.circle(frame, (int(point.x * 640), int(point.y * 480)), 4, (255, 243, 196), -1)
    return payload


def send_preview(frame_socket, frame, frame_id: int, port: int):
    encoded_ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not encoded_ok:
        return
    data = encoded.tobytes()
    chunk_size = 1200
    total = (len(data) + chunk_size - 1) // chunk_size
    for index in range(total):
        chunk = data[index * chunk_size:(index + 1) * chunk_size]
        frame_socket.sendto(
            struct.pack("!IHH", frame_id, index, total) + chunk,
            ("127.0.0.1", port),
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default=os.environ.get("VISION_CAMERA_DEVICE", "0"))
    parser.add_argument("--vision-port", type=int, default=6401)
    parser.add_argument("--frame-port", type=int, default=6402)
    parser.add_argument("--parent-pid", type=int, default=0)
    args = parser.parse_args()

    frame_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    state_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def send_status(message, online=False):
        payload = {
            "active": False,
            "confidence": 0.0,
            "bridge_online": online,
            "face_detected": False,
            "smile": 0.0,
            "laugh": False,
            "bridge_status": message,
        }
        try:
            state_socket.sendto(json.dumps(payload, ensure_ascii=False).encode(), ("127.0.0.1", args.vision_port))
        except OSError:
            pass

    capture = open_camera(args.device)
    if capture is None:
        send_status(f"摄像头打开失败: {args.device}")
        print(f"[camera-bridge] 无法打开摄像头 {args.device}（设备可能被占用）", file=sys.stderr, flush=True)
        frame_socket.close()
        state_socket.close()
        return 2
    if not HAND_MODEL.exists():
        send_status("缺少 hand_landmarker.task 模型")
        capture.release()
        frame_socket.close()
        state_socket.close()
        return 3

    try:
        hand_options = vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(HAND_MODEL)),
            num_hands=1,
            min_hand_detection_confidence=0.55,
            min_hand_presence_confidence=0.55,
            min_tracking_confidence=0.55,
        )
        hand_detector = vision.HandLandmarker.create_from_options(hand_options)
        face_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        smile_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_smile.xml")
    except Exception as exc:
        send_status(f"识别模型启动失败: {exc}")
        capture.release()
        frame_socket.close()
        state_socket.close()
        return 4

    send_status("摄像头桥接已连接", True)
    frame_id = 0
    frame_count = 0
    read_failures = 0
    next_parent_check = 0.0
    face_detected = False
    smile_score = 0.0
    face_rect = None
    smile_rect = None

    try:
        while True:
            now = time.monotonic()
            if now >= next_parent_check:
                next_parent_check = now + 0.5
                if not process_is_running(args.parent_pid):
                    break

            ok, frame = capture.read()
            if not ok:
                read_failures += 1
                if read_failures >= 30:
                    send_status("摄像头画面读取中断")
                    return 5
                continue
            read_failures = 0
            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hand_detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            payload = hand_payload(result, frame)

            if frame_count % 3 == 0:
                face_detected, smile_target, face_rect, smile_rect = detect_smile(frame, face_detector, smile_detector)
                response = 0.34 if smile_target > smile_score else 0.22
                smile_score += (smile_target - smile_score) * response
                if not face_detected:
                    smile_score *= 0.65
            frame_count += 1

            if face_rect is not None:
                x, y, width, height = face_rect
                cv2.rectangle(frame, (x, y), (x + width, y + height), (112, 210, 205), 2)
            if smile_rect is not None:
                x, y, width, height = smile_rect
                cv2.rectangle(frame, (x, y), (x + width, y + height), (105, 235, 255), 2)
                cv2.putText(frame, f"SMILE {int(smile_score * 100)}%", (x, max(24, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (105, 235, 255), 2)

            payload.update(
                bridge_online=True,
                face_detected=bool(face_detected),
                smile=max(0.0, min(1.0, smile_score)),
                laugh=bool(face_detected and smile_score >= 0.58),
                bridge_status="摄像头桥接已连接",
            )
            state_socket.sendto(json.dumps(payload).encode(), ("127.0.0.1", args.vision_port))
            send_preview(frame_socket, frame, frame_id, args.frame_port)
            frame_id = (frame_id + 1) & 0xFFFFFFFF
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        send_status(f"桥接运行错误: {exc}")
        print(f"[camera-bridge] 运行错误: {exc}", file=sys.stderr, flush=True)
        return 6
    finally:
        capture.release()
        hand_detector.close()
        frame_socket.close()
        state_socket.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
