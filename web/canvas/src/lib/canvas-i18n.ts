import { useEffect, useState } from "react";

/**
 * Canvas is vendored as a standalone application and intentionally does not
 * depend on the main site's react-i18next runtime. These host/bootstrap and
 * API-service messages follow the language selected by the host.
 */
export const CANVAS_LOCALES = ["en", "zhCN", "zhTW", "fr", "ru", "ja", "vi"] as const;

export type CanvasLocale = (typeof CANVAS_LOCALES)[number];

export const CANVAS_MESSAGE_KEYS = [
    "host.keyLoadFailed",
    "host.keyLoadFailedDescription",
    "host.noEnabledKey",
    "host.noEnabledKeyDescription",
    "host.tokenRequestTimeout",
    "host.tokenRequestUnavailable",
    "host.noModelChannel",
    "host.modelCheckRequired",
    "host.noImageModel",
    "host.noImageModelDescription",
    "host.untrustedOrigin",
    "host.retry",
    "host.manageKeys",
    "config.embeddedQueryIgnored",
    "config.importedFromQuery",
    "config.invalidQuery",
    "media.cancelled",
    "media.networkError",
    "media.authError",
    "media.rateLimit",
    "media.clientError",
    "media.serverError",
    "media.notFound",
    "media.requestError",
    "media.htmlError",
    "media.imageGeneration",
    "media.audioGeneration",
    "media.videoTaskCreation",
    "media.videoTaskQuery",
    "media.modelList",
    "media.mediaSave",
    "media.image",
    "media.audio",
    "media.video",
    "media.missingModel",
    "media.missingBaseUrl",
    "media.missingApiKey",
    "media.unsupportedFormat",
    "media.unsupportedReferences",
    "media.noResult",
    "media.noTaskId",
    "media.noVideoTask",
    "media.noTask",
    "media.videoFailed",
    "media.videoSucceededNoUrl",
    "media.invalidResponse",
    "media.providerRejected",
    "media.timeout",
] as const;

export type CanvasMessageKey = (typeof CANVAS_MESSAGE_KEYS)[number];

type CanvasMessages = Record<CanvasMessageKey, string>;
export type CanvasMessageParams = Readonly<Record<string, string | number>>;

const ZH_CN_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "读取当前账号 API Key 失败",
    "host.keyLoadFailedDescription": "请稍后重试，或前往 API 密钥页面检查账号状态。",
    "host.noEnabledKey": "当前账号没有启用的 API Key",
    "host.noEnabledKeyDescription": "画布仍可浏览；创建或启用 API Key 后即可调用图片模型。",
    "host.tokenRequestTimeout": "主站 API Key 请求超时，请重试。",
    "host.tokenRequestUnavailable": "主站 API Key 请求通道不可用，请通过主站重新打开后重试。",
    "host.noModelChannel": "没有可用的模型渠道",
    "host.modelCheckRequired": "图片模型配置需要检查",
    "host.noImageModel": "当前 API Key 没有可用的图片模型。",
    "host.noImageModelDescription": "当前 API Key 没有可用的图片模型，请在渠道设置中检查模型能力。",
    "host.untrustedOrigin": "Canvas 嵌入来源不可验证，请通过主站重新打开后重试。",
    "host.retry": "重试",
    "host.manageKeys": "管理 API 密钥",
    "config.embeddedQueryIgnored": "内嵌画布使用本站 API Key，已忽略 URL 中的直连配置",
    "config.importedFromQuery": "已导入本地直连配置",
    "config.invalidQuery": "URL 中的直连配置无效，未应用任何更改",
    "media.cancelled": "请求已取消",
    "media.networkError": "网络连接失败，请检查网络后重试",
    "media.authError": "鉴权失败，请检查 API Key、套餐权限或模型权限",
    "media.rateLimit": "请求被限流或额度不足，请稍后重试",
    "media.clientError": "请求失败（HTTP {{status}}），请检查请求参数和模型配置",
    "media.serverError": "服务暂时不可用（HTTP {{status}}），请稍后重试",
    "media.notFound": "接口地址不存在（404），请检查 Base URL 和模型选择",
    "media.requestError": "请求失败，请稍后重试或检查配置",
    "media.htmlError": "服务返回了无法读取的错误页面",
    "media.imageGeneration": "图片生成失败",
    "media.audioGeneration": "音频生成失败",
    "media.videoTaskCreation": "视频任务创建失败",
    "media.videoTaskQuery": "视频任务查询失败",
    "media.modelList": "读取模型失败",
    "media.mediaSave": "保存{{media}}失败",
    "media.missingModel": "请先配置{{media}}模型",
    "media.missingBaseUrl": "请先配置 Base URL",
    "media.missingApiKey": "请先配置 API Key",
    "media.unsupportedFormat": "{{provider}} 调用格式暂不支持{{media}}生成，请使用 OpenAI 兼容格式渠道",
    "media.unsupportedReferences": "当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考资产",
    "media.image": "图片",
    "media.audio": "音频",
    "media.video": "视频",
    "media.noResult": "服务没有返回{{result}}",
    "media.noTaskId": "视频接口没有返回任务 ID",
    "media.noVideoTask": "视频接口没有返回视频任务",
    "media.noTask": "Seedance 接口没有返回任务",
    "media.videoFailed": "视频生成失败",
    "media.videoSucceededNoUrl": "视频任务已成功，但没有返回视频 URL",
    "media.invalidResponse": "接口返回了无法识别的数据格式，请检查模型或接口兼容性",
    "media.providerRejected": "{{provider}}拒绝了本次请求：{{reason}}",
    "media.timeout": "{{provider}}{{media}}生成超时，请稍后重试",
};

