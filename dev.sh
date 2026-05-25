#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PID_DIR="$ROOT/.pids"
LOG_DIR="$ROOT/.logs"

mkdir -p "$PID_DIR" "$LOG_DIR"

_start_backend() {
  if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
    echo "backend already running (pid $(cat "$PID_DIR/backend.pid"))"
    return
  fi
  echo "starting backend..."
  cd "$BACKEND"
  .venv/bin/uvicorn app.main:app --reload --port 8000 \
    > "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$PID_DIR/backend.pid"
  echo "backend started (pid $!)"
}

_build_charts() {
  echo "building charts package..."
  cd "$ROOT"
  npm run build --workspace=packages/charts
  echo "charts built"
}

_start_frontend() {
  if [ -f "$PID_DIR/frontend.pid" ] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
    echo "frontend already running (pid $(cat "$PID_DIR/frontend.pid"))"
    return
  fi
  _build_charts
  echo "starting frontend..."
  cd "$FRONTEND"
  npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  echo $! > "$PID_DIR/frontend.pid"
  echo "frontend started (pid $!)"
}

_kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null || true
  fi
}

_stop_service() {
  local name="$1"
  local pidfile="$PID_DIR/$name.pid"
  local port="${2:-}"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "$name stopped (pid $pid)"
    else
      echo "$name was not running"
    fi
    rm -f "$pidfile"
  else
    echo "$name has no pid file"
  fi
  [ -n "$port" ] && _kill_port "$port"
}

_status() {
  for name in backend frontend; do
    local pidfile="$PID_DIR/$name.pid"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo "$name  running  (pid $(cat "$pidfile"))"
    else
      echo "$name  stopped"
    fi
  done
}

case "${1:-}" in
  start)
    _start_backend
    _start_frontend
    echo ""
    echo "backend → http://localhost:8000"
    echo "frontend → http://localhost:3000"
    echo ""
    echo "logs: .logs/backend.log  .logs/frontend.log"
    ;;
  stop)
    _stop_service backend 8000
    _stop_service frontend 3000
    ;;
  restart)
    _stop_service backend 8000
    _stop_service frontend 3000
    sleep 1
    _start_backend
    _start_frontend
    ;;
  status)
    _status
    ;;
  logs)
    tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
    ;;
  *)
    echo "usage: ./dev.sh [start|stop|restart|status|logs]"
    exit 1
    ;;
esac
