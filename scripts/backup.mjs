import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(ROOT, 'data', 'backups'))
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14))
const DATABASE_URL = (process.env.DATABASE_URL || '').trim()

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function rotateLocal(dir, keep) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('finch-') && name.endsWith('.dump'))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const stale of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, stale.name))
    console.log(`Removed old backup ${stale.name}`)
  }
}

function s3Configured() {
  return Boolean(
    (process.env.S3_BUCKET || '').trim() &&
      (process.env.S3_ACCESS_KEY_ID || '').trim() &&
      (process.env.S3_SECRET_ACCESS_KEY || '').trim(),
  )
}

async function uploadOptional(filePath) {
  if (!s3Configured()) {
    console.log('S3 not configured — keeping local backup only')
    return { uploaded: false }
  }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const bucket = process.env.S3_BUCKET.trim()
  const prefix = (process.env.S3_PREFIX || 'finch-backups/').replace(/^\//, '')
  const endpoint = (process.env.S3_ENDPOINT || '').trim() || undefined
  const region = (process.env.S3_REGION || 'auto').trim()
  const forcePathStyle = ['1', 'true', 'yes', 'on'].includes(
    (process.env.S3_FORCE_PATH_STYLE || '').trim().toLowerCase(),
  )

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim(),
    },
  })

  const key = `${prefix}${path.basename(filePath)}`
  const body = fs.readFileSync(filePath)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/octet-stream',
    }),
  )
  console.log(`Uploaded backup to s3://${bucket}/${key}`)
  return { uploaded: true, key }
}

export async function runBackup() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required for backups')
  }

  ensureDir(BACKUP_DIR)
  const fileName = `finch-${timestamp()}.dump`
  const filePath = path.join(BACKUP_DIR, fileName)

  console.log(`Writing ${filePath}`)
  const result = spawnSync(
    'pg_dump',
    ['--format=custom', '--file', filePath, '--dbname', DATABASE_URL],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'pg_dump failed')
  }

  rotateLocal(BACKUP_DIR, KEEP)
  await uploadOptional(filePath)
  return { filePath }
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  runBackup()
    .then((result) => {
      console.log('Backup complete:', result.filePath)
      process.exit(0)
    })
    .catch((error) => {
      console.error('Backup failed:', error?.message || error)
      process.exit(1)
    })
}