const EN_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "Could not read API keys for this account",
    "host.keyLoadFailedDescription": "Try again later, or open the API keys page to check your account.",
    "host.noEnabledKey": "This account has no enabled API keys",
    "host.noEnabledKeyDescription": "You can browse the canvas; create or enable an API key to use image models.",
    "host.tokenRequestTimeout": "The host API key request timed out. Please try again.",
    "host.tokenRequestUnavailable": "The host API key request channel is unavailable. Reopen the canvas from the main site and try again.",
    "host.noModelChannel": "No model channel is available",
    "host.modelCheckRequired": "Check the image model configuration",
    "host.noImageModel": "The current API key has no available image model.",
    "host.noImageModelDescription": "The current API key has no available image model. Check the model capabilities in the channel settings.",
    "host.untrustedOrigin": "The embedded Canvas origin could not be verified. Reopen it from the main site and try again.",
    "host.retry": "Retry",
    "host.manageKeys": "Manage API keys",
    "config.embeddedQueryIgnored": "The embedded canvas uses this site's API key; the direct URL configuration was ignored",
    "config.importedFromQuery": "Imported the local direct connection configuration",
    "config.invalidQuery": "The direct URL configuration is invalid; no changes were applied",
    "media.cancelled": "Request cancelled",
    "media.networkError": "Network connection failed. Check your connection and try again.",
    "media.authError": "Authentication failed. Check the API key, plan, or model permissions.",
    "media.rateLimit": "The request was rate limited or the quota is insufficient. Try again later.",
    "media.clientError": "Request failed (HTTP {{status}}). Check the request parameters and model configuration.",
    "media.serverError": "The service is temporarily unavailable (HTTP {{status}}). Try again later.",
    "media.notFound": "Endpoint not found (404). Check the Base URL and model selection.",
    "media.requestError": "Request failed. Try again later or check the configuration.",
    "media.htmlError": "The service returned an unreadable error page.",
    "media.imageGeneration": "Image generation failed",
    "media.audioGeneration": "Audio generation failed",
    "media.videoTaskCreation": "Video task creation failed",
    "media.videoTaskQuery": "Video task lookup failed",
    "media.modelList": "Could not load models",
    "media.mediaSave": "Could not save {{media}}",
    "media.missingModel": "Configure an {{media}} model first",
    "media.missingBaseUrl": "Configure a Base URL first",
    "media.missingApiKey": "Configure an API key first",
    "media.unsupportedFormat": "{{provider}} format does not support {{media}} generation. Use an OpenAI-compatible channel.",
    "media.unsupportedReferences": "This video endpoint does not support video or audio references. Switch to Seedance 2.0 / Volcano Agent Plan, or remove the reference assets.",
    "media.image": "image",
    "media.audio": "audio",
    "media.video": "video",
    "media.noResult": "The service returned no {{result}}.",
    "media.noTaskId": "The video API did not return a task ID.",
    "media.noVideoTask": "The video API did not return a video task.",
    "media.noTask": "The Seedance API did not return a task.",
    "media.videoFailed": "Video generation failed",
    "media.videoSucceededNoUrl": "The video task succeeded but returned no video URL.",
    "media.invalidResponse": "The service returned an unrecognized response format. Check the model or API compatibility.",
    "media.providerRejected": "{{provider}} rejected this request: {{reason}}",
    "media.timeout": "{{provider}}{{media}} generation timed out. Try again later.",
};

