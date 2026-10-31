/**
 * Jira tickets — Host half.
 *
 * Bridges the Jira Cloud REST API v3 to the browser half over a small HTTP API
 * and keeps the credentials on this side only:
 *
 *   GET  /jira/api/meta                       → spaces, statuses, issue types, prefs
 *   GET  /jira/api/issues                     → filtered ticket list
 *   GET  /jira/api/issues/<KEY>               → one ticket with description and comments
 *   GET  /jira/api/issues/<KEY>/transitions   → allowed status transitions
 *   POST /jira/api/issues/<KEY>/transition    → apply a transition
 *   POST /jira/api/issues/<KEY>/comment       → add a comment
 *   POST /jira/api/issues                     → create a ticket
 *   POST /jira/api/prefs                      → persist the panel's filter selection
 *
 * Credentials resolve in this order, first value wins per key: the plugin
 * `config` (baseUrl / email / apiToken), then JIRA_BASE_URL / JIRA_EMAIL /
 * JIRA_API_TOKEN in the host environment, then the env file named by `config.envFile`
 * (`~/.config/dsh-jira/jira.env` by default). The token never leaves this process.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_FILE = path.join(PLUGIN_DIR, '.settings.json')
const API_BASE = '/jira/api'
const DEFAULT_ENV_FILE = '~/.config/dsh-jira/jira.env'
const CREDENTIALS_TTL_MS = 5_000
const PROJECTS_TTL_MS = 5 * 60 * 1000
const STATUSES_TTL_MS = 5 * 60 * 1000
const ISSUE_TYPES_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
const MAX_RESULTS_DEFAULT = 50
const MAX_RESULTS_LIMIT = 100
const MAX_BODY_BYTES = 1 << 20
const MAX_SUMMARY_LENGTH = 255
const MAX_TEXT_LENGTH = 32_000
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/
const SPACE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/
const ASSIGNEES = new Set(['me', 'all'])
const ISSUE_FIELDS = 'summary,status,assignee,priority,issuetype,updated,project'

/** An API failure carrying the HTTP status the panel should receive. */
class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Expand a leading `~` against the host home directory. */
function expandHome(value) {
  const text = String(value || '')
  if (text === '~') return os.homedir()
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2))
  return text
}

