import { CreateViewEventData, EventData, Page } from '@nativescript/core';
import { getDiagnosticFilePath, writeDiagnostic } from './diagnostics';

let fileName = 'No script selected';
let source = '';
let output = '';

let pickerDelegate: DocumentPickerDelegate | undefined;
let actionTarget: RunnerActionTarget | undefined;

let rootView: UIView | undefined;
let fileNameLabel: UILabel | undefined;
let sourceTextView: UITextView | undefined;
let outputTextView: UITextView | undefined;
let runButton: UIButton | undefined;

const nativeViews: Record<string, UIView> = {};

export function onNavigatingTo(args: EventData) {
  const page = args.object as Page;
  page.actionBarHidden = true;
  writeDiagnostic('main-page navigatingTo', {
    diagnosticsFile: getDiagnosticFilePath(),
    uiMode: 'direct-uikit',
  });
}

export function creatingView(args: CreateViewEventData) {
  try {
    const view = buildNativeRunnerView();
    args.view = view;
    writeDiagnostic('direct UIKit view created', {
      rootClass: String((view as any).className ?? 'UIView'),
      diagnosticsFile: getDiagnosticFilePath(),
    });

    setTimeout(() => captureNativeDiagnostics('250ms'), 250);
    setTimeout(() => captureNativeDiagnostics('1500ms'), 1500);
  } catch (error) {
    const formatted = formatError(error);
    writeDiagnostic('direct UIKit creation failed', formatted);

    const fallback = UILabel.alloc().initWithFrame(UIScreen.mainScreen.bounds);
    fallback.text = `UI creation failed\n${formatted}`;
    fallback.numberOfLines = 0;
    fallback.textColor = UIColor.redColor;
    fallback.backgroundColor = UIColor.whiteColor;
    args.view = fallback;
  }
}

function buildNativeRunnerView(): UIView {
  for (const key of Object.keys(nativeViews)) delete nativeViews[key];

  const screenBounds = UIScreen.mainScreen.bounds;
  const screenWidth = screenBounds.size.width;
  const screenHeight = screenBounds.size.height;
  const margin = 20;
  const gap = 14;
  const contentWidth = Math.max(200, screenWidth - margin * 2);

  const root = UIView.alloc().initWithFrame(screenBounds);
  root.backgroundColor = UIColor.whiteColor;
  root.autoresizesSubviews = true;
  root.accessibilityIdentifier = 'runnerRoot';
  rootView = root;
  nativeViews.root = root;

  const scroll = UIScrollView.alloc().initWithFrame(CGRectMake(0, 0, screenWidth, screenHeight));
  scroll.backgroundColor = UIColor.whiteColor;
  scroll.autoresizingMask = UIViewAutoresizing.FlexibleWidth | UIViewAutoresizing.FlexibleHeight;
  scroll.alwaysBounceVertical = true;
  scroll.accessibilityIdentifier = 'runnerScrollView';
  root.addSubview(scroll);
  nativeViews.scroll = scroll;

  let y = 20;

  const headline = makeLabel(
    'NativeScript / napi-ios Script Runner',
    CGRectMake(margin, y, contentWidth, 64),
    22,
    true,
    hexColor('#111827')
  );
  headline.accessibilityLabel = 'NativeScript napi-ios Script Runner';
  scroll.addSubview(headline);
  nativeViews.headline = headline;
  y += 64 + gap;

  const intro = makeLabel(
    'Import a local .js/.mjs/.txt file, inspect it, then run it explicitly.',
    CGRectMake(margin, y, contentWidth, 46),
    15,
    false,
    hexColor('#334155')
  );
  scroll.addSubview(intro);
  nativeViews.intro = intro;
  y += 46 + gap;

  const warning = makeLabel(
    'Warning: imported code executes with the native capabilities exposed by the runtime. Only run code you trust.',
    CGRectMake(margin, y, contentWidth, 66),
    14,
    false,
    hexColor('#9b1c1c')
  );
  scroll.addSubview(warning);
  nativeViews.warning = warning;
  y += 66 + gap;

  actionTarget = RunnerActionTarget.new();

  const importButton = makeButton('Import Script', CGRectMake(margin, y, contentWidth, 48));
  importButton.accessibilityLabel = 'Import Script';
  importButton.accessibilityHint = 'Choose a JavaScript file to load';
  importButton.addTargetActionForControlEvents(actionTarget, 'importTapped', UIControlEvents.TouchUpInside);
  scroll.addSubview(importButton);
  nativeViews.importButton = importButton;
  y += 48 + gap;

  fileNameLabel = makeLabel(
    fileName,
    CGRectMake(margin, y, contentWidth, 30),
    15,
    true,
    hexColor('#111827')
  );
  fileNameLabel.accessibilityLabel = fileName;
  scroll.addSubview(fileNameLabel);
  nativeViews.fileName = fileNameLabel;
  y += 30 + gap;

  sourceTextView = makeTextView(CGRectMake(margin, y, contentWidth, 270));
  sourceTextView.text = source || 'No script loaded';
  sourceTextView.accessibilityLabel = 'Script source';
  scroll.addSubview(sourceTextView);
  nativeViews.source = sourceTextView;
  y += 270 + gap;

  runButton = makeButton('Run Script', CGRectMake(margin, y, contentWidth, 48));
  runButton.accessibilityLabel = 'Run Script';
  runButton.accessibilityHint = 'Execute the loaded script';
  runButton.addTargetActionForControlEvents(actionTarget, 'runTapped', UIControlEvents.TouchUpInside);
  scroll.addSubview(runButton);
  nativeViews.runButton = runButton;
  y += 48 + gap;

  const clearButton = makeButton('Clear Console', CGRectMake(margin, y, contentWidth, 48));
  clearButton.accessibilityLabel = 'Clear Console';
  clearButton.accessibilityHint = 'Clear script output';
  clearButton.addTargetActionForControlEvents(actionTarget, 'clearTapped', UIControlEvents.TouchUpInside);
  scroll.addSubview(clearButton);
  nativeViews.clearButton = clearButton;
  y += 48 + gap;

  const consoleTitle = makeLabel(
    'Console',
    CGRectMake(margin, y, contentWidth, 30),
    18,
    true,
    hexColor('#111827')
  );
  consoleTitle.accessibilityLabel = 'Console';
  scroll.addSubview(consoleTitle);
  nativeViews.consoleTitle = consoleTitle;
  y += 30 + gap;

  outputTextView = makeTextView(CGRectMake(margin, y, contentWidth, 220));
  outputTextView.text = output || 'Console output will appear here.';
  outputTextView.accessibilityLabel = 'Script console output';
  scroll.addSubview(outputTextView);
  nativeViews.output = outputTextView;
  y += 220 + 24;

  scroll.contentSize = CGSizeMake(screenWidth, y);
  syncRunButtonState();

  return root;
}

