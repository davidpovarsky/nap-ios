import { EventData, Observable, Page } from '@nativescript/core';
import { getDiagnosticFilePath, writeDiagnostic } from './diagnostics';

class RunnerViewModel extends Observable {
  private _fileName = 'No script selected';
  private _source = '';
  private _output = '';

  get fileName(): string { return this._fileName; }
  get source(): string { return this._source; }
  get output(): string { return this._output; }
  get canRun(): boolean { return this._source.trim().length > 0; }

  setScript(name: string, source: string) {
    this._fileName = name;
    this._source = source;
    this.notifyPropertyChange('fileName', this._fileName);
    this.notifyPropertyChange('source', this._source);
    this.notifyPropertyChange('canRun', this.canRun);
  }

  append(line: unknown) {
    const text = typeof line === 'string' ? line : safeStringify(line);
    this._output += (this._output ? '\n' : '') + text;
    this.notifyPropertyChange('output', this._output);
  }

  clear() {
    this._output = '';
    this.notifyPropertyChange('output', this._output);
  }
}

const vm = new RunnerViewModel();
// Keep a strong reference while the document picker is presented.
let pickerDelegate: DocumentPickerDelegate | undefined;

export function onNavigatingTo(args: EventData) {
  const page = args.object as Page;
  page.bindingContext = vm;

  writeDiagnostic('main-page navigatingTo', {
    diagnosticsFile: getDiagnosticFilePath(),
  });

  // Capture both the NativeScript and native UIKit state after layout. This
  // makes invisible-but-laid-out controls diagnosable from the Files log and CI.
  setTimeout(() => captureLayoutDiagnostics(page, '250ms'), 250);
  setTimeout(() => captureLayoutDiagnostics(page, '1500ms'), 1500);
}

export function onImport() {
  writeDiagnostic('import requested');
  const controller = topViewController();
  if (!controller) {
    vm.append('Unable to find the active view controller.');
    writeDiagnostic('import failed', 'Unable to find the active view controller.');
    return;
  }

  const types = NSArray.arrayWithArray([
    'public.javascript',
    'public.plain-text',
    'public.data',
  ]);
  const picker = UIDocumentPickerViewController.alloc().initWithDocumentTypesInMode(
    types,
    UIDocumentPickerMode.Import
  );

  const delegate = DocumentPickerDelegate.alloc().init() as DocumentPickerDelegate;
  delegate.onPicked = (url: NSURL) => {
    try {
      const didAccess = url.startAccessingSecurityScopedResource();
      try {
        const data = NSData.dataWithContentsOfURL(url);
        if (!data) throw new Error('Could not read selected file.');
        const source = NSString.alloc().initWithDataEncoding(data, NSUTF8StringEncoding)?.toString();
        if (source == null) throw new Error('The selected file is not valid UTF-8 text.');
        const name = url.lastPathComponent || 'script.js';
        vm.setScript(name, source);
        vm.append(`Loaded ${url.lastPathComponent || 'script'} (${source.length} chars).`);
        writeDiagnostic('script loaded', { name, characters: source.length });
      } finally {
        if (didAccess) url.stopAccessingSecurityScopedResource();
      }
    } catch (error) {
      const formatted = formatError(error);
      vm.append(`Import error: ${formatted}`);
      writeDiagnostic('import error', formatted);
    }
  };

  pickerDelegate = delegate;
  picker.delegate = delegate;
  controller.presentViewControllerAnimatedCompletion(picker, true, () => {});
}

