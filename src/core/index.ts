import { Observable, of, generate, from, BehaviorSubject, zip, combineLatest, merge } from 'rxjs'
import { takeUntil, publish, filter, map, mapTo, switchMap, groupBy, mergeMap, tap, skip, toArray, share, take, shareReplay } from 'rxjs/operators'
import browsersList from 'browserslist'

import Parcel from './parcel'
import { PARCEL_REPORTER_EVENT } from '../parcel'
import WorkerFarm from '../workerFarm'
import Task, { TASK_TYPE, TASK_STATUS } from './task'
import emit from '../utils/emit'
import AsyncObservable from '../utils/async-observable'
import runtimeFactory, { RUNTIMES } from '../runtimes'
import preAnalyze from './pre-analyzer'

const getAssetSupportedTargets = asset => [
    ...browsersList(asset.env.engines.browsers)
      |> (arr => arr.map(str =>
        str
          .split(' ')
          .shift()
      ))
      |> (arr => new Set(arr))
      |> (set =>
        Array
          .from(set)
          .filter(runtime => runtime.toUpperCase() in RUNTIMES))
      // todo: add node/electron runtime detection
  ]

export default (parcelOptions) =>
  combineLatest(
    Parcel(parcelOptions),
    runtimeFactory()
  )
  |> filter(([{ type }]) => type === 'buildSuccess')
  |> switchMap(([parcelBundle, runtime]) =>
    parcelBundle.changedAssets.values()
      |> (values => Array.from(values))
      |> (assets => assets.reduce((arr, asset) => [
        ...arr,
        ...getAssetSupportedTargets(asset)
          .map(target => ({
            asset,
            target,
            parcelBundle
          }))
      ], []))
      |> from
      |> groupBy(
        ({ target }) => target,
        ({ parcelBundle, asset }) => ({ parcelBundle, asset })
      )
      // Observable per target that emit assets
      |> mergeMap((assets) =>
        combineLatest(
          assets,
          runtime(assets.key) |> from
        )
        |> mergeMap(([{ parcelBundle: { bundleGraph }, asset }, createContext]) => {
          const bundle =
            bundleGraph
              .getBundles()
              .find(({ isEntry }) => isEntry)

          const unisolatedContext = createContext({ filePath: bundle.filePath }, run => {
            const preAnalyze =
              emit({ type: TASK_TYPE.PRE_ANALYZE })
              |> run()
              |> take(1)
              |> share()

            const tests =
              preAnalyze
              |> map(({ tests }) =>
                tests
                  .filter(({ isolate, serial }) => !isolate && !serial)
              )
              |> map(tests => ({
                type: TASK_TYPE.RUN,
                tests
              }))
              |> run()

            return merge(
              tests,
              preAnalyze
            )
          })

          return merge(
            unisolatedContext
          )
        })
      )
  )
