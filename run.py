#!/usr/bin/env python3
"""Run the FastAPI backend and Vite frontend dev servers together.

Usage:
    python run.py

Backend  -> http://localhost:8000
Frontend -> http://localhost:5173

Press Ctrl+C to stop both.
"""
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
BACKEND_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"

IS_WINDOWS = sys.platform == "win32"


def kill_process_tree(proc):
    """proc.terminate() alone leaves orphaned children on Windows when the
    process was launched via a shell (e.g. npm.cmd spawning node.exe) -
    taskkill /T kills the whole tree instead."""
    if proc.poll() is not None:
        return
    if IS_WINDOWS:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            capture_output=True,
        )
    else:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def main():
    if not BACKEND_PYTHON.exists():
        sys.exit(
            f"Backend venv not found at {BACKEND_PYTHON}\n"
            "Create it first:\n"
            "  cd backend\n"
            "  python -m venv .venv\n"
            "  .venv\\Scripts\\pip install -r requirements.txt"
        )

    print("Starting backend  -> http://localhost:8000")
    backend_proc = subprocess.Popen(
        [
            str(BACKEND_PYTHON), "-m", "uvicorn", "app.main:app",
            "--host", "0.0.0.0", "--port", "8000",
            # Auto-restarts on code changes, same as Vite's HMR on the
            # frontend side - no more manually killing/relaunching run.py
            # after every backend edit. The reload watcher runs as a child
            # of this process either way, so kill_process_tree() still
            # tears down the whole tree on Ctrl+C.
            "--reload", "--reload-dir", "app",
        ],
        cwd=str(BACKEND_DIR),
    )

    time.sleep(2)  # let the backend come up before the frontend's proxy needs it

    print("Starting frontend -> http://localhost:5173")
    frontend_proc = subprocess.Popen(
        "npm run dev",
        cwd=str(FRONTEND_DIR),
        shell=True,
    )

    print("\nBoth servers running. Open http://localhost:5173 in your browser.")
    print("Press Ctrl+C to stop both.\n")

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print("Backend exited unexpectedly - stopping frontend too.")
                break
            if frontend_proc.poll() is not None:
                print("Frontend exited unexpectedly - stopping backend too.")
                break
    except KeyboardInterrupt:
        print("\nCtrl+C received, stopping servers...")
    finally:
        kill_process_tree(frontend_proc)
        kill_process_tree(backend_proc)
        print("Both servers stopped.")


if __name__ == "__main__":
    main()
