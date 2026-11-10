/**
 * 插件管理页配置卡片(plugins.row.config)的文案字典:zh/en 双语,注册进
 * locale 服务。命名空间声明合并进 LocaleNamespaceMap,typed register
 * 缺键/多键在编译期报错。
 *
 * 与 0.4.7 下线的设置 General 行字典(仓库 backups/ 里的
 * settings-locales.ts)同源:沿用其字段文案键,新增插件页卡片所需的
 * 摘要/加载/只读文案键。
 */

/** 插件页配置卡片命名空间(locale 字典与槽位 locale 座共用)。 */
export const QQ_SKIN_PLUGIN_NS = 'dsh-qq-skin.plugin'

/** 插件页配置卡片文案键全集。 */
export type QQSkinPluginKey =
  | 'card.summary'
  | 'card.loading'
  | 'card.readOnly'
  | 'card.save'
  | 'card.saving'
  | 'card.discard'
  | 'card.pickImage'
  | 'card.imageClear'
  | 'card.imageSet'
  | 'card.imageError'
  | 'card.saveFailed'
  | 'row.palette'
  | 'palette.classic'
  | 'palette.vivid'
  | 'palette.clean'
  | 'palette.green'
  | 'palette.black'
  | 'palette.qqblue'
  | 'palette.custom'
  | 'row.customColor'
  | 'row.density'
  | 'density.normal'
  | 'density.compact'
  | 'row.avatarStyle'
  | 'row.avatarCustomImage'
  | 'avatar.classic'
  | 'avatar.sunglasses'
  | 'avatar.scarf'
  | 'row.bubbleTail'
  | 'row.assistantAvatar'
  | 'row.avatarSize'
  | 'row.chatMaxWidth'
  | 'row.frostedGlass'
  | 'row.typing'
  | 'row.timeDivider'
  | 'divider.today'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 插件页配置卡片的文案。 */
    'dsh-qq-skin.plugin': QQSkinPluginKey
  }
}

/** 中文文案。 */
export const zh: Record<QQSkinPluginKey, string> = {
  'card.summary': 'QQ NT 皮肤:色板、气泡、企鹅头像、毛玻璃与时间分隔条等外观配置。',
  'card.loading': '配置加载中…',
  'card.readOnly': '当前配置文档为只读,修改无法保存。',
  'card.save': '保存',
  'card.saving': '保存中…',
  'card.discard': '放弃',
  'card.pickImage': '选择本地图片…',
  'card.imageClear': '恢复官方企鹅',
  'card.imageSet': '已选择本地图片,保存后生效。',
  'card.imageError': '图片读取失败,请换一张图片。',
  'card.saveFailed': '保存失败,请重试。',
  'row.palette': '色板',
  'palette.classic': '经典蓝',
  'palette.vivid': '炫彩紫',
  'palette.clean': '简洁白',
  'palette.green': '经典绿气泡',
  'palette.black': '深空黑',
  'palette.qqblue': 'QQ蓝',
  'palette.custom': '自定义主色',
  'row.customColor': '主色调色盘',
  'row.density': '消息密度',
  'density.normal': '标准',
  'density.compact': '紧凑',
  'row.avatarStyle': '企鹅装扮',
  'row.avatarCustomImage': '自定义头像',
  'avatar.classic': '经典企鹅',
  'avatar.sunglasses': '酷黑墨镜',
  'avatar.scarf': '冬日暖围巾',
  'row.bubbleTail': '气泡尾巴',
  'row.assistantAvatar': '企鹅头像',
  'row.avatarSize': '头像尺寸',
  'row.chatMaxWidth': '会话宽度',
  'row.frostedGlass': '毛玻璃质感',
  'row.typing': '打字机效果',
  'row.timeDivider': '时间分隔条',
  'divider.today': '今天',
}

/** 英文文案。 */
export const en: Record<QQSkinPluginKey, string> = {
  'card.summary': 'QQ NT skin: palette, bubbles, penguin avatar, frosted glass, time dividers and more.',
  'card.loading': 'Loading configuration…',
  'card.readOnly': 'The current configuration document is read-only; changes cannot be saved.',
  'card.save': 'Save',
  'card.saving': 'Saving…',
  'card.discard': 'Discard',
  'card.pickImage': 'Pick local image…',
  'card.imageClear': 'Restore official penguin',
  'card.imageSet': 'Local image picked; takes effect after Save.',
  'card.imageError': 'Failed to read the image; try another one.',
  'card.saveFailed': 'Save failed; please try again.',
  'row.palette': 'Palette',
  'palette.classic': 'Classic Blue',
  'palette.vivid': 'Vivid Purple',
  'palette.clean': 'Clean White',
  'palette.green': 'Green Bubble',
  'palette.black': 'Deep Black',
  'palette.qqblue': 'QQ Blue',
  'palette.custom': 'Custom Color',
  'row.customColor': 'Accent color',
  'row.density': 'Density',
  'density.normal': 'Standard',
  'density.compact': 'Compact',
  'row.avatarStyle': 'Avatar style',
  'row.avatarCustomImage': 'Custom avatar',
  'avatar.classic': 'Classic',
  'avatar.sunglasses': 'Sunglasses',
  'avatar.scarf': 'Winter scarf',
  'row.bubbleTail': 'Bubble tail',
  'row.assistantAvatar': 'Penguin avatar',
  'row.avatarSize': 'Avatar size',
  'row.chatMaxWidth': 'Chat width',
  'row.frostedGlass': 'Frosted glass',
  'row.typing': 'Typing effect',
  'row.timeDivider': 'Time dividers',
  'divider.today': 'Today',
}
