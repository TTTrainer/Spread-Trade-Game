// Worker threads start without the TypeScript loader; register it, then load the real worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
