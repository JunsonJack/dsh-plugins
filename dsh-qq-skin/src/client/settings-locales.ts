/**
 * QQ 皮肤设置行的文案字典(zh/en 双语,注册进 locale 服务)。命名空间
 * 声明合并进 LocaleNamespaceMap,typed register 缺键/多键在编译期报错。
 */

/** 设置行命名空间(locale 字典与槽位 locale 座共用)。 */
export const QQ_SKIN_ROW_NS = 'dsh-qq-skin.settings'

/** 设置行文案键全集。 */
export type QQSkinSettingsKey =
  | 'row.title'
  | 'row.palette'
  | 'palette.classic'
  | 'palette.vivid'
  | 'palette.clean'
  | 'palette.green'
  | 'palette.black'
  | 'palette.qqblue'
  | 'palette.custom'
  | 'row.customColor'
  | 'row.avatarStyle'
  | 'row.avatarCustomImage'
  | 'avatar.classic'
  | 'avatar.sunglasses'
  | 'avatar.scarf'
  | 'row.bubbleTail'
  | 'row.assistantAvatar'
  | 'row.avatarSize'
  | 'row.chatMaxWidth'
  | 'row.messageSound'
  | 'row.sendSound'
  | 'row.soundVariant'
  | 'row.soundVolume'
  | 'row.remindOnlyWhenUnfocused'
  | 'row.quietHours'
  | 'sound.beep'
  | 'sound.waterdrop'
  | 'sound.knock'
  | 'row.windowShake'
  | 'row.frostedGlass'
  | 'row.typing'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** QQ 皮肤设置行的文案。 */
    'dsh-qq-skin.settings': QQSkinSettingsKey
  }
}

/** 中文文案。 */
export const zh: Record<QQSkinSettingsKey, string> = {
  'row.title': 'QQ 皮肤',
  'row.palette': '色板',
  'palette.classic': '经典蓝',
  'palette.vivid': '炫彩紫',
  'palette.clean': '简洁白',
  'palette.green': '经典绿气泡',
  'palette.black': '深空黑',
  'palette.qqblue': 'QQ蓝',
  'palette.custom': '自定义主色',
  'row.customColor': '主色调色盘',
  'row.avatarStyle': '企鹅装扮',
  'row.avatarCustomImage': '自定义头像',
  'avatar.classic': '经典企鹅',
  'avatar.sunglasses': '酷黑墨镜',
  'avatar.scarf': '冬日暖围巾',
  'row.bubbleTail': '气泡尾巴',
  'row.assistantAvatar': '企鹅头像',
  'row.avatarSize': '头像尺寸',
  'row.chatMaxWidth': '会话宽度',
  'row.messageSound': '助手消息提示音',
  'row.sendSound': '发送消息反馈音',
  'row.soundVariant': '提示声音色',
  'row.soundVolume': '提示音音量',
  'row.remindOnlyWhenUnfocused': '仅失焦时提醒',
  'row.quietHours': '免打扰时段',
  'sound.beep': '经典寻呼机',
  'sound.waterdrop': '灵动水滴',
  'sound.knock': '清脆敲门',
  'row.windowShake': '窗口抖动提醒',
  'row.frostedGlass': '毛玻璃质感',
  'row.typing': '打字机效果',
}

/** 英文文案。 */
export const en: Record<QQSkinSettingsKey, string> = {
  'row.title': 'QQ Skin',
  'row.palette': 'Palette',
  'palette.classic': 'Classic Blue',
  'palette.vivid': 'Vivid Purple',
  'palette.clean': 'Clean White',
  'palette.green': 'Green Bubble',
  'palette.black': 'Deep Black',
  'palette.qqblue': 'QQ Blue',
  'palette.custom': 'Custom Color',
  'row.customColor': 'Accent color',
  'row.avatarStyle': 'Avatar style',
  'row.avatarCustomImage': 'Custom avatar',
  'avatar.classic': 'Classic',
  'avatar.sunglasses': 'Sunglasses',
  'avatar.scarf': 'Winter scarf',
  'row.bubbleTail': 'Bubble tail',
  'row.assistantAvatar': 'Penguin avatar',
  'row.avatarSize': 'Avatar size',
  'row.chatMaxWidth': 'Chat width',
  'row.messageSound': 'Assistant sound',
  'row.sendSound': 'Sent sound',
  'row.soundVariant': 'Sound tone',
  'row.soundVolume': 'Sound volume',
  'row.remindOnlyWhenUnfocused': 'Remind only when unfocused',
  'row.quietHours': 'Quiet hours',
  'sound.beep': 'Classic Pager',
  'sound.waterdrop': 'Water Drop',
  'sound.knock': 'Door Knock',
  'row.windowShake': 'Window shake',
  'row.frostedGlass': 'Frosted glass',
  'row.typing': 'Typing effect',
}
