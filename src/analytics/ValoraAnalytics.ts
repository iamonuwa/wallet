import Analytics, { Analytics as analytics } from '@segment/analytics-react-native'
import Adjust from '@segment/analytics-react-native-adjust'
import CleverTapSegment from '@segment/analytics-react-native-clevertap'
import Firebase from '@segment/analytics-react-native-firebase'
import { sha256FromString } from 'ethereumjs-util'
import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions'
import { AppEvents } from 'src/analytics/Events'
import { AnalyticsPropertiesList } from 'src/analytics/Properties'
import { getCurrentUserTraits } from 'src/analytics/selectors'
import {
  DEFAULT_TESTNET,
  E2E_TEST_STATSIG_ID,
  FIREBASE_ENABLED,
  isE2EEnv,
  SEGMENT_API_KEY,
  STATSIG_API_KEY,
  STATSIG_ENV,
} from 'src/config'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
import { isPresent } from 'src/utils/typescript'
import { Statsig } from 'statsig-react-native'

const TAG = 'ValoraAnalytics'

interface DeviceInfoType {
  AppName: string
  Brand: string
  BuildNumber: string
  BundleId: string
  Carrier: string
  DeviceId: string // this is the device model + version
  FirstInstallTime: number
  FontScale: number
  FreeDiskStorage: number
  InstallReferrer: string
  InstanceID: string
  LastUpdateTime: number
  Manufacturer: string
  MaxMemory: number
  Model: string
  ReadableVersion: string
  SystemName: string
  SystemVersion: string
  TotalDiskCapacity: number
  TotalMemory: number
  UniqueID: string // this is the unique id of the device, which maps to deviceId in the data
  UserAgent: string
  Version: string
  isEmulator: boolean
  isTablet: boolean
  UsedMemory: number
}

async function getDeviceInfo(): Promise<DeviceInfoType> {
  return {
    AppName: DeviceInfo.getApplicationName(),
    Brand: DeviceInfo.getBrand(),
    BuildNumber: DeviceInfo.getBuildNumber(),
    BundleId: DeviceInfo.getBundleId(),
    Carrier: await DeviceInfo.getCarrier(),
    DeviceId: DeviceInfo.getDeviceId(),
    FirstInstallTime: await DeviceInfo.getFirstInstallTime(),
    FontScale: await DeviceInfo.getFontScale(),
    FreeDiskStorage: await DeviceInfo.getFreeDiskStorage(),
    InstallReferrer: await DeviceInfo.getInstallReferrer(),
    InstanceID: await DeviceInfo.getInstanceId(),
    LastUpdateTime: await DeviceInfo.getLastUpdateTime(),
    Manufacturer: await DeviceInfo.getManufacturer(),
    MaxMemory: await DeviceInfo.getMaxMemory(),
    Model: DeviceInfo.getModel(),
    ReadableVersion: DeviceInfo.getReadableVersion(),
    SystemName: DeviceInfo.getSystemName(),
    SystemVersion: DeviceInfo.getSystemVersion(),
    TotalDiskCapacity: await DeviceInfo.getTotalDiskCapacity(),
    TotalMemory: await DeviceInfo.getTotalMemory(),
    UniqueID: await DeviceInfo.getUniqueId(),
    UserAgent: await DeviceInfo.getUserAgent(),
    Version: DeviceInfo.getVersion(),
    isEmulator: await DeviceInfo.isEmulator(),
    isTablet: DeviceInfo.isTablet(),
    UsedMemory: await DeviceInfo.getUsedMemory(),
  }
}

const SEGMENT_OPTIONS: analytics.Configuration = {
  using: [FIREBASE_ENABLED ? Firebase : undefined, Adjust, CleverTapSegment].filter(isPresent),
  flushAt: 20,
  debug: __DEV__,
  trackAppLifecycleEvents: true,
  recordScreenViews: true,
  trackAttributionData: true,
  ios: {
    trackAdvertising: false,
    trackDeepLinks: true,
  },
}

class ValoraAnalytics {
  sessionId: string = ''
  deviceInfo: DeviceInfoType | undefined

  private currentScreenId: string | undefined
  private prevScreenId: string | undefined

