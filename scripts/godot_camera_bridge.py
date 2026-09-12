"""Windows webcam -> Godot UDP JPEG bridge (requires ffmpeg on PATH)."""
import argparse, socket, subprocess, sys, struct

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--device', default='ASUS FHD webcam')
    p.add_argument('--port', type=int, default=6402)
    a = p.parse_args()
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cmd = ['ffmpeg','-hide_banner','-loglevel','error','-f','dshow','-video_size','640x480','-framerate','24','-i',f'video={a.device}','-f','mjpeg','-q:v','6','pipe:1']
    print(f'[camera-bridge] {a.device} -> udp://127.0.0.1:{a.port}', flush=True)
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError as exc:
        print(f'[camera-bridge] 无法启动 ffmpeg: {exc}', file=sys.stderr); return 1
    buf = bytearray(); frame_id = 0
    try:
        while True:
            chunk = proc.stdout.read(65536)
            if not chunk: break
            buf.extend(chunk)
            while True:
                start = buf.find(b'\xff\xd8')
                end = buf.find(b'\xff\xd9', start + 2) if start >= 0 else -1
                if start < 0: buf.clear(); break
                if end < 0:
                    if start: del buf[:start]
                    break
                frame = bytes(buf[start:end+2]); del buf[:end+2]
                # 分片避免 UDP 超过 MTU 后整帧被丢弃。每片 <= 1200 字节。
                chunk_size = 1200
                total = (len(frame) + chunk_size - 1) // chunk_size
                for index in range(total):
                    chunk = frame[index * chunk_size:(index + 1) * chunk_size]
                    udp.sendto(struct.pack('!IHH', frame_id, index, total) + chunk, ('127.0.0.1', a.port))
                frame_id = (frame_id + 1) & 0xffffffff
    except KeyboardInterrupt: pass
    finally:
        proc.terminate(); udp.close()
    return 0

if __name__ == '__main__': raise SystemExit(main())