export async function onRun() {
  if (!vm.canRun) return;

  vm.append(`--- Running ${vm.fileName} ---`);
  writeDiagnostic('script run started', { fileName: vm.fileName, characters: vm.source.length });

  const originalConsole = globalThis.console;
  const bridgedConsole = {
    ...originalConsole,
    log: (...args: unknown[]) => { vm.append(args.map(renderArg).join(' ')); originalConsole.log(...args); },
    info: (...args: unknown[]) => { vm.append(args.map(renderArg).join(' ')); originalConsole.info(...args); },
    warn: (...args: unknown[]) => { vm.append('WARN: ' + args.map(renderArg).join(' ')); originalConsole.warn(...args); },
    error: (...args: unknown[]) => { vm.append('ERROR: ' + args.map(renderArg).join(' ')); originalConsole.error(...args); }
  } as Console;

  try {
    globalThis.console = bridgedConsole;

    // Calling eval through an alias performs an indirect/global eval. NativeScript's
    // global scope contains the Objective-C metadata bindings exposed by the runtime.
    const globalEval: (source: string) => unknown = eval;
    const result = globalEval(vm.source + `\n//# sourceURL=${vm.fileName.replace(/\s/g, '_')}`);

    if (result instanceof Promise) {
      const awaited = await result;
      if (awaited !== undefined) vm.append(`Result: ${renderArg(awaited)}`);
    } else if (result !== undefined) {
      vm.append(`Result: ${renderArg(result)}`);
    }
    vm.append('--- Finished ---');
    writeDiagnostic('script run finished', { fileName: vm.fileName });
  } catch (error) {
    const formatted = formatError(error);
    vm.append(`Runtime error: ${formatted}`);
    writeDiagnostic('runtime error', formatted);
  } finally {
    globalThis.console = originalConsole;
  }
}

export function onClearConsole() {
  vm.clear();
  writeDiagnostic('console cleared');
}

@NativeClass()
class DocumentPickerDelegate extends NSObject implements UIDocumentPickerDelegate {
  static ObjCProtocols = [UIDocumentPickerDelegate];
  onPicked?: (url: NSURL) => void;

  documentPickerDidPickDocumentAtURL(_controller: UIDocumentPickerViewController, url: NSURL) {
    this.onPicked?.(url);
  }

  documentPickerDidPickDocumentsAtURLs(
    _controller: UIDocumentPickerViewController,
    urls: NSArray<NSURL>
  ) {
    const url = urls.firstObject;
    if (url) this.onPicked?.(url);
  }

  documentPickerWasCancelled(_controller: UIDocumentPickerViewController) {
    vm.append('Import cancelled.');
    writeDiagnostic('import cancelled');
  }
}

function captureLayoutDiagnostics(page: Page, phase: string) {
  const ids = [
    'headline',
    'introLabel',
    'warningLabel',
    'importButton',
    'fileNameLabel',
    'sourceView',
    'runButton',
    'clearButton',
    'consoleTitle',
    'outputView',
  ];

  const views = ids.map((id) => {
    try {
      const view = page.getViewById<any>(id);
      if (!view) return { id, found: false };

      const native = view.ios as any;
      const frame = native?.frame;
      return {
        id,
        found: true,
        type: view.constructor?.name ?? 'unknown',
        visibility: view.visibility,
        isEnabled: view.isEnabled,
        opacity: view.opacity,
        color: view.style?.color ? String(view.style.color) : undefined,
        backgroundColor: view.style?.backgroundColor ? String(view.style.backgroundColor) : undefined,
        frame: frame ? {
          x: frame.origin.x,
          y: frame.origin.y,
          width: frame.size.width,
          height: frame.size.height,
        } : null,
        nativeHidden: native?.hidden,
        nativeAlpha: native?.alpha,
      };
    } catch (error) {
      return { id, diagnosticError: formatError(error) };
    }
  });

  writeDiagnostic(`layout ${phase}`, views);
}

function topViewController(): UIViewController | null {
  const window = UIApplication.sharedApplication.keyWindow;
  let controller = window?.rootViewController ?? null;
  while (controller?.presentedViewController) controller = controller.presentedViewController;
  return controller;
}

function renderArg(value: unknown): string {
  if (typeof value === 'string') return value;
  return safeStringify(value);
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  return String(error);
}
