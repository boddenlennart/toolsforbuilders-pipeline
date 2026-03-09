// PM2 Ecosystem Configuration for @toolsforbuilders Instagram Pipeline

module.exports = {
  apps: [
    // ig-daily and ig-research removed — legacy scripts, replaced by daily-crosspost and weekly-content-research
    {
      name: 'ig-token-refresh',
      script: 'refresh-token.mjs',
      cwd: '/root/.openclaw/workspace/scripts/instagram',
      interpreter: 'node',
      cron_restart: '0 0 1 * *', // 1st of each month at midnight UTC
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    // NOTE: daily-crosspost REMOVED from PM2 (Fix 7)
    // It is now managed exclusively by system crontab to avoid duplicate trigger risk.
    // Crontab entry: 0 12 * * * /usr/bin/node /root/.openclaw/workspace/scripts/daily-crosspost.mjs
    {
      name: 'youtube-token-refresh',
      script: '/root/.openclaw/workspace/scripts/youtube/refresh-token.mjs',
      interpreter: 'node',
      cron_restart: '0 0 1 * *', // 1st of each month at midnight UTC
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    // tiktok-token-refresh removed — TikTok uses manual posting via Telegram handoff
    {
      name: 'weekly-content-research',
      script: '/root/.openclaw/workspace/scripts/weekly-content-research.mjs',
      interpreter: 'node',
      cron_restart: '0 20 * * 0', // Sunday 20:00 UTC — prepares queue for the coming week
      autorestart: false,
      watch: false,
      env: { NODE_ENV: 'production' }
    },
    // kb-weekly-refresh REMOVED — absorbed into weekly-content-research (Sunday 20:00 UTC)
    // KB updates, research findings, and script generation now happen in one job.
  ]
};
