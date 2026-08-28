import { Application } from '@nativescript/core';
import { initDiagnostics } from './diagnostics';

initDiagnostics();
Application.run({ moduleName: 'app-root' });
