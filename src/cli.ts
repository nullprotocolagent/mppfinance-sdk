#!/usr/bin/env node

import { MPPFinance } from './client'

const args = process.argv.slice(2)

async function demo() {
  const client = new MPPFinance({
    agentId: 'demo-agent',
    network: 'solana',
    testnet: true,
  })

  console.log('\n\x1b[90m  MPPFinance SDK\x1b[0m \x1b[2mv' + require('../package.json').version + '\x1b[0m\n')
  console.log('  \x1b[90m→\x1b[0m issuing virtual card...')

  await sleep(300)

  const card = await client.issue({
    amount: 50_00,
    currency: 'USD',
    rules: {
      merchant: 'aws.com',
      singleUse: true,
      expiresIn: 300,
    },
  })

  console.log('  \x1b[32m✓\x1b[0m card ready in 0.3s\n')
  console.log('  \x1b[90mid      \x1b[0m', card.id)
  console.log('  \x1b[90mnumber  \x1b[0m', card.number)
  console.log('  \x1b[90mcvv     \x1b[0m', card.cvv)
  console.log('  \x1b[90mexpiry  \x1b[0m', card.expiry)
  console.log('  \x1b[90mamount  \x1b[0m', `$${(card.amount / 100).toFixed(2)} ${card.currency}`)
  console.log('  \x1b[90mmerchant\x1b[0m', card.merchant ?? '—')
  console.log('  \x1b[90mstatus  \x1b[0m', '\x1b[32m' + card.status + '\x1b[0m')

  console.log('\n  \x1b[90m→\x1b[0m revoking card...')
  await sleep(150)
  await client.revoke(card.id)
  console.log('  \x1b[32m✓\x1b[0m card revoked\n')

  console.log('  \x1b[90mdocs    \x1b[0m https://github.com/mppfinance/mppfinance-sdk')
  console.log('  \x1b[90mnpm     \x1b[0m npm install mppfinance\n')
}

async function mcp() {
  const { MPPFinanceMCP } = require('./mcp')
  const server = new MPPFinanceMCP({
    agentId: process.env.MPPFINANCE_AGENT_ID ?? 'agent',
    network: (process.env.MPPFINANCE_NETWORK as 'solana' | 'ethereum') ?? 'solana',
    testnet: process.env.MPPFINANCE_TESTNET === 'true',
  })

  // MCP stdio protocol
  process.stdin.setEncoding('utf8')

  const sendResponse = (id: unknown, result: unknown) => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, result })
    process.stdout.write('Content-Length: ' + Buffer.byteLength(msg) + '\r\n\r\n' + msg)
  }

  const sendError = (id: unknown, code: number, message: string) => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
    process.stdout.write('Content-Length: ' + Buffer.byteLength(msg) + '\r\n\r\n' + msg)
  }

  let buffer = ''
  process.stdin.on('data', async (chunk) => {
    buffer += chunk
    const parts = buffer.split('\r\n\r\n')
    if (parts.length < 2) return

    buffer = parts.slice(2).join('\r\n\r\n')
    const body = parts[1]
    if (!body) return

    let req: any
    try { req = JSON.parse(body) } catch { return }

    if (req.method === 'initialize') {
      sendResponse(req.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mppfinance', version: require('../package.json').version },
      })
    } else if (req.method === 'tools/list') {
      sendResponse(req.id, { tools: server.tools() })
    } else if (req.method === 'tools/call') {
      try {
        const result = await server.call(req.params.name, req.params.arguments ?? {})
        sendResponse(req.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      } catch (e: any) {
        sendError(req.id, -32603, e.message)
      }
    } else {
      sendResponse(req.id, {})
    }
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (args.includes('--mcp')) {
  mcp()
} else {
  demo().catch(console.error)
}
