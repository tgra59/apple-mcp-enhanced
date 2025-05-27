#!/bin/bash

# Claude MCP Wrapper for Apple MCP Enhanced
# This script ensures the cache daemon is running and then starts the main MCP server

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/cache-daemon.ts"
MAIN_SERVER="$SCRIPT_DIR/index.ts"
PID_FILE="$SCRIPT_DIR/cache-daemon.pid"

# Function to check if daemon is running
is_daemon_running() {
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

# Function to start the cache daemon if not running
ensure_daemon_running() {
    if is_daemon_running; then
        echo "Cache daemon is already running (PID: $(cat "$PID_FILE"))" >&2
        return 0
    fi

    echo "Starting cache daemon..." >&2
    
    # Check if bun is available
    if ! command -v bun >/dev/null 2>&1; then
        echo "ERROR: Bun runtime not found. Please install bun first." >&2
        return 1
    fi

    # Start the daemon in the background
    cd "$SCRIPT_DIR"
    nohup bun "$DAEMON_SCRIPT" start > /dev/null 2>&1 &
    
    # Wait a moment and check if it started successfully
    sleep 2
    
    if is_daemon_running; then
        echo "Cache daemon started successfully (PID: $(cat "$PID_FILE"))" >&2
        return 0
    else
        echo "ERROR: Failed to start cache daemon" >&2
        return 1
    fi
}

# Main execution
echo "Apple MCP Enhanced - Starting with auto-daemon management..." >&2

# Ensure cache daemon is running
if ! ensure_daemon_running; then
    echo "ERROR: Could not start cache daemon. Proceeding with main server only..." >&2
fi

# Start the main MCP server in the foreground
echo "Starting main MCP server..." >&2
cd "$SCRIPT_DIR"
exec bun "$MAIN_SERVER"
