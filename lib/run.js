const request = require('./request')

const { GITHUB_SHA, GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_WORKSPACE } = process.env
console.log(`GITHUB_SHA: ${GITHUB_SHA}`)
console.log(`GITHUB_PATH: ${GITHUB_PATH}`)
console.log(`GITHUB_TOKEN: ${GITHUB_TOKEN}`)
console.log(`GITHUB_WORKSPACE: ${GITHUB_WORKSPACE}`)
const event = require(GITHUB_EVENT_PATH)
const { repository } = event
const {
  owner: { login: owner }
} = repository
const { name: repo } = repository

const checkName = 'ESLint check'

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github.antiope-preview+json',
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  'User-Agent': 'eslint-action'
}

async function createCheck() {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'in_progress',
    started_at: new Date()
  }

  const { data } = await request(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers,
    body
  })
  const { id } = data
  return id
}

function eslint() {
  const eslint = require('eslint')

  const cli = new eslint.CLIEngine({
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    ignorePath: '.gitignore'
  })
  const report = cli.executeOnFiles(['.'])
  // fixableErrorCount, fixableWarningCount are available too
  let { results, errorCount, warningCount } = report

  const levels = ['', 'warning', 'failure']

  const annotations = []
  for (const result of results) {

    const { filePath, messages } = result
    const path = filePath.substring(GITHUB_WORKSPACE.length + 1)
    for (const msg of messages) {
      const { line, severity, ruleId, message } = msg
      const annotationLevel = levels[severity]
      // check-runs API only receives a maximum 50 annotations
      if (annotations.length >= 40) break;
      annotations.push({
        path,
        start_line: line,
        end_line: line,
        annotation_level: annotationLevel,
        message: `[${ruleId}] ${message}`
      })
    }
  }
  console.log(`annotations length: ${annotations.length}`)

  return {
    conclusion: errorCount > 0 ? 'failure' : 'success',
    output: {
      title: checkName,
      summary: `${errorCount} error(s), ${warningCount} warning(s) found`,
      annotations
    }
  }
}

async function updateCheck(id, conclusion, output) {
  const body = {
    name: checkName,
    head_sha: GITHUB_SHA,
    status: 'completed',
    completed_at: new Date(),
    conclusion,
    output
  }

  console.log('Annotations:')
  console.log(output.annotations)
  await request(`https://api.github.com/repos/${owner}/${repo}/check-runs/${id}`, {
    method: 'PATCH',
    headers,
    body
  }, exitWithError)
}

function exitWithError(err) {
  console.error('Error', err.stack)
  if (err.data) {
    console.error(err.data)
  }
  process.exit(1)
}

async function run() {
  const id = await createCheck()
  try {
    const { conclusion, output } = eslint()
    console.log(output.summary)
    await updateCheck(id, conclusion, output)
    if (conclusion === 'failure') {
      process.exit(78)
    }
  } catch (err) {
    await updateCheck(id, 'failure')
    exitWithError(err)
  }
}

run().catch(exitWithError)