const ZH_TW_MESSAGES: CanvasMessages = {
    ...ZH_CN_MESSAGES,
    "host.keyLoadFailed": "讀取目前帳號 API Key 失敗",
    "host.keyLoadFailedDescription": "請稍後再試，或前往 API 金鑰頁面檢查帳號狀態。",
    "host.noEnabledKey": "目前帳號沒有啟用的 API Key",
    "host.noEnabledKeyDescription": "仍可瀏覽畫布；建立或啟用 API Key 後即可呼叫圖片模型。",
    "host.tokenRequestTimeout": "主站 API Key 要求逾時，請重試。",
    "host.tokenRequestUnavailable": "主站 API Key 要求通道無法使用，請從主站重新開啟後重試。",
    "host.noModelChannel": "沒有可用的模型頻道",
    "host.modelCheckRequired": "需要檢查圖片模型設定",
    "host.noImageModel": "目前 API Key 沒有可用的圖片模型。",
    "host.noImageModelDescription": "目前 API Key 沒有可用的圖片模型，請在頻道設定中檢查模型能力。",
    "host.untrustedOrigin": "無法驗證 Canvas 嵌入來源，請從主站重新開啟後重試。",
    "host.retry": "重試",
    "host.manageKeys": "管理 API 金鑰",
    "config.embeddedQueryIgnored": "嵌入式畫布使用本站 API Key，已忽略 URL 中的直連設定",
    "config.importedFromQuery": "已匯入本機直連設定",
    "config.invalidQuery": "URL 中的直連設定無效，未套用任何變更",
    "media.cancelled": "要求已取消",
    "media.networkError": "網路連線失敗，請檢查網路後重試",
    "media.authError": "驗證失敗，請檢查 API Key、方案權限或模型權限",
    "media.rateLimit": "要求受到限流或額度不足，請稍後重試",
    "media.clientError": "要求失敗（HTTP {{status}}），請檢查要求參數和模型設定",
    "media.serverError": "服務暫時無法使用（HTTP {{status}}），請稍後重試",
    "media.notFound": "找不到介面位址（404），請檢查 Base URL 和模型選擇",
    "media.requestError": "要求失敗，請稍後重試或檢查設定",
    "media.htmlError": "服務回傳了無法讀取的錯誤頁面",
    "media.imageGeneration": "圖片生成失敗",
    "media.audioGeneration": "音訊生成失敗",
    "media.videoTaskCreation": "影片工作建立失敗",
    "media.videoTaskQuery": "影片工作查詢失敗",
    "media.modelList": "讀取模型失敗",
    "media.mediaSave": "儲存{{media}}失敗",
    "media.missingModel": "請先設定{{media}}模型",
    "media.missingBaseUrl": "請先設定 Base URL",
    "media.missingApiKey": "請先設定 API Key",
    "media.unsupportedFormat": "{{provider}} 呼叫格式暫不支援{{media}}生成，請使用 OpenAI 相容格式頻道",
    "media.unsupportedReferences": "目前影片介面不支援參考影片或參考音訊，請切換到 Seedance 2.0／火山 Agent Plan 模型，或移除參考資產",
    "media.image": "圖片",
    "media.audio": "音訊",
    "media.video": "影片",
    "media.noResult": "服務沒有回傳{{result}}",
    "media.noTaskId": "影片介面沒有回傳工作 ID",
    "media.noVideoTask": "影片介面沒有回傳影片工作",
    "media.noTask": "Seedance 介面沒有回傳工作",
    "media.videoFailed": "影片生成失敗",
    "media.videoSucceededNoUrl": "影片工作已成功，但沒有回傳影片 URL",
    "media.invalidResponse": "介面回傳了無法辨識的資料格式，請檢查模型或介面相容性",
    "media.providerRejected": "{{provider}}拒絕了此次要求：{{reason}}",
    "media.timeout": "{{provider}}{{media}}生成逾時，請稍後重試",
};

