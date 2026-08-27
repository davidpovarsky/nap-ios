import { EventData, Observable, Page } from '@nativescript/core';

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
let pickerDelegate: DocumentPickerDelegate | null = null;

export function onNavigatingTo(args: EventData) {
  (args.object as Page).bindingContext = vm;
}

export function onImport() {
  const controller = topViewController();
  if (!controller) {
    vm.append('Unable to find the active view controller.');
    return;
  }

  const types = NSArray.arrayWithObjects('public.javascript', 'public.plain-text', 'public.data');
  const picker = UIDocumentPickerViewController.alloc().initWithDocumentTypesInMode(
    types,
    UIDocumentPickerMode.Import
  );

  pickerDelegate = DocumentPickerDelegate.new();
  pickerDelegate.onPicked = (url: NSURL) => {
    try {
      const didAccess = url.startAccessingSecurityScopedResource();
      try {
        const data = NSData.dataWithContentsOfURL(url);
        if (!data) throw new Error('Could not read selected file.');
        const source = NSString.alloc().initWithDataEncoding(data, NSUTF8StringEncoding)?.toString();
        if (source == null) throw new Error('The selected file is not valid UTF-8 text.');
        vm.setScript(url.lastPathComponent || 'script.js', source);
        vm.append(`Loaded ${url.lastPathComponent || 'script'} (${source.length} chars).`);
      } finally {
        if (didAccess) url.stopAccessingSecurityScopedResource();
      }
    } catch (error) {
      vm.append(`Import error: ${formatError(error)}`);
    }
  };
  picker.delegate = pickerDelegate;
  controller.presentViewControllerAnimatedCompletion(picker, true, null);
}

export async function onRun() {
  if (!vm.canRun) return;

  vm.append(`--- Running ${vm.fileName} ---`);

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

    // Indirect eval executes in the runtime's global scope. In NativeScript that scope
    // contains the Objective-C metadata bindings (UIKit/Foundation/etc.).
    const globalEval = (0, eval);
    const result = globalEval(vm.source + `\n//# sourceURL=${vm.fileName.replace(/\s/g, '_')}`);

    if (result instanceof Promise) {
      const awaited = await result;
      if (awaited !== undefined) vm.append(`Result: ${renderArg(awaited)}`);
    } else if (result !== undefined) {
      vm.append(`Result: ${renderArg(result)}`);
    }
    vm.append('--- Finished ---');
  } catch (error) {
    vm.append(`Runtime error: ${formatError(error)}`);
  } finally {
    globalThis.console = originalConsole;
  }
}

export function onClearConsole() {
  vm.clear();
}

@NativeClass()
class DocumentPickerDelegate extends NSObject implements UIDocumentPickerDelegate {
  static ObjCProtocols = [UIDocumentPickerDelegate];
  onPicked?: (url: NSURL) => void;

  documentPickerDidPickDocumentAtURL(_controller: UIDocumentPickerViewController, url: NSURL) {
    this.onPicked?.(url);
  }

  documentPickerWasCancelled(_controller: UIDocumentPickerViewController) {
    vm.append('Import cancelled.');
  }
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
