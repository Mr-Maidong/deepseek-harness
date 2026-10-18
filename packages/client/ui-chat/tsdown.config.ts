import { clientBundle } from '../tsdown.client.ts'

const bundle = clientBundle(import.meta.dirname, ['lib/types/index.js'])

export default ((options) => bundle(options)) satisfies typeof bundle
