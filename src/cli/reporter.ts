import { tap, scan } from 'rxjs/operators'
import { Context, File, Test, FileType } from '../types'
import chalk from 'chalk'
import logger from './logger'
import { prettifyPath } from '../utils'

  // |> tap(({ entryFiles  }: Context) => {
  //   logger.clear()
  //   logger.progress(`\n${chalk.grey(`Building ${entryFiles.map(prettifyPath).join(', ')}`)}`)
  // })

const formatTest = ({ description, error: { message } }: Test) => `\
 ${description}
 ${chalk.gray(
   message
     .split('\n')
     .shift()
     .trim())}

${chalk.red(
   message
     .split('\n')
     .splice(2)
     .join('\n'))}`
 
 
const formatTests = ({ name, tests = [] }: File) =>
  tests.length
  ? `\
${chalk.underline(prettifyPath(name))}

${tests
    .map(formatTest)
    .join('\n')}`
  : ''
// buildTime, analyzeTime, testTime,
// ${chalk.green(`Built in ${buildTime}.`)}
// ${chalk.green(`Analyzed in ${analyzeTime}.`)}
// ${chalk.green(`Tested in ${testTime}.`)}

const formatAnalyzing = (files: File[]) => {
  const analyzingFiles = files.filter(({ type }) => FileType.ANALYZE === type)
  return analyzingFiles.length
    ? `Analyzing ${
      analyzingFiles
        .map(({ name }) => prettifyPath(name))
        .join(', ')
      }\n\n`
    : ''
}

const formatErrors = (files: File[]) =>
`${chalk.reset.red(`Errors:`)}

${chalk.reset(
  files
    .map(({ tests, ...rest }) => ({
      tests: tests.filter(({ error }) => !!error),
      ...rest
    }))
    .map(formatTests)
    .join('\n'))}`

const formatFileStatus = (files: File[]) => `
${chalk.reset.bold.gray(`Files:`)}

${files
  .map(({ name, tests }) => {
    const isFinished = tests.every(({ type }) => !!type)
    const finishedTests = tests.filter(({ type }) => type)
    const erroredTests = tests.filter(({ error }) => error)
    const hasErrors = erroredTests.length
    return chalk.reset[
      !isFinished ? 'gray'
      : hasErrors ? 'red'
      : 'green'](`${prettifyPath(name)} ${finishedTests.length}(${finishedTests.length - erroredTests.length})/${tests.length}`)
  })
  .map(str => `  ${str}`)
  .join('\n')}`


const format = (files: File[]) => `
${formatAnalyzing(files)}\
${formatErrors(files)}\
${formatFileStatus(files)}`

export default
  options =>
    scan((state, val: any) => { // File | Context
      if (val.name === 'buildStart') {
        logger.clear()
        logger.progress(`\n${chalk.grey(`Bundling...`)}`)
        return { files: [] }
      } else if (val.name === 'bundled') {
        logger.progress(`\n${chalk.grey(`Bundled`)}`)
        return state
      }
      const file: File = val
      const { files }: { files: File[] } = state

      const foundFile = files.find(({ name }) => val.name === name)
      const currentFile = foundFile || file
      if (file.type === FileType.ANALYZE) {

        const foundFile = files.find(({ name }) => val.name === name)
        if (!foundFile) files.push(file)
        else Object.assign(foundFile, file)

      } else if(file.type === FileType.TEST) {

        if (!currentFile.tests) currentFile.tests = []

        const test: Test = file.test
        const foundTest = currentFile.tests.find(({ description }) => test.description === description)

        if (foundTest) Object.assign(foundTest, test)
        else if (!foundTest) currentFile.tests.push(test)

        const fileIsDone =
          currentFile.tests.every(test => 'value' in test)

        currentFile.type = fileIsDone ? FileType.DONE : FileType.TEST
      }

      const isFinished =
        files.length &&
        files.every(({ type }) =>
          FileType.DONE === type)

      logger[isFinished ? 'success' : 'progress'](format(files))
      
      return state
    }, {})