import type { PolicyAccent, PolicyDocument } from './domain'
import { estimateDataUrlSize } from './employeeDocuments'

export const MAX_POLICY_BYTES = Math.floor(1.5 * 1024 * 1024)
export const ACCEPTED_POLICY_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,text/plain,.pdf,.jpg,.jpeg,.png,.webp,.txt'

export const POLICY_ACCENTS: PolicyAccent[] = ['coral', 'lavender', 'mint', 'sage']

const demoFile = (label: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(
    `${label}\n\nDemo company policy stored locally in Finch.`,
  )}`

export function nextPolicyId(policies: PolicyDocument[]) {
  return Math.max(0, ...policies.map((policy) => policy.id)) + 1
}

export function sortedPolicies(policies: PolicyDocument[]) {
  return [...policies].sort((a, b) => a.title.localeCompare(b.title))
}

export function formatPolicyUpdatedAt(iso: string) {
  return `Updated ${new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`
}

export function nextPolicyAccent(policies: PolicyDocument[]): PolicyAccent {
  const counts = Object.fromEntries(POLICY_ACCENTS.map((accent) => [accent, 0])) as Record<
    PolicyAccent,
    number
  >
  for (const policy of policies) {
    counts[policy.accent] += 1
  }
  return POLICY_ACCENTS.reduce((best, accent) =>
    counts[accent] < counts[best] ? accent : best,
  )
}

export function policyPreviewKind(
  policy: PolicyDocument,
): 'text' | 'image' | 'pdf' | 'other' {
  const type = policy.fileType.toLowerCase()
  const name = policy.fileName.toLowerCase()
  if (
    type.startsWith('text/') ||
    type.includes('json') ||
    name.endsWith('.txt') ||
    policy.fileDataUrl.startsWith('data:text/')
  ) {
    return 'text'
  }
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return 'image'
  }
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf'
  }
  return 'other'
}

export function readPolicyText(policy: PolicyDocument) {
  try {
    const comma = policy.fileDataUrl.indexOf(',')
    if (comma < 0) return policy.description || policy.title
    const meta = policy.fileDataUrl.slice(0, comma)
    const payload = policy.fileDataUrl.slice(comma + 1)
    if (meta.includes(';base64')) {
      return decodeURIComponent(escape(atob(payload)))
    }
    return decodeURIComponent(payload)
  } catch {
    return policy.description || policy.title
  }
}

/** @deprecated Prefer in-app PolicyViewerModal — popup/data-URL opens are often blocked. */
export function openPolicyDocument(policy: PolicyDocument) {
  const link = window.document.createElement('a')
  link.href = policy.fileDataUrl
  link.download = policy.fileName || `${policy.title}.txt`
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

export function isAcceptedPolicyFile(file: File) {
  if (
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(file.type)
  ) {
    return true
  }
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.pdf') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.txt')
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export async function preparePolicyFile(
  file: File,
): Promise<{ fileName: string; fileType: string; fileDataUrl: string } | { error: string }> {
  if (!isAcceptedPolicyFile(file)) {
    return { error: 'Use a PDF, image, or plain text file' }
  }
  if (file.size > MAX_POLICY_BYTES) {
    return { error: 'Each policy file must be 1.5 MB or smaller' }
  }
  try {
    const fileDataUrl = await readFileAsDataUrl(file)
    if (estimateDataUrlSize(fileDataUrl) > MAX_POLICY_BYTES) {
      return { error: 'Each policy file must be 1.5 MB or smaller' }
    }
    return {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileDataUrl,
    }
  } catch {
    return { error: 'Could not read that file' }
  }
}

export const initialPolicies: PolicyDocument[] = [
  {
    id: 1,
    title: 'Annual leave policy',
    description: 'How we request, approve, and plan annual leave.',
    fileName: 'annual-leave-policy.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Annual leave policy'),
    updatedAt: '2026-05-12T09:00:00.000Z',
    accent: 'coral',
  },
  {
    id: 2,
    title: 'Data protection & privacy',
    description: 'How we look after personal and company information.',
    fileName: 'data-protection-privacy.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Data protection & privacy'),
    updatedAt: '2026-02-04T09:00:00.000Z',
    accent: 'lavender',
  },
  {
    id: 3,
    title: 'Sickness & absence',
    description: 'What to do when you need time away unexpectedly.',
    fileName: 'sickness-absence.txt',
    fileType: 'text/plain',
    fileDataUrl: demoFile('Sickness & absence'),
    updatedAt: '2026-01-18T09:00:00.000Z',
    accent: 'mint',
  },
]
