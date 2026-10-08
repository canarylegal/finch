import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  clearPasswordSetupIfToken,
  issuePasswordSetup,
} from '../server/passwordSetup.mjs'

describe('password setup token clearing', () => {
  test('failed delivery clears only its own token', () => {
    const account = { id: 1, email: 'a@example.com', mustSetPassword: false }
    const tokenA = issuePasswordSetup(account, 'reset')
    const hashAfterA = account.passwordSetup.tokenHash
    const tokenB = issuePasswordSetup(account, 'reset')
    assert.notEqual(account.passwordSetup.tokenHash, hashAfterA)

    // Request A fails to send and tries to clear — must not wipe token B.
    assert.equal(clearPasswordSetupIfToken(account, tokenA), false)
    assert.ok(account.passwordSetup)
    assert.equal(account.passwordSetup.tokenHash !== hashAfterA, true)

    // Request B fails — clears its own token.
    assert.equal(clearPasswordSetupIfToken(account, tokenB), true)
    assert.equal(account.passwordSetup, undefined)
  })
})