  async init() {
    let uniqueID
    try {
      if (!SEGMENT_API_KEY) {
        throw Error('API Key not present, likely due to environment. Skipping enabling')
      }
      await Analytics.setup(SEGMENT_API_KEY, SEGMENT_OPTIONS)

      try {
        const deviceInfo = await getDeviceInfo()
        this.deviceInfo = deviceInfo
        uniqueID = deviceInfo.UniqueID
        this.sessionId = sha256FromString('0x' + uniqueID.split('-').join('') + String(Date.now()))
          .toString('hex')
          .slice(2)
      } catch (error) {
        Logger.error(TAG, 'getDeviceInfo error', error)
      }

      Logger.info(TAG, 'Segment Analytics Integration initialized!')
    } catch (error) {
      Logger.error(TAG, `Segment setup error: ${error.message}\n`, error)
    }

    try {
      const { accountAddress } = getCurrentUserTraits(store.getState())
      const stasigUser = accountAddress
        ? {
            userID: accountAddress,
          }
        : null

      // getAnonymousId causes the e2e tests to fail
      const overrideStableID = isE2EEnv ? E2E_TEST_STATSIG_ID : await Analytics.getAnonymousId()
      await Statsig.initialize(STATSIG_API_KEY, stasigUser, {
        // StableID should match Segment anonymousId
        overrideStableID,
        environment: STATSIG_ENV,
      })
    } catch (error) {
      Logger.warn(TAG, `Statsig setup error`, error)
    }
  }

  isEnabled() {
    // Remove __DEV__ here to test analytics in dev builds
    return !__DEV__ && store.getState().app.analyticsEnabled
  }

  startSession(
    eventName: typeof AppEvents.app_launched,
    eventProperties: AnalyticsPropertiesList[AppEvents.app_launched]
  ) {
    this.track(eventName, {
      deviceInfo: this.deviceInfo,
      ...eventProperties,
    })

    this.requestTrackingPermissionIfNeeded().catch((error) => {
      Logger.error(TAG, 'Failure while requesting tracking permission', error)
    })
  }

  getSessionId() {
    return this.sessionId
  }

  track<EventName extends keyof AnalyticsPropertiesList>(
    ...args: undefined extends AnalyticsPropertiesList[EventName]
      ? [EventName] | [EventName, AnalyticsPropertiesList[EventName]]
      : [EventName, AnalyticsPropertiesList[EventName]]
  ) {
    const [eventName, eventProperties] = args

    if (!this.isEnabled()) {
      Logger.debug(TAG, `Analytics is disabled, not tracking event ${eventName}`)
      return
    }

    if (!SEGMENT_API_KEY) {
      Logger.debug(TAG, `No API key, not tracking event ${eventName}`)
      return
    }

    const props: {} = {
      ...this.getSuperProps(),
      ...eventProperties,
    }

    Logger.info(TAG, `Tracking event ${eventName} with properties: ${JSON.stringify(props)}`)

    Analytics.track(eventName, props).catch((err) => {
      Logger.error(TAG, `Failed to track event ${eventName}`, err)
    })
  }

  identify(userID: string | null, traits: {}) {
    if (!this.isEnabled()) {
      Logger.debug(TAG, `Analytics is disabled, not tracking user ${userID}`)
      return
    }

    // Only identify user if userID (walletAddress) is set
    if (!userID) {
      return
    }

    try {
      void Statsig.updateUser({ userID })
    } catch (error) {
      Logger.warn(TAG, 'Error updating statsig user', error)
    }

    if (!SEGMENT_API_KEY) {
      Logger.debug(TAG, `No API key, not tracking user ${userID}`)
      return
    }

    Analytics.identify(userID, traits).catch((err) => {
      Logger.error(TAG, `Failed to identify user ${userID}`, err)
    })
  }

  page(screenId: string, eventProperties = {}) {
    if (!this.isEnabled()) {
      Logger.debug(TAG, `Analytics is disabled, not tracking screen ${screenId}`)
      return
    }

    if (!SEGMENT_API_KEY) {
      Logger.debug(TAG, `No API key, not tracking screen ${screenId}`)
      return
    }

    if (screenId !== this.currentScreenId) {
      this.prevScreenId = this.currentScreenId
      this.currentScreenId = screenId
    }

    const props: {} = {
      ...this.getSuperProps(),
      ...eventProperties,
    }

    Analytics.screen(screenId, props).catch((err) => {
      Logger.error(TAG, 'Error tracking page', err)
    })
  }