function makeLabel(
  text: string,
  frame: CGRect,
  fontSize: number,
  bold: boolean,
  color: UIColor
): UILabel {
  const label = UILabel.alloc().initWithFrame(frame);
  label.text = text;
  label.font = bold ? UIFont.boldSystemFontOfSize(fontSize) : UIFont.systemFontOfSize(fontSize);
  label.textColor = color;
  label.backgroundColor = UIColor.clearColor;
  label.numberOfLines = 0;
  label.lineBreakMode = NSLineBreakMode.ByWordWrapping;
  label.textAlignment = NSTextAlignment.Left;
  return label;
}

function makeButton(title: string, frame: CGRect): UIButton {
  const button = UIButton.buttonWithType(UIButtonType.System);
  button.frame = frame;
  button.setTitleForState(title, UIControlState.Normal);
  button.setTitleColorForState(hexColor('#0f172a'), UIControlState.Normal);
  button.setTitleColorForState(hexColor('#64748b'), UIControlState.Disabled);
  button.backgroundColor = hexColor('#e2e8f0');
  if (button.titleLabel) button.titleLabel.font = UIFont.boldSystemFontOfSize(16);
  button.layer.cornerRadius = 8;
  button.layer.borderWidth = 1;
  button.layer.borderColor = hexColor('#94a3b8').CGColor;
  button.clipsToBounds = true;
  return button;
}

function makeTextView(frame: CGRect): UITextView {
  const view = UITextView.alloc().initWithFrame(frame);
  view.editable = false;
  view.selectable = true;
  view.scrollEnabled = true;
  view.font = UIFont.systemFontOfSize(14);
  view.textColor = hexColor('#111827');
  view.backgroundColor = hexColor('#f8fafc');
  view.layer.cornerRadius = 8;
  view.layer.borderWidth = 1;
  view.layer.borderColor = hexColor('#cbd5e1').CGColor;
  view.clipsToBounds = true;
  view.textContainerInset = new UIEdgeInsets({ top: 10, left: 10, bottom: 10, right: 10 });
  return view;
}

@NativeClass()
class RunnerActionTarget extends NSObject {
  importTapped() {
    onImport();
  }

  runTapped() {
    void onRun();
  }

  clearTapped() {
    onClearConsole();
  }
}