const FR_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "Impossible de lire les clés API de ce compte",
    "host.keyLoadFailedDescription": "Réessayez plus tard ou ouvrez la page des clés API pour vérifier le compte.",
    "host.noEnabledKey": "Ce compte n'a aucune clé API activée",
    "host.noEnabledKeyDescription": "Vous pouvez parcourir le canevas ; créez ou activez une clé API pour utiliser les modèles d'image.",
    "host.tokenRequestTimeout": "La demande de clé API auprès du site hôte a expiré. Réessayez.",
    "host.tokenRequestUnavailable": "Le canal de demande de clé API auprès du site hôte est indisponible. Rouvrez le canevas depuis le site principal puis réessayez.",
    "host.noModelChannel": "Aucun canal de modèle n'est disponible",
    "host.modelCheckRequired": "Vérifiez la configuration du modèle d'image",
    "host.noImageModel": "La clé API actuelle ne propose aucun modèle d'image disponible.",
    "host.noImageModelDescription": "La clé API actuelle ne propose aucun modèle d'image disponible. Vérifiez les capacités du modèle dans les paramètres du canal.",
    "host.untrustedOrigin": "L'origine du canevas intégré n'a pas pu être vérifiée. Rouvrez-le depuis le site principal puis réessayez.",
    "host.retry": "Réessayer",
    "host.manageKeys": "Gérer les clés API",
    "config.embeddedQueryIgnored": "Le canevas intégré utilise la clé API de ce site ; la configuration directe de l'URL a été ignorée",
    "config.importedFromQuery": "Configuration de connexion directe locale importée",
    "config.invalidQuery": "La configuration directe de l'URL est invalide ; aucune modification n'a été appliquée",
    "media.cancelled": "Requête annulée",
    "media.networkError": "Échec de la connexion réseau. Vérifiez votre connexion puis réessayez.",
    "media.authError": "Échec de l'authentification. Vérifiez la clé API, le forfait ou les droits du modèle.",
    "media.rateLimit": "La requête est limitée ou le quota est insuffisant. Réessayez plus tard.",
    "media.clientError": "Échec de la requête (HTTP {{status}}). Vérifiez les paramètres et la configuration du modèle.",
    "media.serverError": "Le service est temporairement indisponible (HTTP {{status}}). Réessayez plus tard.",
    "media.notFound": "Point de terminaison introuvable (404). Vérifiez l'URL de base et le modèle.",
    "media.requestError": "Échec de la requête. Réessayez plus tard ou vérifiez la configuration.",
    "media.htmlError": "Le service a renvoyé une page d'erreur illisible.",
    "media.imageGeneration": "Échec de la génération d'image",
    "media.audioGeneration": "Échec de la génération audio",
    "media.videoTaskCreation": "Échec de la création de la tâche vidéo",
    "media.videoTaskQuery": "Échec de la recherche de la tâche vidéo",
    "media.modelList": "Impossible de charger les modèles",
    "media.mediaSave": "Impossible d'enregistrer {{media}}",
    "media.missingModel": "Configurez d'abord un modèle {{media}}",
    "media.missingBaseUrl": "Configurez d'abord une URL de base",
    "media.missingApiKey": "Configurez d'abord une clé API",
    "media.unsupportedFormat": "Le format {{provider}} ne prend pas en charge la génération {{media}}. Utilisez un canal compatible OpenAI.",
    "media.unsupportedReferences": "Cet endpoint vidéo ne prend pas en charge les références vidéo ou audio. Passez à Seedance 2.0 / Volcano Agent Plan ou supprimez les références.",
    "media.image": "image",
    "media.audio": "contenu audio",
    "media.video": "vidéo",
    "media.noResult": "Le service n'a renvoyé aucun résultat {{result}}.",
    "media.noTaskId": "L'API vidéo n'a renvoyé aucun identifiant de tâche.",
    "media.noVideoTask": "L'API vidéo n'a renvoyé aucune tâche vidéo.",
    "media.noTask": "L'API Seedance n'a renvoyé aucune tâche.",
    "media.videoFailed": "Échec de la génération vidéo",
    "media.videoSucceededNoUrl": "La tâche vidéo a réussi mais n'a renvoyé aucune URL vidéo.",
    "media.invalidResponse": "Le service a renvoyé un format de réponse inconnu. Vérifiez le modèle ou la compatibilité de l'API.",
    "media.providerRejected": "{{provider}} a refusé cette requête : {{reason}}",
    "media.timeout": "La génération {{provider}}{{media}} a expiré. Réessayez plus tard.",
};