  async reset() {
    try {
      await Analytics.flush()
      await Analytics.reset()
    } catch (error) {
      Logger.error(TAG, 'Error resetting analytics', error)
    }
  }

  private async requestTrackingPermissionIfNeeded() {
    // TODO: remove `isE2EEnv` and set permission via Detox when we upgrade
    if (Platform.OS !== 'ios' || isE2EEnv) {
      return
    }

    const appTrackingPermission = await check(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY)
    Logger.debug(TAG, `iOS tracking permission: ${appTrackingPermission}`)
    if (appTrackingPermission !== RESULTS.DENIED) {
      // The permission has already been requested / is not requestable
      // See https://github.com/zoontek/react-native-permissions#permissions-statuses
      return
    }

    Logger.debug(TAG, `iOS requesting tracking permission`)
    this.track(AppEvents.request_tracking_permission_started, {
      currentPermission: appTrackingPermission,
    })
    const newAppTrackingPermission = await request(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY)
    Logger.debug(TAG, `iOS tracking permission after request: ${newAppTrackingPermission}`)
    if (newAppTrackingPermission === RESULTS.GRANTED) {
      this.track(AppEvents.request_tracking_permission_accepted, {
        newPermission: newAppTrackingPermission,
      })
    } else {
      this.track(AppEvents.request_tracking_permission_declined, {
        newPermission: newAppTrackingPermission,
      })
    }
  }

  // Super props, i.e. props sent with all events
  private getSuperProps() {
    const traits = getCurrentUserTraits(store.getState())
    // Prefix super props with `s` so they don't clash with events props
    const prefixedSuperProps = Object.fromEntries(
      Object.entries({
        ...traits,
        deviceId: this.deviceInfo?.UniqueID,
        appVersion: this.deviceInfo?.Version,
        appBuildNumber: this.deviceInfo?.BuildNumber,
        appBundleId: this.deviceInfo?.BundleId,
        currentScreenId: this.currentScreenId,
        prevScreenId: this.prevScreenId,
      }).map(([key, value]) => [`s${key.charAt(0).toUpperCase() + key.slice(1)}`, value])
    )

    return {
      // Legacy super props
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAddress: traits.walletAddress,
      celoNetwork: DEFAULT_TESTNET,
      // Prefixed super props
      ...prefixedSuperProps,
      // Statsig prop, won't be read properly by Statsig if prefixed
      statsigEnvironment: STATSIG_ENV,
    }
  }
}

let isInitialized = false
type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp ? P : never }[keyof T]
type ValoraAnalyticsKeyFunction = KeysOfType<ValoraAnalytics, Function>
// Type checked function keys to queue until `init` has finished
const funcsToQueue = new Set<ValoraAnalyticsKeyFunction>([
  'startSession',
  'track',
  'identify',
  'page',
])
let queuedCalls: Function[] = []

function isFuncToQueue(prop: string | number | symbol): prop is ValoraAnalyticsKeyFunction {
  return funcsToQueue.has(prop as ValoraAnalyticsKeyFunction)
}

/**
 * Use a proxy to queue specific calls until async `init` has finished
 * So all events are sent with the right props to our initialized analytics integrations
 */
export default new Proxy(new ValoraAnalytics(), {
  get: function (target, prop, receiver) {
    if (!isInitialized) {
      if (prop === 'init') {
        return new Proxy(target[prop], {
          apply: (target, thisArg, argumentsList) => {
            return Reflect.apply(target, thisArg, argumentsList).finally(() => {
              isInitialized = true
              // Init finished, we can now process queued calls
              for (const fn of queuedCalls) {
                fn()
              }
              queuedCalls = []
            })
          },
        })
      } else if (isFuncToQueue(prop)) {
        return new Proxy(target[prop], {
          apply: (target, thisArg, argumentsList) => {
            queuedCalls.push(() => Reflect.apply(target, thisArg, argumentsList))
            Logger.debug(TAG, `Queued call to ${prop}`, ...argumentsList)
          },
        })
      }
    }
    return Reflect.get(target, prop, receiver)
  },
})
