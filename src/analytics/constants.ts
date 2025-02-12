// TODO(any): consider moving to a statsig/constants and make it more type safe
import { StatsigDynamicConfigs, StatsigExperiments, StatsigLayers } from 'src/analytics/types'
import { SelectProviderExchangesLink, SelectProviderExchangesText } from 'src/fiatExchanges/types'

export const LayerParams = {
  [StatsigLayers.NAME_AND_PICTURE_SCREEN]: {
    showSkipButton: {
      paramName: 'showSkipButton',
      defaultValue: false,
    },
    nameType: {
      paramName: 'nameType',
      defaultValue: 'first_and_last',
    },
  },
}

export const ConfigParams = {
  [StatsigDynamicConfigs.USERNAME_BLOCK_LIST]: {
    blockedAdjectives: {
      paramName: 'blockedAdjectives',
      defaultValue: [],
    },
    blockedNouns: {
      paramName: 'blockedNouns',
      defaultValue: [],
    },
  },
}

export const ExperimentParams = {
  [StatsigExperiments.ADD_FUNDS_CRYPTO_EXCHANGE_QR_CODE]: {
    addFundsExchangesText: {
      paramName: 'addFundsExchangesText',
      defaultValue: SelectProviderExchangesText.CryptoExchange,
    },
    addFundsExchangesLink: {
      paramName: 'addFundsExchangesLink',
      defaultValue: SelectProviderExchangesLink.ExternalExchangesScreen,
    },
  },
}
