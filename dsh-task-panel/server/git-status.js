import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {localRequest} from './file-clipboard.js'

const exec = promisify(execFile)

function resolveCwd(payload, sessions) {
  let cwd = payload?.cwd
  if (!cwd && payload?.sessionId && sessions?.binding) {
    try {
      const b = sessions.binding(payload.sessionId)
      cwd = b?.session?.header?.cwd || b?.session?.cwd
    } catch {}
  }
  if (!cwd) cwd = process.cwd()
  return cwd
}

export function registerGitStatus(root) {
  if (typeof root?.inject !== 'function') return
  return root.inject(['webServer', 'sessions'], scope => {
    const server = scope.get?.('webServer') || scope.webServer
    const sessions = scope.get?.('sessions') || scope.sessions
    if (!server?.register) return

    server.register({
      kind: 'exact',
      path: '/dsh-task-panel/git-status',
      handler: async (req, res) => {
        const reply = (status, data) => {
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          })
          res.end(JSON.stringify(data))
        }
        if (req.method !== 'POST') return reply(405, {ok: false, message: 'Method not allowed'})
        if (!localRequest(req)) return reply(403, {ok: false, message: 'Forbidden'})

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}')
            const cwd = resolveCwd(payload, sessions)

            try {
              const {stdout: statusOut} = await exec('git', ['status', '--porcelain=v1', '-uall'], {cwd, timeout: 5000})
              const lines = statusOut.split('\n').map(l => l.trimEnd()).filter(Boolean)
              let branch = 'HEAD'
              try {
                const {stdout: branchOut} = await exec('git', ['branch', '--show-current'], {cwd, timeout: 3000})
                branch = branchOut.trim() || 'HEAD'
              } catch {}

              let additions = 0
              let deletions = 0
              try {
                const {stdout: diffOut} = await exec('git', ['diff', '--shortstat'], {cwd, timeout: 5000})
                const insMatch = diffOut.match(/(\d+)\s+insertion/)
                const delMatch = diffOut.match(/(\d+)\s+deletion/)
                if (insMatch) additions += parseInt(insMatch[1], 10)
                if (delMatch) deletions += parseInt(delMatch[1], 10)
              } catch {}

              reply(200, {
                ok: true,
                status: {
                  isRepo: true,
                  branch,
                  changedFiles: lines.length,
                  additions,
                  deletions
                }
              })
            } catch {
              reply(200, {
                ok: true,
                status: {
                  isRepo: false
                }
              })
            }
          } catch (e) {
            reply(500, {ok: false, message: e.message})
          }
        })
      }
    })

    server.register({
      kind: 'exact',
      path: '/dsh-task-panel/git-branches',
      handler: async (req, res) => {
        const reply = (status, data) => {
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          })
          res.end(JSON.stringify(data))
        }
        if (req.method !== 'POST') return reply(405, {ok: false, message: 'Method not allowed'})
        if (!localRequest(req)) return reply(403, {ok: false, message: 'Forbidden'})

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}')
            const cwd = resolveCwd(payload, sessions)
            try {
              const {stdout: branchOut} = await exec('git', ['branch', '--show-current'], {cwd, timeout: 3000}).catch(() => ({stdout: ''}))
              const current = branchOut.trim() || 'HEAD'
              const {stdout: refsOut} = await exec('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {cwd, timeout: 3000})
              let names = refsOut.split('\n').map(l => l.trim()).filter(Boolean)
              if (current && !names.includes(current)) names = [current, ...names]
              reply(200, {ok: true, current, names})
            } catch (e) {
              reply(200, {ok: false, error: e.message, names: []})
            }
          } catch (e) {
            reply(500, {ok: false, message: e.message})
          }
        })
      }
    })

    server.register({
      kind: 'exact',
      path: '/dsh-task-panel/git-checkout',
      handler: async (req, res) => {
        const reply = (status, data) => {
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
          })
          res.end(JSON.stringify(data))
        }
        if (req.method !== 'POST') return reply(405, {ok: false, message: 'Method not allowed'})
        if (!localRequest(req)) return reply(403, {ok: false, message: 'Forbidden'})

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}')
            const branch = payload.branch
            if (!branch || typeof branch !== 'string') return reply(400, {ok: false, message: 'Branch required'})
            const cwd = resolveCwd(payload, sessions)
            try {
              await exec('git', ['checkout', '--end-of-options', branch], {cwd, timeout: 8000})
              reply(200, {ok: true, branch})
            } catch (e) {
              reply(400, {ok: false, message: e.message || 'Checkout failed'})
            }
          } catch (e) {
            reply(500, {ok: false, message: e.message})
          }
        })
      }
    })
  })
}
