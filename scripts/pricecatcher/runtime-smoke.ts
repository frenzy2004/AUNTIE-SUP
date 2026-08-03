import { PRICECATCHER_TRANSFORM_VERSION } from '../../src/pricecatcher/contracts/index'

if (PRICECATCHER_TRANSFORM_VERSION !== '1.0.0') throw new Error('unexpected PriceCatcher transform version')

console.log('pricecatcher-runtime-smoke')
