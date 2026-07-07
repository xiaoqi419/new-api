package setting

// 微信支付（官方商户直连，APIv3，支持 Native / H5 / JSAPI 渠道）
var (
	WechatPayEnabled      = false
	WechatPayAppId        = "" // 公众号/服务号 AppID（JSAPI 需服务号）
	WechatPayAppSecret    = "" // 服务号 AppSecret（仅 JSAPI 网页授权取 openid 时需要）
	WechatPayMchId        = "" // 商户号
	WechatPayApiV3Key     = "" // APIv3 密钥
	WechatPayCert         = "" // 公钥证书 apiclient_cert.pem 内容（用于自动提取序列号）
	WechatPayCertSerialNo = "" // 商户证书序列号（手填兜底，留空则从证书自动解析）
	WechatPayPrivateKey   = "" // 商户私钥（apiclient_key.pem 内容）
	WechatPayNotifyUrl    = "" // 支付回调基地址（留空则用站点地址）
	WechatPayNative       = true
	WechatPayH5           = false
	WechatPayJSAPI        = false
	WechatPayMinTopUp     = 1
)

// 支付宝（官方商户直连，电脑网站支付，公钥模式）
var (
	AlipayEnabled    = false
	AlipayAppId      = "" // 应用 AppID
	AlipayPrivateKey = "" // 应用私钥
	AlipayPublicKey  = "" // 支付宝公钥
	AlipayProduction = true
	AlipayMinTopUp   = 1
)
