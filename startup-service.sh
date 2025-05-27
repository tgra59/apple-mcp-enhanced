#!/bin/bash

# Apple MCP Enhanced - Startup Service Script
# This script starts the contacts cache daemon

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/cache-daemon.ts"
LOG_FILE="$SCRIPT_DIR/daemon.log"
PID_FILE="$SCRIPT_DIR/cache-daemon.pid"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if daemon is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Function to start the daemon
start_daemon() {
    if is_running; then
        log "Daemon is already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi

    log "Starting Apple MCP Enhanced Cache Daemon..."
    
    # Check if bun is available
    if ! command -v bun >/dev/null 2>&1; then
        log "ERROR: Bun runtime not found. Please install bun first."
        return 1
    fi

    # Start the daemon in the background
    cd "$SCRIPT_DIR"
    nohup bun "$DAEMON_SCRIPT" start >> "$LOG_FILE" 2>&1 &
    
    # Wait a moment and check if it started successfully
    sleep 3
    
    if is_running; then
        log "Daemon started successfully (PID: $(cat "$PID_FILE"))"
        return 0
    else
        log "ERROR: Failed to start daemon. Check log file: $LOG_FILE"
        return 1
    fi
}

# Function to stop the daemon
stop_daemon() {
    if ! is_running; then
        log "Daemon is not running"
        return 0
    fi

    local pid=$(cat "$PID_FILE")
    log "Stopping daemon (PID: $pid)..."
    
    if kill -TERM "$pid" 2>/dev/null; then
        # Wait for graceful shutdown
        local count=0
        while [ $count -lt 10 ] && kill -0 "$pid" 2>/dev/null; do
            sleep 1
            count=$((count + 1))
        done
        
        if kill -0 "$pid" 2>/dev/null; then
            log "Daemon did not stop gracefully, forcing termination..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        
        rm -f "$PID_FILE"
        log "Daemon stopped successfully"
    else
        log "Failed to stop daemon, cleaning up PID file"
        rm -f "$PID_FILE"
    fi
}

# Function to show status
show_status() {
    if is_running; then
        local pid=$(cat "$PID_FILE")
        log "Daemon is running (PID: $pid)"
        
        # Show cache status if daemon is running
        cd "$SCRIPT_DIR"
        bun "$DAEMON_SCRIPT" status 2>/dev/null || log "Could not retrieve daemon status"
    else
        log "Daemon is not running"
    fi
}

# Function to rotate log file if it gets too large
rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0) -gt 10485760 ]; then
        log "Rotating log file (size limit reached)"
        mv "$LOG_FILE" "$LOG_FILE.old"
        touch "$LOG_FILE"
    fi
}

# Main script logic
case "${1:-start}" in
    start)
        rotate_log
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        sleep 2
        start_daemon
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Apple MCP Enhanced Cache Daemon Control Script"
        echo ""
        echo "Commands:"
        echo "  start   - Start the cache daemon"
        echo "  stop    - Stop the cache daemon"
        echo "  restart - Restart the cache daemon"
        echo "  status  - Show daemon status"
        echo ""
        echo "Log file: $LOG_FILE"
        echo "PID file: $PID_FILE"
        exit 1
        ;;
esac
