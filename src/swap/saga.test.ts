import { expectSaga } from 'redux-saga-test-plan'
import { call } from 'redux-saga/effects'
import { swapSubmitSaga } from 'src/swap/saga'
import { swapApprove, swapExecute } from 'src/swap/slice'
import { sendTransaction } from 'src/transactions/send'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'
import { getContractKit } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { mockAccount } from 'test/values'

const loggerErrorSpy = jest.spyOn(Logger, 'error')

const contractKit = {
  getWallet: jest.fn(),
  getAccounts: jest.fn(),
  connection: {
    chainId: jest.fn(() => '42220'),
    nonce: jest.fn(),
    gasPrice: jest.fn(),
  },
}

jest.mock('src/transactions/send', () => ({
  sendTransaction: jest.fn(() => ({ transactionHash: '0x123' })),
}))

const mockSwap = {
  payload: {
    approveTransaction: {
      gas: '59480',
    },
    userInput: {
      buyAmount: 'fakeInput',
    },
    unvalidatedSwapTransaction: {
      buyAmount: '10000000000000000',
      buyTokenAddress: '0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73',
      sellTokenAddress: '0xe8537a3d056da446677b9e9d6c5db704eaab4787',
    },
  },
}

describe(swapSubmitSaga, () => {
  const mockResponseAPI = {
    allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    buyAmount: '19197903079383983',
    buyTokenAddress: '0x765de816845861e75a25fca122bb6898b8b1282a',
    buyTokenToEthRate: '0.788040078882612337',
    chainId: 42220,
    data:
      '0x415565b0000000000000000000000000e8537a3d056da446677b9e9d6c5db704eaab4787000000000000000000000000765de816845861e75a25fca122bb6898b8b1282a000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000004400028ce60c2700000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000003a000000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e8537a3d056da446677b9e9d6c5db704eaab4787000000000000000000000000765de816845861e75a25fca122bb6898b8b1282a000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000002c000000000000000000000000000000000000000000000000000000000000002a0000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000255626553776170000000000000000000000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000004400028ce60c27000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000007d28570135a2b1930f331c507f65039d4937f66c00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000e8537a3d056da446677b9e9d6c5db704eaab4787000000000000000000000000765de816845861e75a25fca122bb6898b8b1282a000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000e8537a3d056da446677b9e9d6c5db704eaab4787000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000000000000000000869584cd00000000000000000000000010000000000000000000000000000000000000110000000000000000000000000000000000000000000000a7989f839d632ca2e5',
    decodedUniqueId: 'a7989f839d-1663869669',
    estimatedGas: '460533',
    estimatedPriceImpact: '100',
    expectedSlippage: null,
    from: '0x078e54ad49b0865fff9086fd084b92b3dac0857d',
    gas: '460533',
    gasPrice: '500000000',
    guaranteedPrice: '0.19140309370145831',
    minimumProtocolFee: '0',
    orders: [[Object]],
    price: '0.19197903079383983',
    protocolFee: '0',
    sellAmount: '100000000000000000',
    sellTokenAddress: '0xe8537a3d056da446677b9e9d6c5db704eaab4787',
    sellTokenToEthRate: '0.000000000162733064',
    sources: [[Object], [Object], [Object], [Object]],
    to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
    value: '0',
  }

  const mockResponse = {
    ok: true,
    json: () => {
      return { validatedSwapTransaction: mockResponseAPI }
    },
  }

  const buyToken = '0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73'
  const sellToken = '0xe8537a3d056da446677b9e9d6c5db704eaab4787'
  const buyAmount = '10000000000000000'
  const executeSwapUri = `${networkConfig.executeSwapUrl}?buyToken=${buyToken}&sellToken=${sellToken}&buyAmount=${buyAmount}&userAddress=${mockAccount}`

  it('should complete swap', async () => {
    await expectSaga(swapSubmitSaga, mockSwap)
      .provide([
        [call(getContractKit), contractKit],
        [call(getConnectedUnlockedAccount), mockAccount],
        [call(fetchWithTimeout, executeSwapUri), mockResponse],
      ])
      .put(swapApprove())
      .put(swapExecute())
      .run()
    expect(sendTransaction).toHaveBeenCalledTimes(2)
    expect(loggerErrorSpy).not.toHaveBeenCalled()
  })

  it.todo('should set swap state correctly on price change')

  it.todo('should set swap state correctly on error')
})