export function onImport() {
  writeDiagnostic('import requested');
  const controller = topViewController();
  if (!controller) {
    append('Unable to find the active view controller.');
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
        const loadedSource = NSString.alloc().initWithDataEncoding(data, NSUTF8StringEncoding)?.toString();
        if (loadedSource == null) throw new Error('The selected file is not valid UTF-8 text.');

        fileName = url.lastPathComponent || 'script.js';
        source = loadedSource;
        if (fileNameLabel) {
          fileNameLabel.text = fileName;
          fileNameLabel.accessibilityLabel = fileName;
        }
        if (sourceTextView) sourceTextView.text = source;
        syncRunButtonState();

        append(`Loaded ${fileName} (${source.length} chars).`);
        writeDiagnostic('script loaded', { name: fileName, characters: source.length });
      } finally {
        if (didAccess) url.stopAccessingSecurityScopedResource();
      }
    } catch (error) {
      const formatted = formatError(error);
      append(`Import error: ${formatted}`);
      writeDiagnostic('import error', formatted);
    }
  };

  pickerDelegate = delegate;
  picker.delegate = delegate;
  controller.presentViewControllerAnimatedCompletion(picker, true, () => {});
}

export async function onRun() {
  if (!source.trim()) return;

  append(`--- Running ${fileName} ---`);
  writeDiagnostic('script run started', { fileName, characters: source.length });

  const originalConsole = globalThis.console;
  const bridgedConsole = {
    ...originalConsole,
    log: (...args: unknown[]) => { append(args.map(renderArg).join(' ')); originalConsole.log(...args); },
    info: (...args: unknown[]) => { append(args.map(renderArg).join(' ')); originalConsole.info(...args); },
    warn: (...args: unknown[]) => { append('WARN: ' + args.map(renderArg).join(' ')); originalConsole.warn(...args); },
    error: (...args: unknown[]) => { append('ERROR: ' + args.map(renderArg).join(' ')); originalConsole.error(...args); },
  } as Console;

  try {
    globalThis.console = bridgedConsole;
    const globalEval: (script: string) => unknown = eval;
    const result = globalEval(source + `\n//# sourceURL=${fileName.replace(/\s/g, '_')}`);

    if (result instanceof Promise) {
      const awaited = await result;
      if (awaited !== undefined) append(`Result: ${renderArg(awaited)}`);
    } else if (result !== undefined) {
      append(`Result: ${renderArg(result)}`);
    }

    append('--- Finished ---');
    writeDiagnostic('script run finished', { fileName });
  } catch (error) {
    const formatted = formatError(error);
    append(`Runtime error: ${formatted}`);
    writeDiagnostic('runtime error', formatted);
  } finally {
    globalThis.console = originalConsole;
  }
}

export function onClearConsole() {
  output = '';
  if (outputTextView) outputTextView.text = 'Console output will appear here.';
  writeDiagnostic('console cleared');
}

function append(line: unknown) {
  const text = typeof line === 'string' ? line : safeStringify(line);
  output += (output ? '\n' : '') + text;
  if (outputTextView) outputTextView.text = output;
}

function syncRunButtonState() {
  if (!runButton) return;
  const enabled = source.trim().length > 0;
  runButton.enabled = enabled;
  runButton.alpha = enabled ? 1 : 0.55;
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
    append('Import cancelled.');
    writeDiagnostic('import cancelled');
  }
}

function captureNativeDiagnostics(phase: string) {
  const snapshot = Object.entries(nativeViews).map(([id, view]) => {
    const frame = view.frame;
    const anyView = view as any;
    return {
      id,
      className: String(anyView.className ?? view.constructor?.name ?? 'unknown'),
      frame: {
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height,
      },
      hidden: view.hidden,
      alpha: view.alpha,
      backgroundColor: view.backgroundColor ? String(view.backgroundColor) : undefined,
      text: anyView.text,
      title: anyView.titleForState ? anyView.titleForState(UIControlState.Normal) : undefined,
      enabled: anyView.enabled,
      accessibilityLabel: view.accessibilityLabel,
      subviews: view.subviews?.count,
    };
  });

  writeDiagnostic(`native UIKit layout ${phase}`, snapshot);
}

function topViewController(): UIViewController | null {
  const window = UIApplication.sharedApplication.keyWindow;
  let controller = window?.rootViewController ?? null;

  while (controller) {
    if (controller.presentedViewController) {
      controller = controller.presentedViewController;
      continue;
    }
    if (controller instanceof UINavigationController && controller.visibleViewController) {
      controller = controller.visibleViewController;
      continue;
    }
    break;
  }

  return controller;
}

function hexColor(hex: string): UIColor {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  const number = parseInt(normalized, 16);
  const red = ((number >> 16) & 0xff) / 255;
  const green = ((number >> 8) & 0xff) / 255;
  const blue = (number & 0xff) / 255;
  return UIColor.colorWithRedGreenBlueAlpha(red, green, blue, 1);
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
