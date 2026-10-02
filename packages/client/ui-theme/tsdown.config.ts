import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-ui-theme',
  ['lib/types/index.js'],
  {
    lib: {
      copy: [{
        from: 'src/styles/{brand-font.css,app-font.css,montserrat-*.woff2,albert-sans.woff2,yahei-consolas-hybrid.woff2,Montserrat-OFL.txt,AlbertSans-OFL.txt}',
        to: 'lib/styles',
      }],
    },
  },
)
