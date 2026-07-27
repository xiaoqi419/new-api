/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ChangelogEntry } from './types'

// ============================================================================
// Version changelog (newest first).
//
// Append a new entry at the TOP on each release. The `version` should match the
// image tag baked by build-push.sh (e.g. 20260721-<sha>). The `items` strings
// are shown as-is; keep them short. Wrap each with t() at render time is not
// needed — put user-facing copy directly here.
// ============================================================================

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '20260728',
    date: '2026-07-28',
    changes: [
      {
        kind: 'feature',
        items: [
          '新增「更新公告」中心:用户端按「全部 / 版本公告 / 系统通知 / 活动」分类查看公告,右侧展示版本时间线;管理员可在「公告管理」后台创建 / 编辑 / 删除公告,支持分类、级别、置顶、发布时间与草稿状态,内容支持 Markdown。',
          '新增「工单」系统:用户可提交工单(分类 / 优先级 / 附件)、查看进度并与客服多轮对话;管理员在「工单管理」后台按状态 / 分类 / 优先级 / 关键词筛选、回复并调整状态与优先级。用户新建或回复时通过企业微信群机器人与站内消息通知管理员,管理员回复后按用户通知渠道通知用户;附件本地存储并做越权校验。',
        ],
      },
    ],
  },
  {
    version: '20260727',
    date: '2026-07-27',
    changes: [
      {
        kind: 'feature',
        items: [
          '新增「登录设备」管理:个人资料页可查看当前账号的所有登录会话,并一键下线其他设备,仅保留当前设备在线。',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '同步上游 New API v1.0.0-rc.22:合并鉴权安全增强(无状态会话、会话版本校验、OAuth / Telegram / 微信绑定流程)、模型分组能力与多项修复;完整保留本项目定制的经典版前端,可通过环境变量 THEME=classic 启用。',
        ],
      },
      {
        kind: 'feature',
        items: [
          '「绘图日志」升级为统一出图视图:一处汇总全部出图记录，包括文生图（/v1/images/generations）、图片编辑（edits）、对话出图、图像工具调用，以及 Midjourney 任务，列表直接展示来源、模型、类型、渠道、消耗额度、提示词与结果图。',
          '新增结果图缩略图:对图片生成 / 编辑接口自动抓取生成的图片并在本地生成缩略图，绘图日志中即可预览、点击查看大图；缩略图默认保留 30 天后自动清理，不依赖对象存储。',
          '新增「财务中心」:钱包、拼团大厅、发票、幸运抽奖合并到一个页面，顶部横向标签页一键切换，侧边栏更清爽。',
          '侧边栏进一步精简:新增「个人中心」(个人资料 / 邀请 / 身份认证)、「仪表盘」(概览 / 数据看板 / Flow / 用户分析)、「用量日志」(通用 / 绘图 / 任务)三处横向标签页合并;聊天分组仅保留「游乐场」。',
          '新增「工作台」上手引导页:一处搞定 接口地址复制、创建密钥入口、cURL / Python / Node.js 首次调用示例,并实时等待首次调用状态;概览的「开始使用」与落地页的 Get Started 均指向工作台。',
          '登录页焕新为左右分栏:左侧为品牌展示区(背景图 / 标题 / 简介 / 统计数字均可在「系统设置 → 站点 → 登录页」自定义),右侧沿用原有登录能力。',
          '新增「API Key 分组自动切换」:创建 / 编辑密钥时可开启自动切换并选择多个候选分组,系统按倍率从低到高自动排序;单个分组连续可重试失败达到阈值(1-5,默认 2)或无可用账号时自动升级到下一个分组,升级后在冷却时间(5 / 10 / 30 分钟)内粘滞使用较高分组,到期再从最低倍率分组重新尝试,升级后的请求按实际使用分组计费。此模式已完全取代旧的 auto 路由机制。',
        ],
      },
    ],
  },
  {
    version: '20260726',
    date: '2026-07-26',
    changes: [
      {
        kind: 'feature',
        items: [
          '豆包视频生成支持真人图「自动入库」：当上传的真人原图被上游拦截（提示疑似真人）时，系统会自动把该图存入火山私域素材库并改用 asset:// 引用后自动重试，真人图也能直接出片，无需手动先上传素材库；同一张图会复用已入库素材，网页与 API 均生效。',
        ],
      },
    ],
  },
  {
    version: '20260725',
    date: '2026-07-25',
    changes: [
      {
        kind: 'improvement',
        items: [
          '抽奖与身份认证后台设置的「额度」输入统一改为按显示货币（美元）填写：与用户管理修改钱包一致，所填即所得，输入框下方实时预览换算后的额度，保存时自动换算，无需再手动乘以 50 万。',
        ],
      },
    ],
  },
  {
    version: '20260722',
    date: '2026-07-22',
    changes: [
      {
        kind: 'feature',
        items: [
          '全新「幸运抽奖大转盘」：管理员可后台配置奖项（额度 / 再抽一次 / 谢谢参与）、中奖权重、每次抽奖保底额度，用户凭摇摇卡抽奖。',
          '摇摇卡多渠道获取：管理员手动发放、累计消费达标自动解锁（带进度条）、累计充值达标赠送（支持限时卡到期作废）。',
          '个人资料页为认证通过的用户展示「已认证」身份徽章。',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '抽奖页视觉升级：红圈灯带大转盘、扇区按奖项类型自动配图标、中心一键抽奖，右侧展示可抽次数 / 保底 / 奖池及我的摇摇卡。',
        ],
      },
    ],
  },
  {
    version: '20260721',
    date: '2026-07-21',
    changes: [
      {
        kind: 'feature',
        items: [
          '新增身份认证发放额度功能：教师 / 医疗 / 大学生等身份提交证明，管理员审核通过后自动发放额度。',
          '新增管理员版本更新日志页面。',
        ],
      },
      {
        kind: 'improvement',
        items: ['接入 Watchtower，支持镜像在线自动更新，无需登录服务器。'],
      },
    ],
  },
]
