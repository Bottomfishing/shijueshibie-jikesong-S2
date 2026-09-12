"""Laptop webcam + MediaPipe Hand Landmarker bridge for Godot."""
import json, socket, struct
from pathlib import Path
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'public' / 'models' / 'hand_landmarker.task'
def d(a,b): return ((a.x-b.x)**2+(a.y-b.y)**2)**0.5
def main():
    cap=cv2.VideoCapture(0,cv2.CAP_DSHOW); cap.set(cv2.CAP_PROP_FRAME_WIDTH,640); cap.set(cv2.CAP_PROP_FRAME_HEIGHT,480)
    if not cap.isOpened(): raise SystemExit('无法打开笔记本摄像头')
    opts=vision.HandLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(MODEL)),num_hands=1,min_hand_detection_confidence=.55,min_hand_presence_confidence=.55,min_tracking_confidence=.55)
    detector=vision.HandLandmarker.create_from_options(opts); vs=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); ss=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); fid=0
    try:
        while True:
            ok,frame=cap.read()
            if not ok: continue
            frame=cv2.flip(frame,1); rgb=cv2.cvtColor(frame,cv2.COLOR_BGR2RGB); result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
            payload={'active':False,'x':.5,'y':.5,'grab':0.,'spread':.5,'confidence':0.}
            if result.hand_landmarks:
                h=result.hand_landmarks[0]; ring=[0,5,9,13,17]; tips=[4,8,12,16,20]; px=sum(h[i].x for i in ring)/5; py=sum(h[i].y for i in ring)/5; palm=max(d(h[0],h[9]),1e-4); pinch=d(h[4],h[8])/palm; spread=sum(d(h[i],type('P',(),{'x':px,'y':py})()) for i in tips)/5/palm
                payload.update(active=True,x=px,y=py,grab=max(0.,min(1.,1-(pinch-.35)/.9)),spread=max(0.,min(1.,(spread-.6)/1.1)),confidence=1.)
                for a,b in [(0,5),(5,9),(9,13),(13,17),(0,17),(5,8),(9,12),(13,16),(17,20)]: cv2.line(frame,(int(h[a].x*640),int(h[a].y*480)),(int(h[b].x*640),int(h[b].y*480)),(125,217,255),2)
                for p in h: cv2.circle(frame,(int(p.x*640),int(p.y*480)),4,(255,243,196),-1)
            ss.sendto(json.dumps(payload).encode(),('127.0.0.1',6401)); ok,enc=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,75])
            if ok:
                data=enc.tobytes(); size=1200; total=(len(data)+size-1)//size
                for i in range(total): vs.sendto(struct.pack('!IHH',fid,i,total)+data[i*size:(i+1)*size],('127.0.0.1',6402))
                fid=(fid+1)&0xffffffff
    except KeyboardInterrupt: pass
    finally: cap.release(); detector.close(); vs.close(); ss.close()
if __name__=='__main__': main()
