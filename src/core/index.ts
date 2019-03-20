import { merge, ConnectableObservable, from, of, zip, Observable } from 'rxjs'
import { map, filter, mergeMap, switchMap, publish, tap, delayWhen } from 'rxjs/operators'

import { Options, Context, BUNDLER_TARGET, TARGET, File, TargetRuntimeProvider as TargetRuntimeProviderType } from '../types'
import Bundler from './bundler'
import { transformPathToTestUrl } from '../utils/index'
import TargetRuntimeProvider from './target-runtime-provider'
import analyze from './analyze'
import test from './test'
import { isBrowser } from './utils'
import server from './server'
import localRequire from '../utils/localRequire'


export default (_options: Options) => {
  // remove undefined values
  Object.keys(_options).forEach(key => _options[key] === undefined && delete _options[key])

  const target = _options.target || BUNDLER_TARGET.BROWSER
  const options = {
    browsers: ['chrome'],
    target,
    outDir: `.epk/dist/${target}`,
    watch: true,
    cache: true,
    cacheDir: `.epk/cache/${target}`,
    port: undefined,
    minify: false,
    scopeHoist: false,
    logLevel: 0, // 3 = log everything, 2 = log warnings & errors, 1 = log errors
    sourceMaps: true, // Enable or disable sourcemaps, defaults to enabled (minified builds currently always create sourcemaps)
    detailedReport: false,
    // apply options
    ..._options
  }
  let _port
  if (!isBrowser && options.target === BUNDLER_TARGET.BROWSER) {
    _port = localRequire('get-port', __filename)
              .then(getPort => getPort({ port: 10485 }))
              .then(port => (options.port = port))
  }
  // @ts-ignore
  return of([
            Bundler(options),
            (!isBrowser && options.target === BUNDLER_TARGET.BROWSER
              ? options.browsers as unknown as TARGET[]
              : [options.target] as unknown as TARGET[])
                .map(target => TargetRuntimeProvider(target, options))
          ])
          // @ts-ignore
          |> (!isBrowser && options.target === BUNDLER_TARGET.BROWSER ? delayWhen(() => from(_port)) : tap())
          // @ts-ignore
          |> (!isBrowser && options.target === BUNDLER_TARGET.BROWSER ? server(options) : tap())
          // @ts-ignore
          |> mergeMap(([ bundler, targetRuntimeProviders ]) =>
            merge(
              // @ts-ignore
              bundler
              // @ts-ignore
              |> filter(({ name }) => name === 'buildStart'),
              // @ts-ignore
              bundler
              // @ts-ignore
              |> filter(({ name }) => name === 'buildStart')
              // @ts-ignore
              |> switchMap(({ entryFiles, buildStartTime }) =>
                // @ts-ignore
                bundler
                // @ts-ignore
                |> filter(({ name }) => name === 'bundled')
                // @ts-ignore
                |> map(bundleContainer => ({
                  ...bundleContainer,
                  entryFiles,
                  buildStartTime
                })))
              // @ts-ignore
              |> switchMap(({ bundle }) =>
                // @ts-ignore
                merge(...targetRuntimeProviders)
                // @ts-ignore
                |> mergeMap((targetRuntimeProvider: TargetRuntimeProviderType) =>
                  // @ts-ignore
                  from(
                    (bundle.isEmpty
                      ? Array.from(bundle.childBundles)
                      : [bundle])
                        .map(({ name: path }) => path))
                    // @ts-ignore
                    |> mergeMap(path => {
                      // @ts-ignore
                      const newContextObservable: ConnectableObservable<File> =
                        // @ts-ignore
                        of({
                          target: targetRuntimeProvider.target,
                          name: bundle.entryAsset.name,
                          path,
                          url: options.target === BUNDLER_TARGET.BROWSER && transformPathToTestUrl(path, options.port)
                        })
                        // @ts-ignore
                        |> publish()

                      // @ts-ignore
                      const analyzedObservable: ConnectableObservable<File> =
                        // @ts-ignore
                        newContextObservable
                        // @ts-ignore
                        |> analyze(targetRuntimeProvider, options)
                        // @ts-ignore
                        |> publish()
          
                      // @ts-ignore
                      const testedObservable: ConnectableObservable<File> =
                        // @ts-ignore
                        analyzedObservable
                        // @ts-ignore
                        |> filter(file => !file.errors.length)
                        // @ts-ignore
                        |> switchMap(file =>
                          // @ts-ignore
                          from(file.tests)
                          // @ts-ignore
                          |> test(file, targetRuntimeProvider, options))
                        // @ts-ignore
                        |> publish()
          
                      const testerObservable =
                        merge(
                          newContextObservable,
                          analyzedObservable,
                          testedObservable
                        )
          
                      testedObservable.connect()
                      analyzedObservable.connect()
                      newContextObservable.connect()
          
                      return testerObservable
                    })
                ))
            ))
}