const RU_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "Не удалось прочитать API-ключи этой учётной записи",
    "host.keyLoadFailedDescription": "Повторите попытку позже или откройте страницу API-ключей, чтобы проверить учётную запись.",
    "host.noEnabledKey": "У этой учётной записи нет включённых API-ключей",
    "host.noEnabledKeyDescription": "Полотно доступно для просмотра; создайте или включите API-ключ, чтобы использовать модели изображений.",
    "host.tokenRequestTimeout": "Время запроса API-ключа к основному сайту истекло. Повторите попытку.",
    "host.tokenRequestUnavailable": "Канал запроса API-ключа к основному сайту недоступен. Откройте полотно с основного сайта и повторите попытку.",
    "host.noModelChannel": "Нет доступного канала модели",
    "host.modelCheckRequired": "Проверьте настройки модели изображений",
    "host.noImageModel": "Для текущего API-ключа нет доступной модели изображений.",
    "host.noImageModelDescription": "Для текущего API-ключа нет доступной модели изображений. Проверьте возможности модели в настройках канала.",
    "host.untrustedOrigin": "Не удалось проверить источник встроенного Canvas. Откройте его с основного сайта и повторите попытку.",
    "host.retry": "Повторить",
    "host.manageKeys": "Управление API-ключами",
    "config.embeddedQueryIgnored": "Встроенное полотно использует API-ключ этого сайта; прямая конфигурация из URL проигнорирована",
    "config.importedFromQuery": "Локальная конфигурация прямого подключения импортирована",
    "config.invalidQuery": "Прямая конфигурация из URL недействительна; изменения не применены",
    "media.cancelled": "Запрос отменён",
    "media.networkError": "Ошибка сетевого подключения. Проверьте соединение и повторите попытку.",
    "media.authError": "Ошибка аутентификации. Проверьте API-ключ, тариф или права модели.",
    "media.rateLimit": "Запрос ограничен или квота недостаточна. Повторите позже.",
    "media.clientError": "Ошибка запроса (HTTP {{status}}). Проверьте параметры и настройки модели.",
    "media.serverError": "Сервис временно недоступен (HTTP {{status}}). Повторите позже.",
    "media.notFound": "Конечная точка не найдена (404). Проверьте базовый URL и модель.",
    "media.requestError": "Ошибка запроса. Повторите позже или проверьте настройки.",
    "media.htmlError": "Сервис вернул нечитаемую страницу ошибки.",
    "media.imageGeneration": "Не удалось создать изображение",
    "media.audioGeneration": "Не удалось создать аудио",
    "media.videoTaskCreation": "Не удалось создать видеозадачу",
    "media.videoTaskQuery": "Не удалось найти видеозадачу",
    "media.modelList": "Не удалось загрузить модели",
    "media.mediaSave": "Не удалось сохранить {{media}}",
    "media.missingModel": "Сначала настройте модель {{media}}",
    "media.missingBaseUrl": "Сначала настройте базовый URL",
    "media.missingApiKey": "Сначала настройте API-ключ",
    "media.unsupportedFormat": "Формат {{provider}} пока не поддерживает создание {{media}}. Используйте канал совместимый с OpenAI.",
    "media.unsupportedReferences": "Этот видео-интерфейс не поддерживает ссылки на видео или аудио. Переключитесь на Seedance 2.0 / Volcano Agent Plan или удалите ссылки.",
    "media.image": "изображения",
    "media.audio": "аудио",
    "media.video": "видео",
    "media.noResult": "Сервис не вернул {{result}}.",
    "media.noTaskId": "Видео API не вернул идентификатор задачи.",
    "media.noVideoTask": "Видео API не вернул видеозадачу.",
    "media.noTask": "API Seedance не вернул задачу.",
    "media.videoFailed": "Не удалось создать видео",
    "media.videoSucceededNoUrl": "Видеозадача выполнена, но URL видео не получен.",
    "media.invalidResponse": "Сервис вернул неизвестный формат ответа. Проверьте модель или совместимость API.",
    "media.providerRejected": "{{provider}} отклонил запрос: {{reason}}",
    "media.timeout": "Время ожидания генерации {{provider}}{{media}} истекло. Повторите позже.",
};

