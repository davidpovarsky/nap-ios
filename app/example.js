console.log('Hello from imported JavaScript');
console.log('iOS version:', UIDevice.currentDevice.systemVersion);

const alert = UIAlertController.alertControllerWithTitleMessagePreferredStyle(
  'napi-ios works',
  'This alert was created from imported JavaScript.',
  UIAlertControllerStyle.Alert
);
alert.addAction(UIAlertAction.actionWithTitleStyleHandler('OK', UIAlertActionStyle.Default, null));

const app = UIApplication.sharedApplication;
let vc = app.keyWindow && app.keyWindow.rootViewController;
while (vc && vc.presentedViewController) vc = vc.presentedViewController;
vc.presentViewControllerAnimatedCompletion(alert, true, null);

'completed';
