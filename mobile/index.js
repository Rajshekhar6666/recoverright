// 1. Initialize DOM shim & browser polyfills BEFORE any screen or component is imported
import './src/shims/domShim';

import { registerRootComponent } from 'expo';
import { App } from './src/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(App);