const JA_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "このアカウントの API キーを読み込めませんでした",
    "host.keyLoadFailedDescription": "しばらくしてから再試行するか、API キーページでアカウントを確認してください。",
    "host.noEnabledKey": "このアカウントには有効な API キーがありません",
    "host.noEnabledKeyDescription": "キャンバスは閲覧できます。画像モデルを使うには API キーを作成または有効化してください。",
    "host.tokenRequestTimeout": "ホストへの API キー要求がタイムアウトしました。もう一度お試しください。",
    "host.tokenRequestUnavailable": "ホストへの API キー要求チャネルを利用できません。メインサイトから Canvas を開き直してお試しください。",
    "host.noModelChannel": "利用可能なモデルチャネルがありません",
    "host.modelCheckRequired": "画像モデルの設定を確認してください",
    "host.noImageModel": "現在の API キーに利用可能な画像モデルがありません。",
    "host.noImageModelDescription": "現在の API キーに利用可能な画像モデルがありません。チャネル設定でモデルの機能を確認してください。",
    "host.untrustedOrigin": "埋め込み Canvas のオリジンを確認できませんでした。メインサイトから開き直してお試しください。",
    "host.retry": "再試行",
    "host.manageKeys": "API キーを管理",
    "config.embeddedQueryIgnored": "埋め込みキャンバスはこのサイトの API キーを使用するため、URL の直接接続設定を無視しました",
    "config.importedFromQuery": "ローカル直接接続設定を読み込みました",
    "config.invalidQuery": "URL の直接接続設定が無効なため、変更を適用しませんでした",
    "media.cancelled": "リクエストをキャンセルしました",
    "media.networkError": "ネットワーク接続に失敗しました。接続を確認して再試行してください。",
    "media.authError": "認証に失敗しました。API キー、プラン、モデル権限を確認してください。",
    "media.rateLimit": "リクエストが制限されたか、クォータが不足しています。後でもう一度お試しください。",
    "media.clientError": "リクエストに失敗しました（HTTP {{status}}）。パラメーターとモデル設定を確認してください。",
    "media.serverError": "サービスは一時的に利用できません（HTTP {{status}}）。後でもう一度お試しください。",
    "media.notFound": "エンドポイントが見つかりません（404）。Base URL とモデルを確認してください。",
    "media.requestError": "リクエストに失敗しました。後でもう一度試すか設定を確認してください。",
    "media.htmlError": "サービスが読み取れないエラーページを返しました。",
    "media.imageGeneration": "画像の生成に失敗しました",
    "media.audioGeneration": "音声の生成に失敗しました",
    "media.videoTaskCreation": "動画タスクの作成に失敗しました",
    "media.videoTaskQuery": "動画タスクの確認に失敗しました",
    "media.modelList": "モデルを読み込めませんでした",
    "media.mediaSave": "{{media}}を保存できませんでした",
    "media.missingModel": "先に{{media}}モデルを設定してください",
    "media.missingBaseUrl": "先に Base URL を設定してください",
    "media.missingApiKey": "先に API キーを設定してください",
    "media.unsupportedFormat": "{{provider}}形式は{{media}}生成に対応していません。OpenAI 互換チャンネルを使用してください。",
    "media.unsupportedReferences": "この動画エンドポイントは動画または音声の参照に対応していません。Seedance 2.0 / Volcano Agent Plan に切り替えるか、参照素材を削除してください。",
    "media.image": "画像",
    "media.audio": "音声",
    "media.video": "動画",
    "media.noResult": "サービスから{{result}}が返されませんでした。",
    "media.noTaskId": "動画 API からタスク ID が返されませんでした。",
    "media.noVideoTask": "動画 API から動画タスクが返されませんでした。",
    "media.noTask": "Seedance API からタスクが返されませんでした。",
    "media.videoFailed": "動画の生成に失敗しました",
    "media.videoSucceededNoUrl": "動画タスクは成功しましたが、動画 URL が返されませんでした。",
    "media.invalidResponse": "サービスが認識できない形式の応答を返しました。モデルまたは API の互換性を確認してください。",
    "media.providerRejected": "{{provider}} がリクエストを拒否しました: {{reason}}",
    "media.timeout": "{{provider}}{{media}}生成がタイムアウトしました。後でもう一度お試しください。",
};

