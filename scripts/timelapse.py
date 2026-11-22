"""Record a time lapse by grabbing one frame every N seconds.

Frames are saved as numbered PNGs. Every --chunk frames they are encoded into a
short MP4 segment in the background and the PNGs are permanently deleted (not
sent to the Trash), so disk usage stays small. Press Ctrl+C to stop; the
remaining frames are encoded and all segments are joined into timelapse.mp4.

Examples:
    python scripts/timelapse.py --interval 5                 # webcam, every 5s
    python scripts/timelapse.py --source screen --interval 2 # macOS screen
    python scripts/timelapse.py -i 10 --duration 3600 --fps 30 -o out/lapse
"""
import argparse
import queue
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("-i", "--interval", type=float, default=5.0, help="seconds between frames (default 5)")
    p.add_argument("-s", "--source", choices=["camera", "screen"], default="camera", help="what to capture")
    p.add_argument("-c", "--camera", type=int, default=0, help="camera index for --source camera")
    p.add_argument("-d", "--display", type=int, default=1, help="display number for --source screen")
    p.add_argument("-o", "--out", type=Path, default=None, help="output folder (default timelapse_<timestamp>)")
    p.add_argument("--duration", type=float, default=None, help="stop after this many seconds")
    p.add_argument("--frames", type=int, default=None, help="stop after this many frames")
    p.add_argument("--fps", type=int, default=24, help="playback fps of the output video (default 24)")
    p.add_argument("--chunk", type=int, default=50, help="frames per encoded segment (default 50)")
    p.add_argument("--keep-segments", action="store_true", help="keep the segment MP4s after joining")
    p.add_argument("--no-video", action="store_true", help="only save frames, don't encode or delete them")
    return p.parse_args()


class CameraSource:
    def __init__(self, index):
        import cv2
        self.cv2 = cv2
        self.cap = cv2.VideoCapture(index)
        if not self.cap.isOpened():
            sys.exit(f"Could not open camera {index}")
        # Let auto-exposure settle.
        for _ in range(10):
            self.cap.read()

    def grab(self, path):
        # Flush buffered frames so we save a current one, not a stale one.
        for _ in range(3):
            self.cap.grab()
        ok, frame = self.cap.read()
        if not ok:
            return False
        return self.cv2.imwrite(str(path), frame)

    def close(self):
        self.cap.release()


class ScreenSource:
    def __init__(self, display):
        if not shutil.which("screencapture"):
            sys.exit("screencapture not found (screen source is macOS only)")
        self.display = display

    def grab(self, path):
        r = subprocess.run(["screencapture", "-x", "-D", str(self.display), str(path)])
        return r.returncode == 0 and path.exists()

    def close(self):
        pass


class SegmentEncoder:
    """Encodes batches of frames into MP4 segments on a background thread,
    deleting the source PNGs once each segment is written successfully."""

    def __init__(self, out_dir, fps):
        self.out_dir = out_dir
        self.fps = fps
        self.segments = []
        self.jobs = queue.Queue()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def submit(self, frames):
        if frames:
            seg = self.out_dir / f"segment_{len(self.segments):05d}.mp4"
            self.segments.append(seg)
            self.jobs.put((list(frames), seg))

    def _run(self):
        while True:
            job = self.jobs.get()
            if job is None:
                return
            self._encode(*job)

    def _encode(self, frames, seg):
        # Frames are numbered contiguously (failed captures reuse the index).
        first = int(frames[0].stem.split("_")[1])
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", str(self.fps), "-start_number", str(first),
            "-i", str(self.out_dir / "frame_%06d.png"), "-frames:v", str(len(frames)),
            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",  # libx264 needs even dimensions
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
            str(seg),
        ]
        ok = subprocess.run(cmd).returncode == 0 and seg.exists()
        if ok:
            for f in frames:
                f.unlink(missing_ok=True)  # permanent delete, bypasses Trash
        else:
            print(f"\nEncoding {seg.name} failed; keeping its {len(frames)} PNGs.")
            self.segments.remove(seg)

    def finish(self, keep_segments):
        self.jobs.put(None)
        self.thread.join()
        if not self.segments:
            return
        video = self.out_dir / "timelapse.mp4"
        listfile = self.out_dir / "segments.txt"
        listfile.write_text("".join(f"file '{s.name}'\n" for s in self.segments))
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
               "-i", str(listfile), "-c", "copy", str(video)]
        ok = subprocess.run(cmd).returncode == 0
        listfile.unlink(missing_ok=True)
        if ok:
            print(f"Saved {video}")
            if not keep_segments:
                for s in self.segments:
                    s.unlink(missing_ok=True)
        else:
            print(f"Joining failed; segments left in {self.out_dir}/")


def main():
    args = parse_args()
    out_dir = args.out or Path(f"timelapse_{datetime.now():%Y%m%d_%H%M%S}")
    out_dir.mkdir(parents=True, exist_ok=True)

    encoder = None
    if not args.no_video:
        if not shutil.which("ffmpeg"):
            sys.exit("ffmpeg not found (install it or use --no-video)")
        encoder = SegmentEncoder(out_dir, args.fps)

    source = CameraSource(args.camera) if args.source == "camera" else ScreenSource(args.display)
    print(f"Capturing {args.source} every {args.interval}s into {out_dir}/ — Ctrl+C to stop")

    count = 0
    pending = []
    start = time.monotonic()
    next_shot = start
    try:
        while True:
            if args.frames is not None and count >= args.frames:
                break
            if args.duration is not None and time.monotonic() - start >= args.duration:
                break

            path = out_dir / f"frame_{count:06d}.png"
            if source.grab(path):
                count += 1
                pending.append(path)
                if encoder and len(pending) >= args.chunk:
                    encoder.submit(pending)
                    pending = []
                elapsed = time.monotonic() - start
                print(f"\r{count} frames | {elapsed:7.0f}s elapsed | {count / args.fps:6.1f}s of video",
                      end="", flush=True)
            else:
                print(f"\nFailed to capture frame at {datetime.now():%H:%M:%S}")

            # Schedule against absolute times so the interval doesn't drift.
            next_shot += args.interval
            delay = next_shot - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            else:
                next_shot = time.monotonic()
    except KeyboardInterrupt:
        pass
    finally:
        source.close()

    print(f"\nCaptured {count} frames.")
    if encoder:
        print("Encoding remaining frames and joining segments...")
        try:
            encoder.submit(pending)
            encoder.finish(args.keep_segments)
        except KeyboardInterrupt:
            print("\nInterrupted during encoding; partial files left in place.")


if __name__ == "__main__":
    main()