/** Read the plugin's own preference file; a missing or broken file reads as empty. */
function readPluginSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist the plugin's preferences, reporting rather than throwing on a failed write. */
function writePluginSettings(value) {
  try {
    fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(value, null, 2)}\n`)
    return true
  } catch (error) {
    console.error('[dsh-jira] settings write failed:', error)
    return false
  }
}

/** Parse a dotenv-style file into plain key/value pairs. */
function parseEnvFile(filePath) {
  const values = {}
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    return values
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

/** Quote one JQL string literal. */
function jqlQuote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Flatten an Atlassian Document Format node into readable plain text. */
function adfToText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return String(node.text || '')
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'rule') return '\n---\n'
  if (node.type === 'mention') return `@${node.attrs?.text || node.attrs?.id || ''}`
  if (node.type === 'inlineCard') return String(node.attrs?.url || '')
  if (node.type === 'emoji') return String(node.attrs?.text || '')
  const children = Array.isArray(node.content) ? node.content : []
  const body = children.map(adfToText).join('')
  if (node.type === 'paragraph' || node.type === 'heading') return `${body}\n`
  if (node.type === 'listItem') return `${body}`
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return `${children.map((child, index) => {
      const text = adfToText(child).trimEnd()
      return `${node.type === 'orderedList' ? `${index + 1}.` : '-'} ${text}`
    }).join('\n')}\n`
  }
  if (node.type === 'codeBlock') return `${body}\n`
  return body
}

/** Build an ADF document from plain text, one paragraph per blank-line block. */
function textToAdf(text) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
  return {
    type: 'doc',
    version: 1,
    content: (paragraphs.length > 0 ? paragraphs : ['']).map((block) => ({
      type: 'paragraph',
      content: block === '' ? [] : [{ type: 'text', text: block }],
    })),
  }
}

/** Build a readable message from a Jira error response. */
function jiraErrorMessage(status, data) {
  const messages = []
  if (data && Array.isArray(data.errorMessages)) messages.push(...data.errorMessages)
  if (data && data.errors && typeof data.errors === 'object') {
    for (const [field, message] of Object.entries(data.errors)) messages.push(`${field}: ${message}`)
  }
  if (messages.length === 0 && data && typeof data.message === 'string') messages.push(data.message)
  if (messages.length > 0) return messages.join(' · ')
  return `Jira a répondu ${status}.`
}

/** Read a JSON request body with a size cap; a missing body reads as undefined. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Requête trop volumineuse.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new HttpError(400, 'Corps JSON invalide.'))
      }
    })
    req.on('error', reject)
  })
}

/** Write one JSON response. */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Read one query parameter, trimmed and length-capped. */
function queryParam(url, name, maxLength = 500) {
  const value = url.searchParams.get(name)
  return value === null ? '' : value.trim().slice(0, maxLength)
}

/** Split a comma-separated parameter into non-empty values. */
function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** Clamp a number into an inclusive range with a fallback for non-numbers. */
function clampCount(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

/** Reject any cross-origin browser write to the local API. */
function writeOriginAllowed(req, webOrigin) {
  const origin = req.headers.origin
  if (!origin) return true
  if (typeof origin === 'string' && (origin.startsWith('dsh-app://') || origin === 'null')) return true
  if (!webOrigin) return false
  try {
    return new URL(origin).origin === new URL(webOrigin).origin
  } catch {
    return false
  }
}

/** Resolve the configured Jira spaces, project list, statuses, and issue types. */
function createJira(config) {
  const configuredSpaces = Array.isArray(config.spaces)
    ? config.spaces.map((key) => String(key).trim().toUpperCase()).filter((key) => SPACE_KEY_RE.test(key))
    : []
  const envFile = expandHome(config.envFile ? String(config.envFile) : DEFAULT_ENV_FILE)
  const baseUrlOverride = String(config.baseUrl || '')
  const emailOverride = String(config.email || '')
  const tokenOverride = String(config.apiToken || '')

  let credentialsCache = { at: 0, value: null }

  /** Resolve credentials, caching the env-file read briefly. */
  function credentials() {
    if (credentialsCache.value && Date.now() - credentialsCache.at < CREDENTIALS_TTL_MS) {
      return credentialsCache.value
    }
    const env = process.env
    const file = parseEnvFile(envFile)
    const baseUrl = String(
      baseUrlOverride || env.JIRA_BASE_URL || env.JIRA_BASE || file.JIRA_BASE_URL || file.JIRA_BASE || '',
    ).replace(/\/+$/, '')
    const email = String(emailOverride || env.JIRA_EMAIL || file.JIRA_EMAIL || '')
    const token = String(tokenOverride || env.JIRA_API_TOKEN || file.JIRA_API_TOKEN || '')
    const value = { baseUrl, email, token, configured: Boolean(baseUrl && email && token) }
    credentialsCache = { at: Date.now(), value }
    return value
  }

  /** Credentials for a request that cannot work without them. */
  function requireCredentials() {
    const value = credentials()
    if (!value.configured) {
      throw new HttpError(
        400,
        "Jira n'est pas configuré : renseigne baseUrl/email/apiToken dans le patch Cordis, ou le fichier d'environnement Jira.",
      )
    }
    return value
  }

  /** One authenticated Jira REST call; Jira error messages reach the panel verbatim. */
  async function request(creds, target, options = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const headers = {
        authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`,
        accept: 'application/json',
      }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      const response = await fetch(`${creds.baseUrl}${target}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const text = await response.text()
      let data = null
      if (text !== '') {
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
      }
      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 502 : response.status
        throw new HttpError(status, jiraErrorMessage(response.status, data))
      }
      return data
    } catch (error) {
      if (error instanceof HttpError) throw error
      if (error && error.name === 'AbortError') throw new HttpError(504, 'Jira ne répond pas (délai dépassé).')
      throw new HttpError(502, `Jira est injoignable : ${error && error.message ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  const projectsCache = { at: 0, value: [] }
  const statusesCache = { at: 0, key: '', value: {} }
  const issueTypesCache = { at: 0, value: {} }

  /** Every project visible to the token, cached. */
  async function projects(creds) {
    if (projectsCache.value.length > 0 && Date.now() - projectsCache.at < PROJECTS_TTL_MS) {
      return projectsCache.value
    }
    const data = await request(creds, '/rest/api/3/project?maxResults=200')
    const rows = (Array.isArray(data) ? data : []).map((project) => ({
      key: String(project.key).toUpperCase(),
      name: String(project.name || project.key),
    }))
    projectsCache.value = rows
    projectsCache.at = Date.now()
    return rows
  }

  /** The spaces the panel may offer: configured ones first, else every project. */
  async function visibleSpaces(creds) {
    const all = await projects(creds)
    if (configuredSpaces.length === 0) return all.map((project) => project.key)
    const known = new Set(all.map((project) => project.key))
    const visible = configuredSpaces.filter((key) => known.has(key))
    const missing = configuredSpaces.filter((key) => !known.has(key))
    if (missing.length > 0) {
      console.warn(`[dsh-jira] spaces introuvables dans Jira, ignorés : ${missing.join(', ')}`)
    }
    return visible.length > 0 ? visible : all.map((project) => project.key)
  }

  /** Status names of one project, from its issue-type workflows. */
  async function statusesOfProject(creds, space) {
    const data = await request(creds, `/rest/api/3/project/${encodeURIComponent(space)}/statuses`)
    const names = []
    for (const issueType of Array.isArray(data) ? data : []) {
      for (const status of Array.isArray(issueType.statuses) ? issueType.statuses : []) {
        const name = String(status.name || '')
        if (name !== '' && !names.includes(name)) names.push(name)
      }
    }
    return names
  }

  /** Status names per visible space, cached as one table. */
  async function statuses(creds, spaces) {
    const key = spaces.join(',')
    if (statusesCache.key === key && Date.now() - statusesCache.at < STATUSES_TTL_MS) {
      return statusesCache.value
    }
    const table = {}
    for (const space of spaces) table[space] = await statusesOfProject(creds, space)
    statusesCache.key = key
    statusesCache.at = Date.now()
    statusesCache.value = table
    return table
  }

  /** Creatable issue types (subtickets excluded) per visible space. */
  async function issueTypes(creds, spaces) {
    const table = {}
    for (const space of spaces) {
      const cached = issueTypesCache.value[space]
      if (cached && Date.now() - cached.at < ISSUE_TYPES_TTL_MS) {
        table[space] = cached.names
        continue
      }
      const data = await request(creds, `/rest/api/3/issue/createmeta/${encodeURIComponent(space)}/issuetypes?maxResults=100`)
      const names = (Array.isArray(data?.issueTypes) ? data.issueTypes : [])
        .filter((type) => type.subtask !== true)
        .map((type) => String(type.name || ''))
        .filter((name) => name !== '')
      issueTypesCache.value[space] = { at: Date.now(), names }
      table[space] = names
    }
    return table
  }

  /** Stored filter preferences, defaulted and clamped to the visible spaces. */
  function preferences(spaces) {
    const stored = readPluginSettings()
    const savedSpaces = Array.isArray(stored.spaces)
      ? stored.spaces.map((key) => String(key).toUpperCase()).filter((key) => spaces.includes(key))
      : []
    const savedStatuses = Array.isArray(stored.statuses)
      ? stored.statuses.map((name) => String(name)).filter((name) => name !== '')
      : []
    return {
      spaces: savedSpaces.length > 0 ? savedSpaces : spaces.slice(),
      statuses: savedStatuses,
      assignee: ASSIGNEES.has(stored.assignee) ? stored.assignee : 'me',
      query: typeof stored.query === 'string' ? stored.query : '',
    }
  }

  /** One ticket list row as the panel renders it. */
  function toRow(creds, issue) {
    const fields = issue.fields || {}
    return {
      key: issue.key,
      space: String(issue.key).split('-')[0],
      summary: String(fields.summary || ''),
      status: String(fields.status?.name || ''),
      statusCategory: String(fields.status?.statusCategory?.key || ''),
      type: String(fields.issuetype?.name || ''),
      priority: String(fields.priority?.name || ''),
      assignee: String(fields.assignee?.displayName || ''),
      updated: String(fields.updated || ''),
      url: `${creds.baseUrl}/browse/${issue.key}`,
    }
  }

  /** One ticket with its description and comments. */
  function toDetail(creds, issue) {
    const fields = issue.fields || {}
    const comments = (fields.comment?.comments || []).map((comment) => ({
      author: String(comment.author?.displayName || ''),
      created: String(comment.created || ''),
      body: adfToText(comment.body).trim(),
    }))
    return {
      ...toRow(creds, issue),
      reporter: String(fields.reporter?.displayName || ''),
      created: String(fields.created || ''),
      description: adfToText(fields.description).trim(),
      comments,
    }
  }

  /** Load one issue by key. */
  async function loadIssue(creds, key) {
    return request(
      creds,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,reporter,priority,issuetype,created,updated,project,description,comment`,
    )
  }

  return {
    configured() {
      return credentials().configured
    },
    credentialSummary() {
      const creds = credentials()
      return { configured: creds.configured, baseUrl: creds.baseUrl || null, email: creds.email || null }
    },
    async meta() {
      const creds = credentials()
      if (!creds.configured) {
        return {
          credentials: { configured: false, baseUrl: null, email: null },
          spaces: [],
          selectableSpaces: [],
          statuses: {},
          issueTypes: {},
          prefs: { spaces: [], statuses: [], assignee: 'me', query: '' },
        }
      }
      const all = await projects(creds)
      const spaces = await visibleSpaces(creds)
      return {
        credentials: { configured: true, baseUrl: creds.baseUrl, email: creds.email },
        spaces: all,
        selectableSpaces: spaces,
        statuses: await statuses(creds, spaces),
        issueTypes: await issueTypes(creds, spaces),
        prefs: preferences(spaces),
      }
    },
    async issues(params) {
      const creds = requireCredentials()
      const spaces = await visibleSpaces(creds)
      const prefs = preferences(spaces)
      let requested = splitList(params.spaces)
        .map((key) => key.toUpperCase())
        .filter((key) => spaces.includes(key))
      if (requested.length === 0) requested = prefs.spaces.filter((key) => spaces.includes(key))
      if (requested.length === 0) requested = spaces.slice()
      const requestedStatuses = splitList(params.statuses)
      const assignee = ASSIGNEES.has(params.assignee) ? params.assignee : prefs.assignee
      const query = String(params.query || '').trim().slice(0, 200)
      const max = clampCount(params.max, MAX_RESULTS_DEFAULT, 1, MAX_RESULTS_LIMIT)
      let jql = `project in (${requested.map(jqlQuote).join(', ')})`
      if (requestedStatuses.length > 0) jql += ` AND status in (${requestedStatuses.map(jqlQuote).join(', ')})`
      if (assignee === 'me') jql += ' AND assignee = currentUser()'
      if (query !== '') jql += ` AND text ~ ${jqlQuote(query)}`
      jql += ' ORDER BY updated DESC'
      const target = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${max}&fields=${ISSUE_FIELDS}`
      const data = await request(creds, target)
      const issues = (Array.isArray(data?.issues) ? data.issues : []).map((issue) => toRow(creds, issue))
      return { ok: true, issues, count: issues.length, truncated: data?.isLast === false, jql }
    },
    async issue(rawKey) {
      const creds = requireCredentials()
      const key = String(rawKey || '').toUpperCase()
      if (!ISSUE_KEY_RE.test(key)) throw new HttpError(400, 'Clé de ticket invalide.')
      return { ok: true, ...toDetail(creds, await loadIssue(creds, key)) }
    },
    async transitions(rawKey) {
      const creds = requireCredentials()
      const key = String(rawKey || '').toUpperCase()
      if (!ISSUE_KEY_RE.test(key)) throw new HttpError(400, 'Clé de ticket invalide.')
      const data = await request(creds, `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`)
      const transitions = (Array.isArray(data?.transitions) ? data.transitions : []).map((transition) => ({
        id: String(transition.id),
        name: String(transition.name || ''),
        to: String(transition.to?.name || ''),
      }))
      return { ok: true, transitions }
    },
    async transition(rawKey, body) {
      const creds = requireCredentials()
      const key = String(rawKey || '').toUpperCase()
      if (!ISSUE_KEY_RE.test(key)) throw new HttpError(400, 'Clé de ticket invalide.')
      const id = String(body?.id || '').trim()
      if (id === '') throw new HttpError(400, 'Transition id manquant.')
      await request(creds, `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        body: { transition: { id } },
      })
      const issue = await request(creds, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`)
      return { ok: true, status: String(issue?.fields?.status?.name || '') }
    },
    async comment(rawKey, body) {
      const creds = requireCredentials()
      const key = String(rawKey || '').toUpperCase()
      if (!ISSUE_KEY_RE.test(key)) throw new HttpError(400, 'Clé de ticket invalide.')
      const text = String(body?.body || '').trim()
      if (text === '') throw new HttpError(400, 'Le commentaire est vide.')
      if (text.length > MAX_TEXT_LENGTH) throw new HttpError(400, 'Commentaire trop long.')
      const created = await request(creds, `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST',
        body: { body: textToAdf(text) },
      })
      return {
        ok: true,
        comment: {
          author: String(created?.author?.displayName || ''),
          created: String(created?.created || ''),
          body: adfToText(created?.body).trim() || text,
        },
      }
    },
    async create(body) {
      const creds = requireCredentials()
      const spaces = await visibleSpaces(creds)
      const space = String(body?.space || '').toUpperCase()
      if (!SPACE_KEY_RE.test(space) || !spaces.includes(space)) {
        throw new HttpError(400, `Espace inconnu : ${space || '(vide)'}.`)
      }
      const summary = String(body?.summary || '').trim()
      if (summary === '') throw new HttpError(400, 'Le résumé est obligatoire.')
      if (summary.length > MAX_SUMMARY_LENGTH) throw new HttpError(400, 'Résumé trop long (255 caractères maximum).')
      const types = (await issueTypes(creds, [space]))[space] || []
      const requestedType = String(body?.type || '').trim()
      const type = requestedType !== '' && types.includes(requestedType) ? requestedType : types[0]
      if (!type) throw new HttpError(400, `Aucun type de ticket créable dans l'espace ${space}.`)
      const description = String(body?.description || '').trim()
      const fields = { project: { key: space }, summary, issuetype: { name: type } }
      if (description !== '') fields.description = textToAdf(description)
      const created = await request(creds, '/rest/api/3/issue', { method: 'POST', body: { fields } })
      const issue = await loadIssue(creds, String(created?.key || ''))
      return { ok: true, ...toDetail(creds, issue) }
    },
    async savePrefs(body) {
      const creds = credentials()
      const spaces = creds.configured ? await visibleSpaces(creds) : []
      const next = preferences(spaces)
      if (body && typeof body === 'object') {
        if (Array.isArray(body.spaces)) {
          const saved = body.spaces.map((key) => String(key).toUpperCase()).filter((key) => spaces.includes(key))
          next.spaces = saved.length > 0 ? saved : spaces.slice()
        }
        if (Array.isArray(body.statuses)) {
          next.statuses = body.statuses.map((name) => String(name)).filter((name) => name !== '')
        }
        if (ASSIGNEES.has(body.assignee)) next.assignee = body.assignee
        if (typeof body.query === 'string') next.query = body.query.slice(0, 200)
      }
      writePluginSettings(next)
      return { ok: true, prefs: next }
    },
  }
}

/** Register the plugin's HTTP API once the host Web server exists. */
export function apply(ctx, config = {}) {
  const settings = config && typeof config === 'object' ? config : {}
  const jira = createJira(settings)
  // The Web connection service owns the Host/Origin fence and the browser-session
  // cookie; without it (another profile), the fence degrades to the Origin check.
  const requireAuth = settings.requireAuth !== false

  /** Resolve the optional `connection` service without failing when it is absent. */
  function connectionOrNull() {
    try {
      return ctx.get('connection')
    } catch {
      return undefined
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    let webOrigin = null
    try {
      webOrigin = webCtx.webServer.getOrigin()
    } catch {
      webOrigin = null
    }

    /** Route one API call and translate every failure into a JSON error response. */
    async function handle(req, res) {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const segments = url.pathname
        .slice(API_BASE.length)
        .split('/')
        .filter((segment) => segment !== '')
      const method = String(req.method || 'GET').toUpperCase()

      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Méthode non autorisée.' })
      }
      if (requireAuth) {
        const connection = connectionOrNull()
        if (connection && typeof connection.requestRejection === 'function') {
          const rejection = connection.requestRejection(req)
          if (rejection !== undefined) {
            return sendJson(res, rejection, { ok: false, error: 'Non authentifié.' })
          }
        }
      }
      if (method === 'POST' && !writeOriginAllowed(req, webOrigin)) {
        return sendJson(res, 403, { ok: false, error: 'Origine refusée.' })
      }

      try {
        if (method === 'POST') {
          if (segments[0] === 'prefs' && segments.length === 1) {
            return sendJson(res, 200, await jira.savePrefs(await readJsonBody(req)))
          }
          if (segments[0] === 'issues' && segments.length === 1) {
            return sendJson(res, 201, await jira.create(await readJsonBody(req)))
          }
          if (segments[0] === 'issues' && segments.length === 3 && segments[2] === 'transition') {
            return sendJson(res, 200, await jira.transition(segments[1], await readJsonBody(req)))
          }
          if (segments[0] === 'issues' && segments.length === 3 && segments[2] === 'comment') {
            return sendJson(res, 200, await jira.comment(segments[1], await readJsonBody(req)))
          }
          return sendJson(res, 404, { ok: false, error: 'Route inconnue.' })
        }
        if (segments[0] === 'meta' && segments.length === 1) {
          return sendJson(res, 200, await jira.meta())
        }
        if (segments[0] === 'issues' && segments.length === 1) {
          return sendJson(res, 200, await jira.issues({
            spaces: queryParam(url, 'spaces', 500),
            statuses: queryParam(url, 'statuses', 1000),
            assignee: queryParam(url, 'assignee', 10),
            query: queryParam(url, 'query', 200),
            max: queryParam(url, 'max', 5),
          }))
        }
        if (segments[0] === 'issues' && segments.length === 2) {
          return sendJson(res, 200, await jira.issue(segments[1]))
        }
        if (segments[0] === 'issues' && segments.length === 3 && segments[2] === 'transitions') {
          return sendJson(res, 200, await jira.transitions(segments[1]))
        }
        return sendJson(res, 404, { ok: false, error: 'Route inconnue.' })
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500
        if (status >= 500) console.error('[dsh-jira] API error:', error)
        return sendJson(res, status, { ok: false, error: error && error.message ? error.message : String(error) })
      }
    }

    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'prefix',
          path: API_BASE,
          handler: (req, res) => {
            handle(req, res).catch((error) => {
              sendJson(res, 500, { ok: false, error: String(error && error.message) })
            })
          },
        }),
      'dsh-jira: api route',
    )
  })
}

/** Exposed for offline verification of the pure helpers. */
export const __internals = {
  adfToText,
  textToAdf,
  jqlQuote,
  jiraErrorMessage,
  parseEnvFile,
  splitList,
  clampCount,
  writeOriginAllowed,
}