const VI_MESSAGES: CanvasMessages = {
    "host.keyLoadFailed": "Không thể đọc API key của tài khoản này",
    "host.keyLoadFailedDescription": "Hãy thử lại sau hoặc mở trang API key để kiểm tra tài khoản.",
    "host.noEnabledKey": "Tài khoản này không có API key nào được bật",
    "host.noEnabledKeyDescription": "Bạn vẫn có thể xem canvas; hãy tạo hoặc bật API key để dùng model hình ảnh.",
    "host.tokenRequestTimeout": "Yêu cầu API key từ trang chủ đã hết thời gian. Vui lòng thử lại.",
    "host.tokenRequestUnavailable": "Kênh yêu cầu API key từ trang chủ không khả dụng. Hãy mở lại canvas từ trang chính rồi thử lại.",
    "host.noModelChannel": "Không có kênh model khả dụng",
    "host.modelCheckRequired": "Hãy kiểm tra cấu hình model hình ảnh",
    "host.noImageModel": "API key hiện tại không có model hình ảnh khả dụng.",
    "host.noImageModelDescription": "API key hiện tại không có model hình ảnh khả dụng. Hãy kiểm tra khả năng của model trong cài đặt kênh.",
    "host.untrustedOrigin": "Không thể xác minh nguồn của Canvas được nhúng. Hãy mở lại từ trang chính rồi thử lại.",
    "host.retry": "Thử lại",
    "host.manageKeys": "Quản lý API key",
    "config.embeddedQueryIgnored": "Canvas nhúng sử dụng API key của trang này; cấu hình kết nối trực tiếp trong URL đã bị bỏ qua",
    "config.importedFromQuery": "Đã nhập cấu hình kết nối trực tiếp cục bộ",
    "config.invalidQuery": "Cấu hình kết nối trực tiếp trong URL không hợp lệ; không có thay đổi nào được áp dụng",
    "media.cancelled": "Đã hủy yêu cầu",
    "media.networkError": "Kết nối mạng thất bại. Hãy kiểm tra kết nối và thử lại.",
    "media.authError": "Xác thực thất bại. Hãy kiểm tra API key, gói dịch vụ hoặc quyền của model.",
    "media.rateLimit": "Yêu cầu bị giới hạn hoặc hạn mức không đủ. Hãy thử lại sau.",
    "media.clientError": "Yêu cầu thất bại (HTTP {{status}}). Hãy kiểm tra tham số và cấu hình model.",
    "media.serverError": "Dịch vụ tạm thời không khả dụng (HTTP {{status}}). Hãy thử lại sau.",
    "media.notFound": "Không tìm thấy endpoint (404). Hãy kiểm tra Base URL và model.",
    "media.requestError": "Yêu cầu thất bại. Hãy thử lại sau hoặc kiểm tra cấu hình.",
    "media.htmlError": "Dịch vụ trả về trang lỗi không thể đọc.",
    "media.imageGeneration": "Tạo hình ảnh thất bại",
    "media.audioGeneration": "Tạo âm thanh thất bại",
    "media.videoTaskCreation": "Tạo tác vụ video thất bại",
    "media.videoTaskQuery": "Tra cứu tác vụ video thất bại",
    "media.modelList": "Không thể tải danh sách model",
    "media.mediaSave": "Không thể lưu {{media}}",
    "media.missingModel": "Hãy cấu hình model {{media}} trước",
    "media.missingBaseUrl": "Hãy cấu hình Base URL trước",
    "media.missingApiKey": "Hãy cấu hình API key trước",
    "media.unsupportedFormat": "Định dạng {{provider}} chưa hỗ trợ tạo {{media}}. Hãy dùng kênh tương thích OpenAI.",
    "media.unsupportedReferences": "Endpoint video này không hỗ trợ tham chiếu video hoặc âm thanh. Hãy chuyển sang Seedance 2.0 / Volcano Agent Plan hoặc xóa nội dung tham chiếu.",
    "media.image": "hình ảnh",
    "media.audio": "âm thanh",
    "media.video": "video",
    "media.noResult": "Dịch vụ không trả về {{result}}.",
    "media.noTaskId": "API video không trả về ID tác vụ.",
    "media.noVideoTask": "API video không trả về tác vụ video.",
    "media.noTask": "API Seedance không trả về tác vụ.",
    "media.videoFailed": "Tạo video thất bại",
    "media.videoSucceededNoUrl": "Tác vụ video thành công nhưng không trả về URL video.",
    "media.invalidResponse": "Dịch vụ trả về định dạng phản hồi không thể nhận diện. Hãy kiểm tra model hoặc khả năng tương thích API.",
    "media.providerRejected": "{{provider}} đã từ chối yêu cầu: {{reason}}",
    "media.timeout": "Tạo {{provider}}{{media}} đã hết thời gian. Hãy thử lại sau.",
};

