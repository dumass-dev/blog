import net from 'net';
import dns from 'dns';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. Force NODE_ENV to test
process.env.NODE_ENV = 'test';

// 2. Read names of env vars from .env (names ONLY, zero secret values read or logged)
try {
  if (fs.existsSync('.env')) {
    const content = fs.readFileSync('.env', 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        if (key) {
          process.env[key] = key.includes('URL') || key.includes('ENDPOINT') ? 'http://127.0.0.1:9999' : 'dummy-value';
        }
      }
    });
  }
} catch (e) {}

// Set explicit dummy overrides for all server / vite variants
process.env.SUPABASE_URL = 'http://127.0.0.1:9999';
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9999';
process.env.SUPABASE_ANON_KEY = 'dummy-anon-key-1234567890';
process.env.VITE_SUPABASE_ANON_KEY = 'dummy-anon-key-1234567890';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key-1234567890';
process.env.BACKBLAZE_ENDPOINT = '127.0.0.1:9999';
process.env.BACKBLAZE_KEY_ID = 'dummy-b2-key-id';
process.env.BACKBLAZE_APPLICATION_KEY = 'dummy-b2-app-key';
process.env.BACKBLAZE_BUCKET = 'dummy-b2-bucket';
process.env.ADMIN_USER_ID = 'admin-uuid-12345678';

// 3. Disable dotenv from ever injecting .env
dotenv.config = () => { return { parsed: {} }; };

// 4. Strict Network Interceptor Guard
global.__outboundAttemptsBlocked = 0;

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let host = 'localhost';
  if (typeof args[0] === 'object' && args[0] !== null) {
    host = args[0].host || args[0].hostname || 'localhost';
  } else if (typeof args[1] === 'string') {
    host = args[1];
  }
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback) {
    global.__outboundAttemptsBlocked++;
    this.on('error', () => {});
    this.destroy(new Error(`[STRICT OFFLINE GUARD] Blocked outbound socket connection to ${host}`));
    return this;
  }
  return originalConnect.apply(this, args);
};

const originalDnsLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  if (!isLoopback) {
    global.__outboundAttemptsBlocked++;
    if (cb) cb(new Error(`[STRICT OFFLINE GUARD] Blocked DNS lookup for ${hostname}`));
    return;
  }
  return originalDnsLookup.apply(this, arguments);
};
