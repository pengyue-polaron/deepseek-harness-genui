export const NS = 'genui'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    genui: GenuiKey
  }
}

export const zh = {
  'locale.code': 'zh',
  'app.untitled': '未命名应用',
  'app.building': '正在生成应用…',
  'app.open': '打开应用',
  'app.show': '展开应用',
  'app.hide': '收起应用',
  'app.loading': '正在打开应用…',
  'app.loadFailed': '应用暂时没有打开。',
  'app.reload': '重新打开',
  'app.canvasReturn': '回到应用',
  'action.fullscreen': '全屏查看',
  'action.exitFullscreen': '退出全屏',
  'action.openCanvas': '在右侧打开',
  'action.closeCanvas': '收回到对话',
  'feedback.fullscreenFailed': '无法进入全屏，请重试',
  'permission.title': '需要你的同意',
  'permission.read': '读取信息',
  'permission.write': '执行更改',
  'permission.connect': '连接到',
  'permission.methods': '允许请求',
  'permission.scope': '同意后，这个应用可以在当前任务中继续使用这项能力。用途发生变化时会再次询问。',
  'permission.deny': '暂不允许',
  'permission.allow': '允许当前任务使用',
  'permission.allowing': '正在授权…',
  'permission.failed': '暂时无法完成授权，请重试。',
  'receipt.updated': '应用已更新',
  'receipt.failed': '这次修改没有生效，应用保持原样',
  'receipt.openCurrent': '打开应用',
  'receipt.unavailable': '应用暂时没有打开。你可以在对话里让我再试一次。',
} as const

export type GenuiKey = keyof typeof zh

export const en = {
  'locale.code': 'en',
  'app.untitled': 'Untitled app',
  'app.building': 'Building the app…',
  'app.open': 'Open app',
  'app.show': 'Show app',
  'app.hide': 'Hide app',
  'app.loading': 'Opening app…',
  'app.loadFailed': 'The app did not open.',
  'app.reload': 'Open again',
  'app.canvasReturn': 'Return to app',
  'action.fullscreen': 'View full screen',
  'action.exitFullscreen': 'Exit full screen',
  'action.openCanvas': 'Open on the right',
  'action.closeCanvas': 'Return to conversation',
  'feedback.fullscreenFailed': 'Could not enter full screen. Try again.',
  'permission.title': 'Your permission is needed',
  'permission.read': 'Read information',
  'permission.write': 'Make changes',
  'permission.connect': 'Connect to',
  'permission.methods': 'Allowed requests',
  'permission.scope': 'Once allowed, this app can keep using this capability during the current task. You will be asked again if its purpose changes.',
  'permission.deny': 'Not now',
  'permission.allow': 'Allow for this task',
  'permission.allowing': 'Allowing…',
  'permission.failed': 'Permission could not be saved. Try again.',
  'receipt.updated': 'App updated',
  'receipt.failed': 'That change was not applied. The app is unchanged',
  'receipt.openCurrent': 'Open app',
  'receipt.unavailable': 'The app could not open. You can ask me to try again in the conversation.',
} satisfies Record<GenuiKey, string>
