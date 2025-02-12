import { Address } from '@celo/connect'
import {
  ActionableAttestation,
  AttestationsWrapper,
  getSecurityCodePrefix,
} from '@celo/contractkit/lib/wrappers/Attestations'
import { PhoneNumberHashDetails } from '@celo/identity/lib/odis/phone-number-identifier'
import { GetAttestationRequest } from '@celo/phone-utils'
import Logger from 'src/utils/Logger'

const TAG = 'identity/securityCode'

// We look for the case, where all the promises fail or the first one to succeed.
// Promise.all looks for all the values or the first error, so we can switch roles
// for reject and resolve to achieve what we need
async function raceUntilSuccess<T>(promises: Array<Promise<T>>) {
  try {
    const errors = await Promise.all(
      promises.map((promise) => {
        return new Promise((resolve, reject) => {
          promise.then(reject).catch(resolve)
        })
      })
    )
    // TODO: use AggregateError when available
    return Promise.reject(
      new Error(`raceUntilSuccess all failed:\n${errors.map((error) => String(error)).join('\n')}`)
    )
  } catch (firstValue) {
    return Promise.resolve(firstValue)
  }
}

export async function getAttestationCodeForSecurityCode(
  attestationsWrapper: AttestationsWrapper,
  phoneHashDetails: PhoneNumberHashDetails,
  account: string,
  attestations: ActionableAttestation[],
  securityCodeWithPrefix: string,
  signer: Address
) {
  const securityCodePrefix = securityCodeWithPrefix[0]
  const lookupAttestations = attestations.filter(
    (attestation) => getSecurityCodePrefix(attestation.issuer) === securityCodePrefix
  )

  if (lookupAttestations.length <= 0) {
    // This shouldn't happen when the code is legit
    throw new Error(
      `Unable to find possible issuers for security code: ${securityCodeWithPrefix}, attestation issuers: [${attestations.map(
        (attestation) => attestation.issuer
      )}]`
    )
  }

  // Recover the full attestation code from the matching issuer's attestation services
  return raceUntilSuccess(
    lookupAttestations.map(async (attestation: ActionableAttestation) =>
      requestValidator(
        attestationsWrapper,
        account,
        phoneHashDetails,
        attestation,
        securityCodeWithPrefix.substr(1), // remove prefix
        signer
      )
    )
  )
}

async function requestValidator(
  attestationsWrapper: AttestationsWrapper,
  account: string,
  phoneHashDetails: PhoneNumberHashDetails,
  attestation: ActionableAttestation,
  securityCode: string,
  signer: Address
): Promise<string> {
  const issuer = attestation.issuer
  Logger.debug(
    TAG + '@getAttestationCodeFromSecurityCode',
    `Revealing an attestation for issuer: ${issuer}`
  )
  try {
    const requestBody: GetAttestationRequest = {
      account,
      issuer: attestation.issuer,
      phoneNumber: phoneHashDetails.e164Number,
      salt: phoneHashDetails.pepper,
      securityCode,
    }

    return await attestationsWrapper.getAttestationForSecurityCode(
      attestation.attestationServiceURL,
      requestBody,
      signer
    )
  } catch (error) {
    Logger.warn(
      TAG + '@getAttestationCodeFromSecurityCode',
      `get for issuer ${issuer} failed`,
      error
    )
    throw error
  }
}
