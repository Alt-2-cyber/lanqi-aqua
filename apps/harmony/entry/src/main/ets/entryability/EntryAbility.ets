import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';

export default class EntryAbility extends UIAbility {
  onForeground(): void {
    AppStorage.setOrCreate('aquaForeground', true);
  }

  onBackground(): void {
    AppStorage.setOrCreate('aquaForeground', false);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index').catch(() => {
      console.error('Unable to load the main page');
    });
  }
}
