#!/usr/bin/env bun
import ContactsCacheManager from "./cache-manager";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DAEMON_CONFIG_FILE = join(__dirname, "daemon-config.json");
const PID_FILE = join(__dirname, "cache-daemon.pid");

interface DaemonConfig {
  updateIntervalHours: number;
  autoStart: boolean;
  logLevel: 'error' | 'info' | 'debug';
  maxLogSize: number;
  enabled: boolean;
}

const defaultConfig: DaemonConfig = {
  updateIntervalHours: 24, // Update once per day
  autoStart: true,
  logLevel: 'info',
  maxLogSize: 10 * 1024 * 1024, // 10MB
  enabled: true
};

export class ContactsCacheDaemon {
  private manager: ContactsCacheManager;
  private config: DaemonConfig;
  private updateTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.manager = new ContactsCacheManager();
    this.config = defaultConfig;
    console.error("🤖 ContactsCacheDaemon initialized");
  }

  async loadConfig(): Promise<void> {
    try {
      if (existsSync(DAEMON_CONFIG_FILE)) {
        const configData = await readFile(DAEMON_CONFIG_FILE, 'utf8');
        this.config = { ...defaultConfig, ...JSON.parse(configData) };
        console.error(`⚙️ Loaded daemon config: ${this.config.updateIntervalHours}h intervals`);
      } else {
        await this.saveConfig();
        console.error("⚙️ Created default daemon config");
      }
    } catch (error) {
      console.error("❌ Error loading daemon config, using defaults:", error);
      this.config = defaultConfig;
    }
  }

  async saveConfig(): Promise<void> {
    try {
      await writeFile(DAEMON_CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error("❌ Error saving daemon config:", error);
    }
  }

  async writePidFile(): Promise<void> {
    try {
      await writeFile(PID_FILE, process.pid.toString());
    } catch (error) {
      console.error("❌ Error writing PID file:", error);
    }
  }

  async removePidFile(): Promise<void> {
    try {
      if (existsSync(PID_FILE)) {
        await Bun.file(PID_FILE).write("");
      }
    } catch (error) {
      console.error("❌ Error removing PID file:", error);
    }
  }

  async isAlreadyRunning(): Promise<boolean> {
    try {
      if (!existsSync(PID_FILE)) return false;
      
      const pidData = await readFile(PID_FILE, 'utf8');
      const pid = parseInt(pidData.trim());
      
      if (isNaN(pid)) return false;
      
      // Check if process is still running
      try {
        process.kill(pid, 0); // Signal 0 just checks if process exists
        return true;
      } catch {
        // Process doesn't exist, clean up stale PID file
        await this.removePidFile();
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async performUpdate(): Promise<boolean> {
    try {
      console.error("🔄 Daemon: Starting scheduled cache update...");
      const startTime = Date.now();
      
      await this.manager.fullUpdate();
      
      const duration = Date.now() - startTime;
      console.error(`✅ Daemon: Cache update completed in ${(duration / 1000).toFixed(2)}s`);
      
      return true;
    } catch (error) {
      console.error("❌ Daemon: Cache update failed:", error);
      return false;
    }
  }

  async scheduleNextUpdate(): Promise<void> {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    const intervalMs = this.config.updateIntervalHours * 60 * 60 * 1000;
    console.error(`⏰ Daemon: Next update scheduled in ${this.config.updateIntervalHours} hours`);
    
    this.updateTimer = setTimeout(async () => {
      if (this.isRunning) {
        await this.performUpdate();
        await this.scheduleNextUpdate(); // Schedule the next one
      }
    }, intervalMs);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.error("⚠️ Daemon is already running");
      return;
    }

    console.error("🚀 Starting ContactsCacheDaemon...");

    try {
      // Check if another instance is running
      if (await this.isAlreadyRunning()) {
        console.error("❌ Another daemon instance is already running");
        process.exit(1);
      }

      // Load configuration
      await this.loadConfig();

      if (!this.config.enabled) {
        console.error("⚠️ Daemon is disabled in config");
        return;
      }

      // Write PID file
      await this.writePidFile();

      this.isRunning = true;

      // Perform initial update if cache is stale
      const isStale = await this.manager.isCacheStale(this.config.updateIntervalHours);
      if (isStale) {
        console.error("🔄 Cache is stale, performing initial update...");
        await this.performUpdate();
      } else {
        console.error("✅ Cache is fresh, skipping initial update");
      }

      // Schedule regular updates
      await this.scheduleNextUpdate();

      console.error("✅ ContactsCacheDaemon started successfully");
      
      // Set up graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
      process.on('exit', () => this.stop());

      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      console.error("❌ Failed to start daemon:", error);
      await this.removePidFile();
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.error("🛑 Stopping ContactsCacheDaemon...");
    this.isRunning = false;

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    await this.removePidFile();
    console.error("✅ Daemon stopped gracefully");
  }

  private keepAlive(): void {
    // Keep the process running and check status periodically
    const statusInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(statusInterval);
        return;
      }

      // Log periodic status (every hour)
      if (this.config.logLevel === 'debug') {
        console.error(`💓 Daemon heartbeat - Next update in ${this.getTimeUntilNextUpdate()}`);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  private getTimeUntilNextUpdate(): string {
    if (!this.updateTimer) return "unknown";
    
    // This is an approximation since we can't get exact time from setTimeout
    const intervalMs = this.config.updateIntervalHours * 60 * 60 * 1000;
    const hours = Math.floor(intervalMs / (60 * 60 * 1000));
    return `~${hours} hours`;
  }

  async getStatus(): Promise<{
    running: boolean;
    pid?: number;
    cacheAge: number;
    cacheSize: number;
    nextUpdate: string;
    config: DaemonConfig;
  }> {
    const isRunning = await this.isAlreadyRunning();
    let pid: number | undefined;

    if (isRunning && existsSync(PID_FILE)) {
      try {
        const pidData = await readFile(PID_FILE, 'utf8');
        pid = parseInt(pidData.trim());
      } catch {
        // Ignore
      }
    }

    const cacheAge = await this.manager.getCacheAge();
    const cacheSize = await this.manager.getCacheSize();

    return {
      running: isRunning,
      pid,
      cacheAge: Math.floor(cacheAge / (1000 * 60 * 60)), // Hours
      cacheSize: Math.round(cacheSize * 100) / 100, // MB, rounded
      nextUpdate: this.getTimeUntilNextUpdate(),
      config: this.config
    };
  }

  async updateConfig(newConfig: Partial<DaemonConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
    
    // If update interval changed and daemon is running, reschedule
    if (this.isRunning && newConfig.updateIntervalHours) {
      await this.scheduleNextUpdate();
    }
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const daemon = new ContactsCacheDaemon();

  switch (command) {
    case 'start':
      await daemon.start();
      break;

    case 'stop':
      console.error("🛑 Stopping daemon...");
      if (existsSync(PID_FILE)) {
        try {
          const pidData = await readFile(PID_FILE, 'utf8');
          const pid = parseInt(pidData.trim());
          process.kill(pid, 'SIGTERM');
          console.error("✅ Stop signal sent to daemon");
        } catch (error) {
          console.error("❌ Error stopping daemon:", error);
        }
      } else {
        console.error("⚠️ No daemon PID file found");
      }
      break;

    case 'restart':
      // Stop first
      if (existsSync(PID_FILE)) {
        try {
          const pidData = await readFile(PID_FILE, 'utf8');
          const pid = parseInt(pidData.trim());
          process.kill(pid, 'SIGTERM');
          
          // Wait a moment for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error("⚠️ Error during stop phase:", error);
        }
      }
      
      // Then start
      await daemon.start();
      break;

    case 'status':
      const status = await daemon.getStatus();
      console.error("📊 Daemon Status:");
      console.error(`   🟢 Running: ${status.running ? 'YES' : 'NO'}`);
      if (status.pid) console.error(`   🆔 PID: ${status.pid}`);
      console.error(`   🕐 Cache Age: ${status.cacheAge} hours`);
      console.error(`   📏 Cache Size: ${status.cacheSize} MB`);
      console.error(`   ⏰ Next Update: ${status.nextUpdate}`);
      console.error(`   ⚙️ Update Interval: ${status.config.updateIntervalHours} hours`);
      console.error(`   ✅ Enabled: ${status.config.enabled ? 'YES' : 'NO'}`);
      break;

    case 'config':
      const action = process.argv[3];
      if (action === 'set') {
        const key = process.argv[4] as keyof DaemonConfig;
        const value = process.argv[5];
        
        if (!key || value === undefined) {
          console.error("❌ Usage: config set <key> <value>");
          console.error("   Keys: updateIntervalHours, autoStart, logLevel, enabled");
          break;
        }

        await daemon.loadConfig();
        
        // Type conversion based on key
        let parsedValue: any = value;
        if (key === 'updateIntervalHours') parsedValue = parseInt(value);
        if (key === 'autoStart' || key === 'enabled') parsedValue = value.toLowerCase() === 'true';
        
        await daemon.updateConfig({ [key]: parsedValue });
        console.error(`✅ Set ${key} = ${parsedValue}`);
      } else {
        await daemon.loadConfig();
        const status = await daemon.getStatus();
        console.error("⚙️ Current Configuration:");
        console.error(JSON.stringify(status.config, null, 2));
      }
      break;

    case 'update':
      console.error("🔄 Triggering immediate cache update...");
      await daemon.performUpdate();
      break;

    default:
      console.error("📖 ContactsCacheDaemon Usage:");
      console.error("   bun cache-daemon.ts start     - Start the daemon");
      console.error("   bun cache-daemon.ts stop      - Stop the daemon");
      console.error("   bun cache-daemon.ts restart   - Restart the daemon");
      console.error("   bun cache-daemon.ts status    - Show daemon status");
      console.error("   bun cache-daemon.ts update    - Force immediate update");
      console.error("   bun cache-daemon.ts config    - Show configuration");
      console.error("   bun cache-daemon.ts config set <key> <value> - Update config");
      break;
  }
}

// Run CLI if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export default ContactsCacheDaemon;
