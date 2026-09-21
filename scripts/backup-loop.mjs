import dotenv from 'dotenv'
import { runBackup } from './backup.mjs'

dotenv.config()

const INTERVAL_SECONDS = Math.max(60, Number(process.env.BACKUP_INTERVAL_SECONDS || 86400))

async function tick() {
  try {
    await runBackup()
  } catch (error) {
    console.error('Scheduled backup failed:', error?.message || error)
  }
}

console.log(`Finch backup loop every ${INTERVAL_SECONDS}s (S3 optional)`)
await tick()
setInterval(() => {
  void tick()
}, INTERVAL_SECONDS * 1000)
