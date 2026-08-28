import { Application, Device, File, Screen, knownFolders, path } from '@nativescript/core';

const diagnosticFilePath = path.join(
  knownFolders.documents().path,
  'NapiScriptRunner-diagnostics.log'
);

export function initDiagnostics() {
  try {
    File.fromPath(diagnosticFilePath).writeTextSync(
      `# NapiScriptRunner diagnostics\nStarted: ${new Date().toISOString()}\n`
    );
  } catch (error) {
    console.error('Unable to initialize diagnostics file:', error);
  }

  writeDiagnostic('bootstrap', {
    os: Device.os,
    osVersion: Device.osVersion,
    model: Device.model,
    deviceType: Device.deviceType,
    screen: {
      widthDIPs: Screen.mainScreen.widthDIPs,
      heightDIPs: Screen.mainScreen.heightDIPs,
      scale: Screen.mainScreen.scale,
    },
  });

  Application.on(Application.displayedEvent, () => {
    writeDiagnostic('application displayed');
  });

  Application.on(Application.uncaughtErrorEvent, (args: any) => {
    writeDiagnostic('uncaught error', formatDiagnosticError(args?.error));
  });

  Application.on(Application.discardedErrorEvent, (args: any) => {
    writeDiagnostic('discarded error', formatDiagnosticError(args?.error));
  });

  Application.on(Application.lowMemoryEvent, () => {
    writeDiagnostic('low memory event');
  });
}

export function writeDiagnostic(message: string, details?: unknown) {
  const line = `[${new Date().toISOString()}] ${message}${
    details === undefined ? '' : ` ${safeSerialize(details)}`
  }\n`;

  try {
    File.fromPath(diagnosticFilePath).appendTextSync(line);
  } catch (error) {
    console.error('Unable to write diagnostics:', error);
  }

  console.log(`[diagnostics] ${message}`, details ?? '');
}

export function getDiagnosticFilePath(): string {
  return diagnosticFilePath;
}

function formatDiagnosticError(error: any) {
  if (!error) return 'Unknown error';
  return {
    name: error.name,
    message: error.message ?? String(error),
    stack: error.stack,
    stackTrace: error.stackTrace,
    nativeException: error.nativeException ? String(error.nativeException) : undefined,
  };
}

function safeSerialize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
