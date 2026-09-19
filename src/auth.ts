import type { PublicAccount } from './api'

export type AccountRole = 'admin' | 'employee'
export type AccountStatus = 'Active' | 'Inactive'

/** Client-side account identity — password hashes never leave the server. */
export type Account = PublicAccount

export function accountInitialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function activeAdminCount(accounts: Account[]) {
  return accounts.filter((account) => account.role === 'admin' && account.status === 'Active')
    .length
}

export function nextAccountId(accounts: Account[]) {
  return Math.max(0, ...accounts.map((account) => account.id)) + 1
}