const MESSAGES: Record<CanvasLocale, CanvasMessages> = {
    en: EN_MESSAGES,
    zhCN: ZH_CN_MESSAGES,
    zhTW: ZH_TW_MESSAGES,
    fr: FR_MESSAGES,
    ru: RU_MESSAGES,
    ja: JA_MESSAGES,
    vi: VI_MESSAGES,
};

export function normalizeCanvasLocale(value: unknown): CanvasLocale {
    if (typeof value !== "string") return "zhCN";
    const normalized = value.trim().replaceAll("_", "-").toLowerCase();
    if (normalized === "zhtw" || normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo" || normalized.startsWith("zh-hant")) return "zhTW";
    if (normalized === "zhcn" || normalized === "zh-cn" || normalized === "zh-hans" || normalized === "zh") return "zhCN";
    if (normalized === "en" || normalized.startsWith("en-")) return "en";
    if (normalized === "fr" || normalized.startsWith("fr-")) return "fr";
    if (normalized === "ru" || normalized.startsWith("ru-")) return "ru";
    if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
    if (normalized === "vi" || normalized.startsWith("vi-")) return "vi";
    return "en";
}

function readStoredLocale() {
    try {
        return typeof localStorage === "undefined" ? "" : localStorage.getItem("i18nextLng") || "";
    } catch {
        return "";
    }
}

function readHostDocumentLocale() {
    if (typeof window === "undefined" || window.parent === window) return "";
    try {
        return window.parent.document.documentElement.lang || "";
    } catch {
        return "";
    }
}

export function getCanvasLocale(): CanvasLocale {
    const candidates = [readStoredLocale(), readHostDocumentLocale(), typeof document === "undefined" ? "" : document.documentElement.lang, typeof navigator === "undefined" ? "" : navigator.language];
    const stored = candidates.find(Boolean);
    return normalizeCanvasLocale(stored);
}

function interpolateCanvasMessage(template: string, params: CanvasMessageParams) {
    return template.replace(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (placeholder, name) => {
        const value = params[name];
        return value === undefined ? placeholder : String(value);
    });
}

export function canvasText(key: CanvasMessageKey, locale: CanvasLocale = getCanvasLocale(), params: CanvasMessageParams = {}): string {
    return interpolateCanvasMessage(MESSAGES[locale][key] || MESSAGES.en[key], params);
}

export function canvasTextWithParams(key: CanvasMessageKey, params: CanvasMessageParams, locale = getCanvasLocale()): string {
    return canvasText(key, locale, params);
}

/** Subscribe to host language changes without bringing react-i18next into Canvas. */
export function useCanvasTranslation() {
    const [locale, setLocale] = useState<CanvasLocale>(() => getCanvasLocale());

    useEffect(() => {
        const refresh = () => {
            const next = getCanvasLocale();
            setLocale((current) => (current === next ? current : next));
        };
        window.addEventListener("storage", refresh);
        window.addEventListener("languagechange", refresh);
        return () => {
            window.removeEventListener("storage", refresh);
            window.removeEventListener("languagechange", refresh);
        };
    }, []);

    return {
        locale,
        t: (key: CanvasMessageKey, params?: CanvasMessageParams) => canvasText(key, locale, params),
    };
}
