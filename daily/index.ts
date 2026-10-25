import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';

// Started by native keepAlive(): a task that never ends, so JS timers keep running in the background.
AppRegistry.registerHeadlessTask('HaloDailyAlive', () => () => new Promise<void>(() => {}));

registerRootComponent(App);
