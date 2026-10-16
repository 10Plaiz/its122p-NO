import { mergeConfig } from 'vite';
import appConfig from '../../../vite.config.ts';

export default mergeConfig(appConfig, {
  server: { proxy: { '/api': 'http://localhost:4413' } },
});
