package model

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/setting/ui_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Option struct {
	Key   string `json:"key" gorm:"primaryKey"`
	Value string `json:"value"`
}

// paymentGatewayModeOptionWriteMu serializes desired-mode writes within this
// process.  Apply also uses a database-side expected-value condition, because
// another process can still race between its read and conditional write.
var paymentGatewayModeOptionWriteMu sync.Mutex

// paymentGatewayModeApplyReservationOptionKey is an internal lease row used
// to coordinate save-and-apply with generic PaymentGatewayMode writes across
// processes.  It is deliberately kept in Options so it follows the existing
// database isolation without adding a payment-specific table or column.
const paymentGatewayModeApplyReservationOptionKey = "__internal.payment_gateway_mode_apply_reservation"

const paymentGatewayModeApplyReservationLeaseSeconds int64 = 5 * 60

var (
	ErrPaymentGatewayModeApplyReservationActive  = errors.New("payment gateway mode apply reservation is active")
	ErrPaymentGatewayModeApplyReservationInvalid = errors.New("payment gateway mode apply reservation is invalid")
)

type paymentGatewayModeApplyReservation struct {
	RequestID string `json:"request_id"`
	ExpiresAt int64  `json:"expires_at"`
}

func AllOption() ([]*Option, error) {
	var options []*Option
	var err error
	err = DB.Find(&options).Error
	return options, err
}

func isPaymentGatewayModeApplyReservationOption(key string) bool {
	return key == paymentGatewayModeApplyReservationOptionKey
}

func ensurePaymentGatewayModeApplyReservationRow(tx *gorm.DB) error {
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{
		Key: paymentGatewayModeApplyReservationOptionKey,
	}).Error
}

func decodePaymentGatewayModeApplyReservation(value string) (paymentGatewayModeApplyReservation, error) {
	if strings.TrimSpace(value) == "" {
		return paymentGatewayModeApplyReservation{}, nil
	}
	var reservation paymentGatewayModeApplyReservation
	if err := common.Unmarshal([]byte(value), &reservation); err != nil {
		return paymentGatewayModeApplyReservation{}, fmt.Errorf("%w: %v", ErrPaymentGatewayModeApplyReservationInvalid, err)
	}
	if strings.TrimSpace(reservation.RequestID) == "" || reservation.ExpiresAt <= 0 {
		return paymentGatewayModeApplyReservation{}, ErrPaymentGatewayModeApplyReservationInvalid
	}
	return reservation, nil
}

func paymentGatewayModeApplyReservationActive(value string, now int64) (bool, error) {
	reservation, err := decodePaymentGatewayModeApplyReservation(value)
	if err != nil {
		return false, err
	}
	return reservation.RequestID != "" && reservation.ExpiresAt > now, nil
}

// lockPaymentGatewayModeApplyReservation returns the durable reservation row
// while holding its row lock for the surrounding transaction.  The insert is
// an idempotent upsert so two fresh installations can race to create it on all
// supported dialects without a read-then-create gap.
func lockPaymentGatewayModeApplyReservation(tx *gorm.DB) (*Option, error) {
	if err := ensurePaymentGatewayModeApplyReservationRow(tx); err != nil {
		return nil, err
	}
	var reservation Option
	if err := lockForUpdate(tx).
		Where("key = ?", paymentGatewayModeApplyReservationOptionKey).
		First(&reservation).Error; err != nil {
		return nil, err
	}
	return &reservation, nil
}

func clearExpiredPaymentGatewayModeApplyReservation(tx *gorm.DB, reservation *Option, now int64) error {
	if reservation == nil || strings.TrimSpace(reservation.Value) == "" {
		return nil
	}
	active, err := paymentGatewayModeApplyReservationActive(reservation.Value, now)
	if err != nil {
		return err
	}
	if active {
		return nil
	}
	reservation.Value = ""
	return tx.Save(reservation).Error
}

// ReservePaymentGatewayModeApply atomically reserves the desired-mode option
// and writes the target value.  The reservation remains durable until the
// caller releases it after the response-trigger handoff (or until its bounded
// lease expires), preventing generic writers in another process from opening
// the CAS-to-trigger window.
func ReservePaymentGatewayModeApply(expectedValue, value, requestID string) (bool, error) {
	expectedValue, err := operation_setting.NormalizePaymentGatewayMode(expectedValue)
	if err != nil {
		return false, err
	}
	normalizedValue, err := operation_setting.NormalizePaymentGatewayMode(value)
	if err != nil {
		return false, err
	}
	requestID = strings.TrimSpace(requestID)
	if requestID == "" || len(requestID) > 128 {
		return false, ErrPaymentGatewayModeApplyReservationInvalid
	}

	paymentGatewayModeOptionWriteMu.Lock()
	defer paymentGatewayModeOptionWriteMu.Unlock()

	reserved := false
	now := common.GetTimestamp()
	reservationValue, err := common.Marshal(paymentGatewayModeApplyReservation{
		RequestID: requestID,
		ExpiresAt: now + paymentGatewayModeApplyReservationLeaseSeconds,
	})
	if err != nil {
		return false, err
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		reservation, err := lockPaymentGatewayModeApplyReservation(tx)
		if err != nil {
			return err
		}
		active, err := paymentGatewayModeApplyReservationActive(reservation.Value, now)
		if err != nil {
			return err
		}
		if active {
			return ErrPaymentGatewayModeApplyReservationActive
		}
		if err := clearExpiredPaymentGatewayModeApplyReservation(tx, reservation, now); err != nil {
			return err
		}

		var option Option
		err = lockForUpdate(tx).
			Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).
			First(&option).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if expectedValue != operation_setting.PaymentGatewayModeEpayLegacy {
				return nil
			}
			option = Option{
				Key:   operation_setting.PaymentGatewayModeOptionKey,
				Value: normalizedValue,
			}
			if err := tx.Create(&option).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			currentValue, err := operation_setting.NormalizePaymentGatewayMode(option.Value)
			if err != nil {
				return err
			}
			if currentValue != expectedValue {
				return nil
			}
			option.Value = normalizedValue
			if err := tx.Save(&option).Error; err != nil {
				return err
			}
		}

		reservation.Value = string(reservationValue)
		if err := tx.Save(reservation).Error; err != nil {
			return err
		}
		reserved = true
		return nil
	})
	if err != nil {
		return false, err
	}
	if !reserved {
		return false, nil
	}
	if err := updateOptionMap(operation_setting.PaymentGatewayModeOptionKey, normalizedValue); err != nil {
		return false, err
	}
	return true, nil
}

// ReleasePaymentGatewayModeApplyReservation clears only the lease owned by
// requestID.  An expired or missing lease is harmless, while another active
// request cannot be released by a stale completion callback.
func ReleasePaymentGatewayModeApplyReservation(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return ErrPaymentGatewayModeApplyReservationInvalid
	}
	paymentGatewayModeOptionWriteMu.Lock()
	defer paymentGatewayModeOptionWriteMu.Unlock()

	return DB.Transaction(func(tx *gorm.DB) error {
		var reservation Option
		err := lockForUpdate(tx).
			Where("key = ?", paymentGatewayModeApplyReservationOptionKey).
			First(&reservation).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		decoded, err := decodePaymentGatewayModeApplyReservation(reservation.Value)
		if err != nil {
			return err
		}
		if decoded.RequestID != requestID {
			return nil
		}
		reservation.Value = ""
		return tx.Save(&reservation).Error
	})
}

// PaymentGatewayModeApplyReservationOwnedBy checks that a caller still owns a
// live lease before it proceeds from the database write into audit/trigger.
func PaymentGatewayModeApplyReservationOwnedBy(requestID string) (bool, error) {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return false, ErrPaymentGatewayModeApplyReservationInvalid
	}
	var reservation Option
	err := DB.Where("key = ?", paymentGatewayModeApplyReservationOptionKey).First(&reservation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	decoded, err := decodePaymentGatewayModeApplyReservation(reservation.Value)
	if err != nil {
		return false, err
	}
	return decoded.RequestID == requestID && decoded.ExpiresAt > common.GetTimestamp(), nil
}

// PaymentGatewayModeApplyReservationActive reports whether another process is
// currently holding the durable apply lease.  It is used to make status and
// capability responses fail closed across process boundaries.
func PaymentGatewayModeApplyReservationActive() (bool, error) {
	var reservation Option
	err := DB.Where("key = ?", paymentGatewayModeApplyReservationOptionKey).First(&reservation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return paymentGatewayModeApplyReservationActive(reservation.Value, common.GetTimestamp())
}

func InitOptionMap() error {
	common.OptionMapRWMutex.Lock()
	common.OptionMap = make(map[string]string)

	// 添加原有的系统配置
	common.OptionMap["FileUploadPermission"] = strconv.Itoa(common.FileUploadPermission)
	common.OptionMap["FileDownloadPermission"] = strconv.Itoa(common.FileDownloadPermission)
	common.OptionMap["ImageUploadPermission"] = strconv.Itoa(common.ImageUploadPermission)
	common.OptionMap["ImageDownloadPermission"] = strconv.Itoa(common.ImageDownloadPermission)
	common.OptionMap["PasswordLoginEnabled"] = strconv.FormatBool(common.PasswordLoginEnabled)
	common.OptionMap["PasswordRegisterEnabled"] = strconv.FormatBool(common.PasswordRegisterEnabled)
	common.OptionMap["EmailVerificationEnabled"] = strconv.FormatBool(common.EmailVerificationEnabled)
	common.OptionMap["GitHubOAuthEnabled"] = strconv.FormatBool(common.GitHubOAuthEnabled)
	common.OptionMap["LinuxDOOAuthEnabled"] = strconv.FormatBool(common.LinuxDOOAuthEnabled)
	common.OptionMap["TelegramOAuthEnabled"] = strconv.FormatBool(common.TelegramOAuthEnabled)
	common.OptionMap["WeChatAuthEnabled"] = strconv.FormatBool(common.WeChatAuthEnabled)
	common.OptionMap["TurnstileCheckEnabled"] = strconv.FormatBool(common.TurnstileCheckEnabled)
	common.OptionMap["ClickCaptchaEnabled"] = strconv.FormatBool(common.ClickCaptchaEnabled)
	common.OptionMap["RegisterEnabled"] = strconv.FormatBool(common.RegisterEnabled)
	common.OptionMap["AgentAutoApproveEnabled"] = strconv.FormatBool(common.AgentAutoApproveEnabled)
	common.OptionMap["AutomaticDisableChannelEnabled"] = strconv.FormatBool(common.AutomaticDisableChannelEnabled)
	common.OptionMap["AutomaticEnableChannelEnabled"] = strconv.FormatBool(common.AutomaticEnableChannelEnabled)
	common.OptionMap["LogConsumeEnabled"] = strconv.FormatBool(common.LogConsumeEnabled)
	common.OptionMap["DisplayInCurrencyEnabled"] = strconv.FormatBool(common.DisplayInCurrencyEnabled)
	common.OptionMap["DisplayTokenStatEnabled"] = strconv.FormatBool(common.DisplayTokenStatEnabled)
	common.OptionMap["DrawingEnabled"] = strconv.FormatBool(common.DrawingEnabled)
	common.OptionMap["TaskEnabled"] = strconv.FormatBool(common.TaskEnabled)
	common.OptionMap["DataExportEnabled"] = strconv.FormatBool(common.DataExportEnabled)
	common.OptionMap["ChannelDisableThreshold"] = strconv.FormatFloat(common.ChannelDisableThreshold, 'f', -1, 64)
	common.OptionMap["EmailDomainRestrictionEnabled"] = strconv.FormatBool(common.EmailDomainRestrictionEnabled)
	common.OptionMap["EmailAliasRestrictionEnabled"] = strconv.FormatBool(common.EmailAliasRestrictionEnabled)
	common.OptionMap["EmailDomainWhitelist"] = strings.Join(common.EmailDomainWhitelist, ",")
	common.OptionMap["SMTPServer"] = ""
	common.OptionMap["SMTPFrom"] = ""
	common.OptionMap["SMTPPort"] = strconv.Itoa(common.SMTPPort)
	common.OptionMap["SMTPAccount"] = ""
	common.OptionMap["SMTPToken"] = ""
	common.OptionMap["SMTPSSLEnabled"] = strconv.FormatBool(common.SMTPSSLEnabled)
	common.OptionMap["SMTPStartTLSEnabled"] = strconv.FormatBool(common.SMTPStartTLSEnabled)
	common.OptionMap["SMTPInsecureSkipVerify"] = strconv.FormatBool(common.SMTPInsecureSkipVerify)
	common.OptionMap["SMTPForceAuthLogin"] = strconv.FormatBool(common.SMTPForceAuthLogin)
	common.OptionMap["Notice"] = ""
	common.OptionMap["About"] = ""
	common.OptionMap["HomePageContent"] = ""
	common.OptionMap["HomePageConfig"] = ""
	common.OptionMap["LoginPageConfig"] = ""
	common.OptionMap["PromoBannerConfig"] = ""
	common.OptionMap["CommunityLinks"] = ""
	common.OptionMap["Footer"] = common.Footer
	common.OptionMap["SystemName"] = common.SystemName
	common.OptionMap["Logo"] = common.Logo
	common.OptionMap["ui_setting.appearance"] = ui_setting.AppearanceJSONString()
	common.OptionMap["ui_setting.apimart_home"] = ui_setting.ApimartHomeJSONString()
	common.OptionMap["ServerAddress"] = ""
	common.OptionMap["WorkerUrl"] = system_setting.WorkerUrl
	common.OptionMap["WorkerValidKey"] = system_setting.WorkerValidKey
	common.OptionMap["WorkerAllowHttpImageRequestEnabled"] = strconv.FormatBool(system_setting.WorkerAllowHttpImageRequestEnabled)
	common.OptionMap["PayAddress"] = ""
	common.OptionMap["CustomCallbackAddress"] = ""
	common.OptionMap["EpayId"] = ""
	common.OptionMap["EpayKey"] = ""
	common.OptionMap[operation_setting.PaymentGatewayModeOptionKey] = operation_setting.PaymentGatewayModeEpayLegacy
	common.OptionMap["Price"] = strconv.FormatFloat(operation_setting.Price, 'f', -1, 64)
	common.OptionMap["USDExchangeRate"] = strconv.FormatFloat(operation_setting.USDExchangeRate, 'f', -1, 64)
	common.OptionMap["MinTopUp"] = strconv.Itoa(operation_setting.MinTopUp)
	common.OptionMap["StripeMinTopUp"] = strconv.Itoa(setting.StripeMinTopUp)
	common.OptionMap["StripeApiSecret"] = setting.StripeApiSecret
	common.OptionMap["StripeWebhookSecret"] = setting.StripeWebhookSecret
	common.OptionMap["StripePriceId"] = setting.StripePriceId
	common.OptionMap["StripeUnitPrice"] = strconv.FormatFloat(setting.StripeUnitPrice, 'f', -1, 64)
	common.OptionMap["StripePromotionCodesEnabled"] = strconv.FormatBool(setting.StripePromotionCodesEnabled)
	common.OptionMap["CreemApiKey"] = setting.CreemApiKey
	common.OptionMap["CreemProducts"] = setting.CreemProducts
	common.OptionMap["CreemTestMode"] = strconv.FormatBool(setting.CreemTestMode)
	common.OptionMap["CreemWebhookSecret"] = setting.CreemWebhookSecret
	common.OptionMap["WechatPayEnabled"] = strconv.FormatBool(setting.WechatPayEnabled)
	common.OptionMap["WechatPayAppId"] = setting.WechatPayAppId
	common.OptionMap["WechatPayAppSecret"] = setting.WechatPayAppSecret
	common.OptionMap["WechatPayMchId"] = setting.WechatPayMchId
	common.OptionMap["WechatPayApiV3Key"] = setting.WechatPayApiV3Key
	common.OptionMap["WechatPayCert"] = setting.WechatPayCert
	common.OptionMap["WechatPayCertSerialNo"] = setting.WechatPayCertSerialNo
	common.OptionMap["WechatPayPrivateKey"] = setting.WechatPayPrivateKey
	common.OptionMap["WechatPayNotifyUrl"] = setting.WechatPayNotifyUrl
	common.OptionMap["WechatPayNative"] = strconv.FormatBool(setting.WechatPayNative)
	common.OptionMap["WechatPayH5"] = strconv.FormatBool(setting.WechatPayH5)
	common.OptionMap["WechatPayJSAPI"] = strconv.FormatBool(setting.WechatPayJSAPI)
	common.OptionMap["WechatPayMinTopUp"] = strconv.Itoa(setting.WechatPayMinTopUp)
	common.OptionMap["AlipayEnabled"] = strconv.FormatBool(setting.AlipayEnabled)
	common.OptionMap["AlipayAppId"] = setting.AlipayAppId
	common.OptionMap["AlipayPrivateKey"] = setting.AlipayPrivateKey
	common.OptionMap["AlipayPublicKey"] = setting.AlipayPublicKey
	common.OptionMap["AlipayProduction"] = strconv.FormatBool(setting.AlipayProduction)
	common.OptionMap["AlipayMinTopUp"] = strconv.Itoa(setting.AlipayMinTopUp)
	common.OptionMap["WaffoEnabled"] = strconv.FormatBool(setting.WaffoEnabled)
	common.OptionMap["WaffoApiKey"] = setting.WaffoApiKey
	common.OptionMap["WaffoPrivateKey"] = setting.WaffoPrivateKey
	common.OptionMap["WaffoPublicCert"] = setting.WaffoPublicCert
	common.OptionMap["WaffoSandboxPublicCert"] = setting.WaffoSandboxPublicCert
	common.OptionMap["WaffoSandboxApiKey"] = setting.WaffoSandboxApiKey
	common.OptionMap["WaffoSandboxPrivateKey"] = setting.WaffoSandboxPrivateKey
	common.OptionMap["WaffoSandbox"] = strconv.FormatBool(setting.WaffoSandbox)
	common.OptionMap["WaffoMerchantId"] = setting.WaffoMerchantId
	common.OptionMap["WaffoNotifyUrl"] = setting.WaffoNotifyUrl
	common.OptionMap["WaffoReturnUrl"] = setting.WaffoReturnUrl
	common.OptionMap["WaffoSubscriptionReturnUrl"] = setting.WaffoSubscriptionReturnUrl
	common.OptionMap["WaffoCurrency"] = setting.WaffoCurrency
	common.OptionMap["WaffoUnitPrice"] = strconv.FormatFloat(setting.WaffoUnitPrice, 'f', -1, 64)
	common.OptionMap["WaffoMinTopUp"] = strconv.Itoa(setting.WaffoMinTopUp)
	common.OptionMap["WaffoPayMethods"] = setting.WaffoPayMethods2JsonString()
	common.OptionMap["WaffoPancakeMerchantID"] = setting.WaffoPancakeMerchantID
	common.OptionMap["WaffoPancakePrivateKey"] = setting.WaffoPancakePrivateKey
	common.OptionMap["WaffoPancakeReturnURL"] = setting.WaffoPancakeReturnURL
	common.OptionMap["WaffoPancakeUnitPrice"] = strconv.FormatFloat(setting.WaffoPancakeUnitPrice, 'f', -1, 64)
	common.OptionMap["WaffoPancakeMinTopUp"] = strconv.Itoa(setting.WaffoPancakeMinTopUp)
	common.OptionMap["WaffoPancakeStoreID"] = setting.WaffoPancakeStoreID
	common.OptionMap["WaffoPancakeProductID"] = setting.WaffoPancakeProductID
	common.OptionMap["TopupGroupRatio"] = common.TopupGroupRatio2JSONString()
	common.OptionMap["Chats"] = setting.Chats2JsonString()
	common.OptionMap["AutoGroups"] = setting.AutoGroups2JsonString()
	common.OptionMap["AutoGroupRoutes"] = setting.AutoGroupRoutes2JsonString()
	common.OptionMap["DefaultUseAutoGroup"] = strconv.FormatBool(setting.DefaultUseAutoGroup)
	common.OptionMap["MaxTokenAutoGroups"] = strconv.Itoa(setting.GetMaxTokenAutoGroups())
	common.OptionMap["PayMethods"] = operation_setting.PayMethods2JsonString()
	common.OptionMap["GitHubClientId"] = ""
	common.OptionMap["GitHubClientSecret"] = ""
	common.OptionMap["TelegramBotToken"] = ""
	common.OptionMap["TelegramBotName"] = ""
	common.OptionMap["WeChatServerAddress"] = ""
	common.OptionMap["WeChatServerToken"] = ""
	common.OptionMap["WeChatAccountQRCodeImageURL"] = ""
	common.OptionMap["WeChatMpToken"] = ""
	common.OptionMap["WeChatMpName"] = ""
	common.OptionMap["WeChatMpAppId"] = ""
	common.OptionMap["WeChatMpAppSecret"] = ""
	common.OptionMap["TurnstileSiteKey"] = ""
	common.OptionMap["TurnstileSecretKey"] = ""
	common.OptionMap["QuotaForNewUser"] = strconv.Itoa(common.QuotaForNewUser)
	common.OptionMap["QuotaForInviter"] = strconv.Itoa(common.QuotaForInviter)
	common.OptionMap["QuotaForInvitee"] = strconv.Itoa(common.QuotaForInvitee)
	common.OptionMap["RebateEnabled"] = strconv.FormatBool(common.RebateEnabled)
	common.OptionMap["RebateRatio"] = strconv.FormatFloat(common.RebateRatio, 'f', -1, 64)
	common.OptionMap["GroupBuyEnabled"] = strconv.FormatBool(common.GroupBuyEnabled)
	common.OptionMap["QuotaRemindThreshold"] = strconv.Itoa(common.QuotaRemindThreshold)
	common.OptionMap["PreConsumedQuota"] = strconv.Itoa(common.PreConsumedQuota)
	common.OptionMap["ModelRequestRateLimitCount"] = strconv.Itoa(setting.ModelRequestRateLimitCount)
	common.OptionMap["ModelRequestRateLimitDurationMinutes"] = strconv.Itoa(setting.ModelRequestRateLimitDurationMinutes)
	common.OptionMap["ModelRequestRateLimitSuccessCount"] = strconv.Itoa(setting.ModelRequestRateLimitSuccessCount)
	common.OptionMap["ModelRequestRateLimitGroup"] = setting.ModelRequestRateLimitGroup2JSONString()
	common.OptionMap["ModelRatio"] = ratio_setting.ModelRatio2JSONString()
	common.OptionMap["ModelPrice"] = ratio_setting.ModelPrice2JSONString()
	common.OptionMap["CacheRatio"] = ratio_setting.CacheRatio2JSONString()
	common.OptionMap["CreateCacheRatio"] = ratio_setting.CreateCacheRatio2JSONString()
	common.OptionMap["GroupRatio"] = ratio_setting.GroupRatio2JSONString()
	common.OptionMap["GroupGroupRatio"] = ratio_setting.GroupGroupRatio2JSONString()
	common.OptionMap["UserUsableGroups"] = setting.UserUsableGroups2JSONString()
	common.OptionMap["CompletionRatio"] = ratio_setting.CompletionRatio2JSONString()
	common.OptionMap["ImageRatio"] = ratio_setting.ImageRatio2JSONString()
	common.OptionMap["AudioRatio"] = ratio_setting.AudioRatio2JSONString()
	common.OptionMap["AudioCompletionRatio"] = ratio_setting.AudioCompletionRatio2JSONString()
	common.OptionMap["VideoPriceTiers"] = ratio_setting.VideoPrice2JSONString()
	common.OptionMap["ImagePriceTiers"] = ratio_setting.ImagePrice2JSONString()
	common.OptionMap["TopUpLink"] = common.TopUpLink
	//common.OptionMap["ChatLink"] = common.ChatLink
	//common.OptionMap["ChatLink2"] = common.ChatLink2
	common.OptionMap["QuotaPerUnit"] = strconv.FormatFloat(common.QuotaPerUnit, 'f', -1, 64)
	common.OptionMap["RetryTimes"] = strconv.Itoa(common.RetryTimes)
	common.OptionMap["DataExportInterval"] = strconv.Itoa(common.DataExportInterval)
	common.OptionMap["DataExportDefaultTime"] = common.DataExportDefaultTime
	common.OptionMap["DefaultCollapseSidebar"] = strconv.FormatBool(common.DefaultCollapseSidebar)
	common.OptionMap["MjNotifyEnabled"] = strconv.FormatBool(setting.MjNotifyEnabled)
	common.OptionMap["MjAccountFilterEnabled"] = strconv.FormatBool(setting.MjAccountFilterEnabled)
	common.OptionMap["MjModeClearEnabled"] = strconv.FormatBool(setting.MjModeClearEnabled)
	common.OptionMap["MjForwardUrlEnabled"] = strconv.FormatBool(setting.MjForwardUrlEnabled)
	common.OptionMap["MjActionCheckSuccessEnabled"] = strconv.FormatBool(setting.MjActionCheckSuccessEnabled)
	common.OptionMap["CheckSensitiveEnabled"] = strconv.FormatBool(setting.CheckSensitiveEnabled)
	common.OptionMap["DemoSiteEnabled"] = strconv.FormatBool(operation_setting.DemoSiteEnabled)
	common.OptionMap["SelfUseModeEnabled"] = strconv.FormatBool(operation_setting.SelfUseModeEnabled)
	common.OptionMap["ModelRequestRateLimitEnabled"] = strconv.FormatBool(setting.ModelRequestRateLimitEnabled)
	common.OptionMap["CheckSensitiveOnPromptEnabled"] = strconv.FormatBool(setting.CheckSensitiveOnPromptEnabled)
	common.OptionMap["StopOnSensitiveEnabled"] = strconv.FormatBool(setting.StopOnSensitiveEnabled)
	common.OptionMap["SensitiveWords"] = setting.SensitiveWordsToString()
	common.OptionMap["StreamCacheQueueLength"] = strconv.Itoa(setting.StreamCacheQueueLength)
	common.OptionMap["AutomaticDisableKeywords"] = operation_setting.AutomaticDisableKeywordsToString()
	common.OptionMap["AutomaticDisableStatusCodes"] = operation_setting.AutomaticDisableStatusCodesToString()
	common.OptionMap["AutomaticRetryStatusCodes"] = operation_setting.AutomaticRetryStatusCodesToString()
	common.OptionMap["ExposeRatioEnabled"] = strconv.FormatBool(ratio_setting.IsExposeRatioEnabled())

	// 自动添加所有注册的模型配置
	modelConfigs := config.GlobalConfig.ExportAllConfigs()
	for k, v := range modelConfigs {
		common.OptionMap[k] = v
	}

	common.OptionMapRWMutex.Unlock()
	if err := loadOptionsFromDatabase(); err != nil {
		return err
	}

	// The display configuration is loaded from Options above. Only now can an
	// unset reminder configuration safely default to one *current* display
	// unit; creating this snapshot earlier would permanently use the package
	// default USD on an existing CNY/CUSTOM/TOKENS site.
	common.OptionMapRWMutex.Lock()
	if _, ok := common.OptionMap["quota_reminder.enabled"]; !ok {
		common.OptionMap["quota_reminder.enabled"] = strconv.FormatBool(common.QuotaRemindEnabled)
	}
	if _, ok := common.OptionMap["quota_reminder.threshold"]; !ok {
		common.OptionMap["quota_reminder.threshold"] = "1"
	}
	if _, ok := common.OptionMap["quota_reminder.threshold_unit"]; !ok {
		common.OptionMap["quota_reminder.threshold_unit"] = operation_setting.GetQuotaDisplayType()
	}
	if _, ok := common.OptionMap["quota_reminder.threshold_quota_per_unit"]; !ok {
		common.OptionMap["quota_reminder.threshold_quota_per_unit"] = strconv.FormatFloat(common.QuotaPerUnit, 'f', -1, 64)
	}
	if _, ok := common.OptionMap["quota_reminder.threshold_usd_exchange_rate"]; !ok {
		common.OptionMap["quota_reminder.threshold_usd_exchange_rate"] = strconv.FormatFloat(operation_setting.USDExchangeRate, 'f', -1, 64)
	}
	if _, ok := common.OptionMap["quota_reminder.threshold_custom_exchange_rate"]; !ok {
		common.OptionMap["quota_reminder.threshold_custom_exchange_rate"] = strconv.FormatFloat(operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate, 'f', -1, 64)
	}
	if _, ok := common.OptionMap["quota_reminder.threshold_custom_currency_symbol"]; !ok {
		common.OptionMap["quota_reminder.threshold_custom_currency_symbol"] = operation_setting.GetGeneralSetting().CustomCurrencySymbol
	}
	if _, ok := common.OptionMap["quota_reminder.template"]; !ok {
		common.OptionMap["quota_reminder.template"] = "default"
	}
	if _, ok := common.OptionMap["quota_reminder.custom_template"]; !ok {
		common.OptionMap["quota_reminder.custom_template"] = ""
	}
	common.OptionMapRWMutex.Unlock()
	return nil
}

func loadOptionsFromDatabase() error {
	options, err := AllOption()
	if err != nil {
		return err
	}
	for _, option := range options {
		err := updateOptionMap(option.Key, option.Value)
		if err != nil {
			return fmt.Errorf("failed to load option %q: %w", option.Key, err)
		}
	}
	return nil
}

func SyncOptions(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		common.SysLog("syncing options from database")
		if err := loadOptionsFromDatabase(); err != nil {
			common.SysLog("failed to sync options from database: " + err.Error())
		}
	}
}

func validateOptionValue(key string, value string) error {
	if key == operation_setting.EffectivePaymentGatewayModeOptionKey {
		return fmt.Errorf("%s is read-only", operation_setting.EffectivePaymentGatewayModeOptionKey)
	}
	if key == operation_setting.PaymentGatewayModeOptionKey {
		_, err := operation_setting.NormalizePaymentGatewayMode(value)
		return err
	}
	if key == operation_setting.ChannelRoutingPoolSettingConfigName+".pools" {
		return validateChannelRoutingPoolOption(value)
	}
	if key == operation_setting.ToolPriceOptionKey {
		return operation_setting.ValidateToolPricesJSON(value)
	}
	if key == operation_setting.ChannelTestConcurrencyOptionKey {
		return operation_setting.ValidateChannelTestConcurrency(value)
	}
	if key == "MaxTokenAutoGroups" {
		return setting.ValidateMaxTokenAutoGroups(value)
	}
	return nil
}

func normalizeOptionValue(key string, value string) (string, error) {
	if isPaymentGatewayModeApplyReservationOption(key) {
		return "", ErrPaymentGatewayModeApplyReservationInvalid
	}
	if key == operation_setting.PaymentGatewayModeOptionKey {
		return operation_setting.NormalizePaymentGatewayMode(value)
	}
	if err := validateOptionValue(key, value); err != nil {
		return "", err
	}
	return value, nil
}

func UpdateOption(key string, value string) error {
	normalizedValue, err := normalizeOptionValue(key, value)
	if err != nil {
		return err
	}
	value = normalizedValue
	var quotaReminderSnapshot map[string]string
	if key == "quota_reminder.threshold" {
		quotaReminderSnapshot = map[string]string{
			"quota_reminder.threshold_unit":                   operation_setting.GetQuotaDisplayType(),
			"quota_reminder.threshold_quota_per_unit":         strconv.FormatFloat(common.QuotaPerUnit, 'f', -1, 64),
			"quota_reminder.threshold_usd_exchange_rate":      strconv.FormatFloat(operation_setting.USDExchangeRate, 'f', -1, 64),
			"quota_reminder.threshold_custom_exchange_rate":   strconv.FormatFloat(operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate, 'f', -1, 64),
			"quota_reminder.threshold_custom_currency_symbol": operation_setting.GetGeneralSetting().CustomCurrencySymbol,
		}
	}
	if key == operation_setting.PaymentGatewayModeOptionKey {
		paymentGatewayModeOptionWriteMu.Lock()
		defer paymentGatewayModeOptionWriteMu.Unlock()
	}
	// FirstOrCreate followed by Save must be one transaction.  Besides making
	// the two writes atomic for a newly-created option, this keeps the
	// in-memory OptionMap untouched when either database operation fails.
	if err := DB.Transaction(func(tx *gorm.DB) error {
		if key == operation_setting.PaymentGatewayModeOptionKey {
			reservation, err := lockPaymentGatewayModeApplyReservation(tx)
			if err != nil {
				return err
			}
			active, err := paymentGatewayModeApplyReservationActive(reservation.Value, common.GetTimestamp())
			if err != nil {
				return err
			}
			if active {
				return ErrPaymentGatewayModeApplyReservationActive
			}
			if err := clearExpiredPaymentGatewayModeApplyReservation(tx, reservation, common.GetTimestamp()); err != nil {
				return err
			}
		}
		option := Option{
			Key: key,
		}
		// https://gorm.io/docs/update.html#Save-All-Fields
		if err := tx.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
			return err
		}
		option.Value = value
		// Save is a combination function.
		// If save value does not contain primary key, it will execute Create,
		// otherwise it will execute Update (with all fields).
		if err := tx.Save(&option).Error; err != nil {
			return err
		}
		if quotaReminderSnapshot != nil {
			// Capture the unit and exchange-rate semantics atomically with the
			// displayed threshold so later site-currency changes cannot reinterpret it.
			for snapshotKey, snapshotValue := range quotaReminderSnapshot {
				snapshot := Option{Key: snapshotKey}
				if err := tx.FirstOrCreate(&snapshot, Option{Key: snapshotKey}).Error; err != nil {
					return err
				}
				snapshot.Value = snapshotValue
				if err := tx.Save(&snapshot).Error; err != nil {
					return err
				}
			}
		}
		if key == "quota_reminder.enabled" || key == "QuotaRemindEnabled" || key == "QuotaReminderEnabled" {
			enabled, _ := strconv.ParseBool(value)
			if !enabled {
				if err := suppressPendingQuotaReminders(tx); err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		return err
	}
	// Update OptionMap
	if err := updateOptionMap(key, value); err != nil {
		return err
	}
	if quotaReminderSnapshot != nil {
		for snapshotKey, snapshotValue := range quotaReminderSnapshot {
			if err := updateOptionMap(snapshotKey, snapshotValue); err != nil {
				return err
			}
		}
	}
	return nil
}

// UpdateQuotaReminderOptions stores a complete reminder configuration and its
// display conversion snapshot as a single transaction. The dedicated update
// path prevents a task from seeing a threshold paired with another request's
// template or currency semantics.
func UpdateQuotaReminderOptions(enabled bool, threshold string, templateID string, customTemplate string) error {
	threshold = strings.TrimSpace(threshold)
	displayedThreshold, err := strconv.ParseFloat(threshold, 64)
	if err != nil || math.IsNaN(displayedThreshold) || math.IsInf(displayedThreshold, 0) || displayedThreshold <= 0 {
		return fmt.Errorf("quota reminder threshold must be finite and greater than zero")
	}
	templateID = strings.TrimSpace(templateID)
	switch templateID {
	case "default", "concise", "custom":
	default:
		return fmt.Errorf("unsupported quota reminder template %q", templateID)
	}

	generalSetting := operation_setting.GetGeneralSetting()
	displayUnit := operation_setting.GetQuotaDisplayType()
	quotaPerUnit := common.QuotaPerUnit
	usdExchangeRate := operation_setting.USDExchangeRate
	customExchangeRate := generalSetting.CustomCurrencyExchangeRate
	if _, err := common.NormalizeDisplayedQuotaThreshold(displayedThreshold, displayUnit, quotaPerUnit, usdExchangeRate, customExchangeRate); err != nil {
		return fmt.Errorf("invalid quota reminder threshold: %w", err)
	}
	values := map[string]string{
		"quota_reminder.enabled":                          strconv.FormatBool(enabled),
		"quota_reminder.threshold":                        threshold,
		"quota_reminder.template":                         templateID,
		"quota_reminder.custom_template":                  customTemplate,
		"quota_reminder.threshold_unit":                   displayUnit,
		"quota_reminder.threshold_quota_per_unit":         strconv.FormatFloat(quotaPerUnit, 'f', -1, 64),
		"quota_reminder.threshold_usd_exchange_rate":      strconv.FormatFloat(usdExchangeRate, 'f', -1, 64),
		"quota_reminder.threshold_custom_exchange_rate":   strconv.FormatFloat(customExchangeRate, 'f', -1, 64),
		"quota_reminder.threshold_custom_currency_symbol": generalSetting.CustomCurrencySymbol,
	}

	if err := DB.Transaction(func(tx *gorm.DB) error {
		for key, value := range values {
			option := Option{Key: key}
			if err := tx.FirstOrCreate(&option, Option{Key: key}).Error; err != nil {
				return err
			}
			option.Value = value
			if err := tx.Save(&option).Error; err != nil {
				return err
			}
		}
		if !enabled {
			return suppressPendingQuotaReminders(tx)
		}
		return nil
	}); err != nil {
		return err
	}

	// Publish the whole configuration together after commit, so readers cannot
	// combine a newly persisted threshold with stale snapshot/template fields.
	common.OptionMapRWMutex.Lock()
	for key, value := range values {
		common.OptionMap[key] = value
	}
	common.QuotaRemindEnabled = enabled
	common.OptionMapRWMutex.Unlock()
	return nil
}

// GetPaymentGatewayModeOption reads the persisted desired mode.  Older
// installations do not have an Option row yet, so a missing row is the
// documented legacy default.  Unlike OptionMap, this is intentionally a
// database read so save-and-apply can perform an optimistic check against the
// latest value rather than a possibly stale in-memory snapshot.
func GetPaymentGatewayModeOption() (string, error) {
	var option Option
	err := DB.Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return operation_setting.PaymentGatewayModeEpayLegacy, nil
	}
	if err != nil {
		return "", err
	}
	return operation_setting.NormalizePaymentGatewayMode(option.Value)
}

// UpdatePaymentGatewayModeOptionIf performs a compare-and-swap on the
// persisted desired payment gateway mode.  It returns false when the current
// mode no longer matches expectedValue, allowing save-and-apply to fail with a
// state conflict instead of overwriting a newer generic Root update.
func UpdatePaymentGatewayModeOptionIf(expectedValue, value string) (bool, error) {
	expectedValue, err := operation_setting.NormalizePaymentGatewayMode(expectedValue)
	if err != nil {
		return false, err
	}
	normalizedValue, err := operation_setting.NormalizePaymentGatewayMode(value)
	if err != nil {
		return false, err
	}

	paymentGatewayModeOptionWriteMu.Lock()
	defer paymentGatewayModeOptionWriteMu.Unlock()

	updated := false
	err = DB.Transaction(func(tx *gorm.DB) error {
		reservation, err := lockPaymentGatewayModeApplyReservation(tx)
		if err != nil {
			return err
		}
		active, err := paymentGatewayModeApplyReservationActive(reservation.Value, common.GetTimestamp())
		if err != nil {
			return err
		}
		if active {
			return ErrPaymentGatewayModeApplyReservationActive
		}
		if err := clearExpiredPaymentGatewayModeApplyReservation(tx, reservation, common.GetTimestamp()); err != nil {
			return err
		}
		var option Option
		err = lockForUpdate(tx).
			Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).
			First(&option).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if expectedValue != operation_setting.PaymentGatewayModeEpayLegacy {
				return nil
			}
			if err := tx.Create(&Option{
				Key:   operation_setting.PaymentGatewayModeOptionKey,
				Value: normalizedValue,
			}).Error; err != nil {
				return err
			}
			updated = true
			return nil
		}
		if err != nil {
			return err
		}

		currentValue, err := operation_setting.NormalizePaymentGatewayMode(option.Value)
		if err != nil {
			return err
		}
		if currentValue != expectedValue {
			return nil
		}

		result := tx.Model(&Option{}).
			Where("key = ? AND value = ?", operation_setting.PaymentGatewayModeOptionKey, option.Value).
			Update("value", normalizedValue)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			updated = true
			return nil
		}

		// MySQL may report zero affected rows for a no-op update.  Re-read the
		// row before treating that result as a lost compare-and-swap.
		var latest Option
		if err := lockForUpdate(tx).
			Where("key = ?", operation_setting.PaymentGatewayModeOptionKey).
			First(&latest).Error; err != nil {
			return err
		}
		latestValue, err := operation_setting.NormalizePaymentGatewayMode(latest.Value)
		if err != nil {
			return err
		}
		updated = latestValue == expectedValue
		return nil
	})
	if err != nil || !updated {
		return updated, err
	}
	if err := updateOptionMap(operation_setting.PaymentGatewayModeOptionKey, normalizedValue); err != nil {
		return false, err
	}
	return true, nil
}

// UpdateOptionsBulk persists multiple key/value pairs in a single database
// transaction, then dispatches them through updateOptionMap in one pass. If
// any DB write fails the whole transaction rolls back and no in-memory state
// is touched — safe for callers that must commit a set of related options
// atomically (e.g. payment gateway binding).
func UpdateOptionsBulk(values map[string]string) error {
	if len(values) == 0 {
		return nil
	}
	normalizedValues := make(map[string]string, len(values))
	for key, value := range values {
		normalizedValue, err := normalizeOptionValue(key, value)
		if err != nil {
			return err
		}
		normalizedValues[key] = normalizedValue
	}
	if _, ok := normalizedValues[operation_setting.PaymentGatewayModeOptionKey]; ok {
		paymentGatewayModeOptionWriteMu.Lock()
		defer paymentGatewayModeOptionWriteMu.Unlock()
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		if _, ok := normalizedValues[operation_setting.PaymentGatewayModeOptionKey]; ok {
			reservation, err := lockPaymentGatewayModeApplyReservation(tx)
			if err != nil {
				return err
			}
			active, err := paymentGatewayModeApplyReservationActive(reservation.Value, common.GetTimestamp())
			if err != nil {
				return err
			}
			if active {
				return ErrPaymentGatewayModeApplyReservationActive
			}
			if err := clearExpiredPaymentGatewayModeApplyReservation(tx, reservation, common.GetTimestamp()); err != nil {
				return err
			}
		}
		for k, v := range normalizedValues {
			option := Option{Key: k}
			if err := tx.FirstOrCreate(&option, Option{Key: k}).Error; err != nil {
				return err
			}
			option.Value = v
			if err := tx.Save(&option).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	for k, v := range normalizedValues {
		if err := updateOptionMap(k, v); err != nil {
			return err
		}
	}
	return nil
}

func validateChannelRoutingPoolOption(value string) error {
	if strings.TrimSpace(value) == "null" {
		return fmt.Errorf("channel failover pools must be a JSON array")
	}
	var pools []operation_setting.ChannelRoutingPool
	if err := common.Unmarshal([]byte(value), &pools); err != nil {
		return fmt.Errorf("channel failover pools must be a JSON array: %w", err)
	}
	if pools == nil {
		return fmt.Errorf("channel failover pools must be a JSON array")
	}
	setting := operation_setting.ChannelRoutingPoolSetting{Pools: pools}
	if err := operation_setting.ValidateChannelRoutingPoolSetting(setting); err != nil {
		return err
	}
	return validateChannelRoutingPoolMembers(setting)
}

func validateChannelRoutingPoolMembers(setting operation_setting.ChannelRoutingPoolSetting) error {
	channelIDs := make([]int, 0)
	for _, pool := range setting.Pools {
		channelIDs = append(channelIDs, pool.ChannelIDs...)
	}
	if len(channelIDs) == 0 {
		return nil
	}
	var channels []Channel
	if err := DB.Where("id IN ?", channelIDs).Find(&channels).Error; err != nil {
		return fmt.Errorf("load channel failover pool members: %w", err)
	}
	channelsByID := make(map[int]*Channel, len(channels))
	for i := range channels {
		channelsByID[channels[i].Id] = &channels[i]
	}
	for _, pool := range setting.Pools {
		for _, channelID := range pool.ChannelIDs {
			channel := channelsByID[channelID]
			if channel == nil {
				return fmt.Errorf("channel failover pool %s references missing channel %d", pool.ID, channelID)
			}
			if channel.Type != pool.ChannelType {
				return fmt.Errorf("channel failover pool %s channel %d type must equal %d", pool.ID, channelID, pool.ChannelType)
			}
			belongsToGroup := false
			for _, group := range channel.GetGroups() {
				if group == pool.Group {
					belongsToGroup = true
					break
				}
			}
			if !belongsToGroup {
				return fmt.Errorf("channel failover pool %s channel %d must belong to group %s", pool.ID, channelID, pool.Group)
			}
		}
	}
	return nil
}

func updateOptionMap(key string, value string) (err error) {
	if isPaymentGatewayModeApplyReservationOption(key) {
		return nil
	}
	if key == operation_setting.EffectivePaymentGatewayModeOptionKey {
		return fmt.Errorf("%s is read-only", operation_setting.EffectivePaymentGatewayModeOptionKey)
	}
	if key == operation_setting.PaymentGatewayModeOptionKey {
		value, err = operation_setting.NormalizePaymentGatewayMode(value)
		if err != nil {
			return err
		}
	}
	if key == retiredThemeOptionKey {
		common.OptionMapRWMutex.Lock()
		delete(common.OptionMap, key)
		common.OptionMapRWMutex.Unlock()
		return nil
	}
	common.OptionMapRWMutex.Lock()
	defer common.OptionMapRWMutex.Unlock()
	common.OptionMap[key] = value

	// 检查是否是模型配置 - 使用更规范的方式处理
	if handleConfigUpdate(key, value) {
		return nil // 已由配置系统处理
	}

	// 处理传统配置项...
	if strings.HasSuffix(key, "Permission") {
		intValue, _ := strconv.Atoi(value)
		switch key {
		case "FileUploadPermission":
			common.FileUploadPermission = intValue
		case "FileDownloadPermission":
			common.FileDownloadPermission = intValue
		case "ImageUploadPermission":
			common.ImageUploadPermission = intValue
		case "ImageDownloadPermission":
			common.ImageDownloadPermission = intValue
		}
	}
	if strings.HasSuffix(key, "Enabled") || key == "DefaultCollapseSidebar" || key == "DefaultUseAutoGroup" || key == "SMTPForceAuthLogin" || key == "SMTPInsecureSkipVerify" {
		boolValue := value == "true"
		switch key {
		case "PasswordRegisterEnabled":
			common.PasswordRegisterEnabled = boolValue
		case "PasswordLoginEnabled":
			common.PasswordLoginEnabled = boolValue
		case "EmailVerificationEnabled":
			common.EmailVerificationEnabled = boolValue
		case "GitHubOAuthEnabled":
			common.GitHubOAuthEnabled = boolValue
		case "LinuxDOOAuthEnabled":
			common.LinuxDOOAuthEnabled = boolValue
		case "WeChatAuthEnabled":
			common.WeChatAuthEnabled = boolValue
		case "TelegramOAuthEnabled":
			common.TelegramOAuthEnabled = boolValue
		case "TurnstileCheckEnabled":
			common.TurnstileCheckEnabled = boolValue
		case "ClickCaptchaEnabled":
			common.ClickCaptchaEnabled = boolValue
		case "RegisterEnabled":
			common.RegisterEnabled = boolValue
		case "AgentAutoApproveEnabled":
			common.AgentAutoApproveEnabled = boolValue
		case "EmailDomainRestrictionEnabled":
			common.EmailDomainRestrictionEnabled = boolValue
		case "EmailAliasRestrictionEnabled":
			common.EmailAliasRestrictionEnabled = boolValue
		case "AutomaticDisableChannelEnabled":
			common.AutomaticDisableChannelEnabled = boolValue
		case "AutomaticEnableChannelEnabled":
			common.AutomaticEnableChannelEnabled = boolValue
		case "LogConsumeEnabled":
			common.LogConsumeEnabled = boolValue
		case "DisplayInCurrencyEnabled":
			// 兼容旧字段：同步到新配置 general_setting.quota_display_type（运行时生效）
			// true -> USD, false -> TOKENS
			newVal := "USD"
			if !boolValue {
				newVal = "TOKENS"
			}
			if cfg := config.GlobalConfig.Get("general_setting"); cfg != nil {
				_ = config.UpdateConfigFromMap(cfg, map[string]string{"quota_display_type": newVal})
			}
		case "DisplayTokenStatEnabled":
			common.DisplayTokenStatEnabled = boolValue
		case "DrawingEnabled":
			common.DrawingEnabled = boolValue
		case "TaskEnabled":
			common.TaskEnabled = boolValue
		case "DataExportEnabled":
			common.DataExportEnabled = boolValue
		case "RebateEnabled":
			common.RebateEnabled = boolValue
		case "GroupBuyEnabled":
			common.GroupBuyEnabled = boolValue
		case "DefaultCollapseSidebar":
			common.DefaultCollapseSidebar = boolValue
		case "MjNotifyEnabled":
			setting.MjNotifyEnabled = boolValue
		case "MjAccountFilterEnabled":
			setting.MjAccountFilterEnabled = boolValue
		case "MjModeClearEnabled":
			setting.MjModeClearEnabled = boolValue
		case "MjForwardUrlEnabled":
			setting.MjForwardUrlEnabled = boolValue
		case "MjActionCheckSuccessEnabled":
			setting.MjActionCheckSuccessEnabled = boolValue
		case "CheckSensitiveEnabled":
			setting.CheckSensitiveEnabled = boolValue
		case "DemoSiteEnabled":
			operation_setting.DemoSiteEnabled = boolValue
		case "SelfUseModeEnabled":
			operation_setting.SelfUseModeEnabled = boolValue
		case "CheckSensitiveOnPromptEnabled":
			setting.CheckSensitiveOnPromptEnabled = boolValue
		case "ModelRequestRateLimitEnabled":
			setting.ModelRequestRateLimitEnabled = boolValue
		case "StopOnSensitiveEnabled":
			setting.StopOnSensitiveEnabled = boolValue
		case "SMTPSSLEnabled":
			common.SMTPSSLEnabled = boolValue
		case "SMTPStartTLSEnabled":
			common.SMTPStartTLSEnabled = boolValue
		case "SMTPInsecureSkipVerify":
			common.SMTPInsecureSkipVerify = boolValue
		case "SMTPForceAuthLogin":
			common.SMTPForceAuthLogin = boolValue
		case "WorkerAllowHttpImageRequestEnabled":
			system_setting.WorkerAllowHttpImageRequestEnabled = boolValue
		case "DefaultUseAutoGroup":
			setting.DefaultUseAutoGroup = boolValue
		case "ExposeRatioEnabled":
			ratio_setting.SetExposeRatioEnabled(boolValue)
		}
	}
	switch key {
	case "EmailDomainWhitelist":
		common.EmailDomainWhitelist = strings.Split(value, ",")
	case "SMTPServer":
		common.SMTPServer = value
	case "SMTPPort":
		intValue, _ := strconv.Atoi(value)
		common.SMTPPort = intValue
	case "SMTPAccount":
		common.SMTPAccount = value
	case "SMTPFrom":
		common.SMTPFrom = value
	case "SMTPToken":
		common.SMTPToken = value
	case "ServerAddress":
		system_setting.ServerAddress = value
	case "WorkerUrl":
		system_setting.WorkerUrl = value
	case "WorkerValidKey":
		system_setting.WorkerValidKey = value
	case "PayAddress":
		operation_setting.PayAddress = value
	case "Chats":
		err = setting.UpdateChatsByJsonString(value)
	case "AutoGroups":
		err = setting.UpdateAutoGroupsByJsonString(value)
	case "AutoGroupRoutes":
		err = setting.UpdateAutoGroupRoutesByJsonString(value)
	case "MaxTokenAutoGroups":
		err = setting.UpdateMaxTokenAutoGroups(value)
	case "CustomCallbackAddress":
		operation_setting.CustomCallbackAddress = value
	case "EpayId":
		operation_setting.EpayId = value
	case "EpayKey":
		operation_setting.EpayKey = value
	case operation_setting.PaymentGatewayModeOptionKey:
		_, err = operation_setting.NormalizePaymentGatewayMode(value)
	case "Price":
		operation_setting.Price, _ = strconv.ParseFloat(value, 64)
	case "USDExchangeRate":
		operation_setting.USDExchangeRate, _ = strconv.ParseFloat(value, 64)
	case "MinTopUp":
		operation_setting.MinTopUp, _ = strconv.Atoi(value)
	case "StripeApiSecret":
		setting.StripeApiSecret = value
	case "StripeWebhookSecret":
		setting.StripeWebhookSecret = value
	case "StripePriceId":
		setting.StripePriceId = value
	case "StripeUnitPrice":
		setting.StripeUnitPrice, _ = strconv.ParseFloat(value, 64)
	case "StripeMinTopUp":
		setting.StripeMinTopUp, _ = strconv.Atoi(value)
	case "StripePromotionCodesEnabled":
		setting.StripePromotionCodesEnabled = value == "true"
	case "CreemApiKey":
		setting.CreemApiKey = value
	case "CreemProducts":
		setting.CreemProducts = value
	case "CreemTestMode":
		setting.CreemTestMode = value == "true"
	case "CreemWebhookSecret":
		setting.CreemWebhookSecret = value
	case "WechatPayEnabled":
		setting.WechatPayEnabled = value == "true"
	case "WechatPayAppId":
		setting.WechatPayAppId = value
	case "WechatPayAppSecret":
		setting.WechatPayAppSecret = value
	case "WechatPayMchId":
		setting.WechatPayMchId = value
	case "WechatPayApiV3Key":
		setting.WechatPayApiV3Key = value
	case "WechatPayCert":
		setting.WechatPayCert = value
	case "WechatPayCertSerialNo":
		setting.WechatPayCertSerialNo = value
	case "WechatPayPrivateKey":
		setting.WechatPayPrivateKey = value
	case "WechatPayNotifyUrl":
		setting.WechatPayNotifyUrl = value
	case "WechatPayNative":
		setting.WechatPayNative = value == "true"
	case "WechatPayH5":
		setting.WechatPayH5 = value == "true"
	case "WechatPayJSAPI":
		setting.WechatPayJSAPI = value == "true"
	case "WechatPayMinTopUp":
		setting.WechatPayMinTopUp, _ = strconv.Atoi(value)
	case "AlipayEnabled":
		setting.AlipayEnabled = value == "true"
	case "AlipayAppId":
		setting.AlipayAppId = value
	case "AlipayPrivateKey":
		setting.AlipayPrivateKey = value
	case "AlipayPublicKey":
		setting.AlipayPublicKey = value
	case "AlipayProduction":
		setting.AlipayProduction = value == "true"
	case "AlipayMinTopUp":
		setting.AlipayMinTopUp, _ = strconv.Atoi(value)
	case "WaffoEnabled":
		setting.WaffoEnabled = value == "true"
	case "WaffoApiKey":
		setting.WaffoApiKey = value
	case "WaffoPrivateKey":
		setting.WaffoPrivateKey = value
	case "WaffoPublicCert":
		setting.WaffoPublicCert = value
	case "WaffoSandboxPublicCert":
		setting.WaffoSandboxPublicCert = value
	case "WaffoSandboxApiKey":
		setting.WaffoSandboxApiKey = value
	case "WaffoSandboxPrivateKey":
		setting.WaffoSandboxPrivateKey = value
	case "WaffoSandbox":
		setting.WaffoSandbox = value == "true"
	case "WaffoMerchantId":
		setting.WaffoMerchantId = value
	case "WaffoNotifyUrl":
		setting.WaffoNotifyUrl = value
	case "WaffoReturnUrl":
		setting.WaffoReturnUrl = value
	case "WaffoSubscriptionReturnUrl":
		setting.WaffoSubscriptionReturnUrl = value
	case "WaffoCurrency":
		setting.WaffoCurrency = value
	case "WaffoUnitPrice":
		setting.WaffoUnitPrice, _ = strconv.ParseFloat(value, 64)
	case "WaffoMinTopUp":
		setting.WaffoMinTopUp, _ = strconv.Atoi(value)
	case "WaffoPancakeMerchantID":
		setting.WaffoPancakeMerchantID = value
	case "WaffoPancakePrivateKey":
		setting.WaffoPancakePrivateKey = value
	case "WaffoPancakeReturnURL":
		setting.WaffoPancakeReturnURL = value
	case "WaffoPancakeStoreID":
		setting.WaffoPancakeStoreID = value
	case "WaffoPancakeProductID":
		setting.WaffoPancakeProductID = value
	case "WaffoPancakeUnitPrice":
		setting.WaffoPancakeUnitPrice, _ = strconv.ParseFloat(value, 64)
	case "WaffoPancakeMinTopUp":
		setting.WaffoPancakeMinTopUp, _ = strconv.Atoi(value)
	case "TopupGroupRatio":
		err = common.UpdateTopupGroupRatioByJSONString(value)
	case "GitHubClientId":
		common.GitHubClientId = value
	case "GitHubClientSecret":
		common.GitHubClientSecret = value
	case "LinuxDOClientId":
		common.LinuxDOClientId = value
	case "LinuxDOClientSecret":
		common.LinuxDOClientSecret = value
	case "LinuxDOMinimumTrustLevel":
		common.LinuxDOMinimumTrustLevel, _ = strconv.Atoi(value)
	case "Footer":
		common.Footer = value
	case "SystemName":
		common.SystemName = value
	case "Logo":
		common.Logo = value
	case "WeChatServerAddress":
		common.WeChatServerAddress = value
	case "WeChatServerToken":
		common.WeChatServerToken = value
	case "WeChatAccountQRCodeImageURL":
		common.WeChatAccountQRCodeImageURL = value
	case "WeChatMpToken":
		common.WeChatMpToken = value
	case "WeChatMpName":
		common.WeChatMpName = value
	case "WeChatMpAppId":
		common.WeChatMpAppId = value
	case "WeChatMpAppSecret":
		common.WeChatMpAppSecret = value
	case "TelegramBotToken":
		common.TelegramBotToken = value
	case "TelegramBotName":
		common.TelegramBotName = value
	case "TurnstileSiteKey":
		common.TurnstileSiteKey = value
	case "TurnstileSecretKey":
		common.TurnstileSecretKey = value
	case "QuotaForNewUser":
		common.QuotaForNewUser, _ = strconv.Atoi(value)
	case "QuotaForInviter":
		common.QuotaForInviter, _ = strconv.Atoi(value)
	case "QuotaForInvitee":
		common.QuotaForInvitee, _ = strconv.Atoi(value)
	case "RebateRatio":
		common.RebateRatio, _ = strconv.ParseFloat(value, 64)
	case "QuotaRemindThreshold":
		common.QuotaRemindThreshold, _ = strconv.Atoi(value)
	case "quota_reminder.enabled", "QuotaRemindEnabled", "QuotaReminderEnabled":
		common.QuotaRemindEnabled, _ = strconv.ParseBool(value)
	case "PreConsumedQuota":
		common.PreConsumedQuota, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitCount":
		setting.ModelRequestRateLimitCount, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitDurationMinutes":
		setting.ModelRequestRateLimitDurationMinutes, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitSuccessCount":
		setting.ModelRequestRateLimitSuccessCount, _ = strconv.Atoi(value)
	case "ModelRequestRateLimitGroup":
		err = setting.UpdateModelRequestRateLimitGroupByJSONString(value)
	case "RetryTimes":
		common.RetryTimes, _ = strconv.Atoi(value)
	case "DataExportInterval":
		common.DataExportInterval, _ = strconv.Atoi(value)
	case "DataExportDefaultTime":
		common.DataExportDefaultTime = value
	case "ModelRatio":
		err = ratio_setting.UpdateModelRatioByJSONString(value)
	case "GroupRatio":
		err = ratio_setting.UpdateGroupRatioByJSONString(value)
	case "GroupGroupRatio":
		err = ratio_setting.UpdateGroupGroupRatioByJSONString(value)
	case "UserUsableGroups":
		err = setting.UpdateUserUsableGroupsByJSONString(value)
	case "CompletionRatio":
		err = ratio_setting.UpdateCompletionRatioByJSONString(value)
	case "ModelPrice":
		err = ratio_setting.UpdateModelPriceByJSONString(value)
	case "CacheRatio":
		err = ratio_setting.UpdateCacheRatioByJSONString(value)
	case "CreateCacheRatio":
		err = ratio_setting.UpdateCreateCacheRatioByJSONString(value)
	case "ImageRatio":
		err = ratio_setting.UpdateImageRatioByJSONString(value)
	case "AudioRatio":
		err = ratio_setting.UpdateAudioRatioByJSONString(value)
	case "AudioCompletionRatio":
		err = ratio_setting.UpdateAudioCompletionRatioByJSONString(value)
	case "VideoPriceTiers":
		err = ratio_setting.UpdateVideoPriceByJSONString(value)
	case "ImagePriceTiers":
		err = ratio_setting.UpdateImagePriceByJSONString(value)
	case "TopUpLink":
		common.TopUpLink = value
	//case "ChatLink":
	//	common.ChatLink = value
	//case "ChatLink2":
	//	common.ChatLink2 = value
	case "ChannelDisableThreshold":
		common.ChannelDisableThreshold, _ = strconv.ParseFloat(value, 64)
	case "QuotaPerUnit":
		common.QuotaPerUnit, _ = strconv.ParseFloat(value, 64)
	case "SensitiveWords":
		setting.SensitiveWordsFromString(value)
	case "AutomaticDisableKeywords":
		operation_setting.AutomaticDisableKeywordsFromString(value)
	case "AutomaticDisableStatusCodes":
		err = operation_setting.AutomaticDisableStatusCodesFromString(value)
	case "AutomaticRetryStatusCodes":
		err = operation_setting.AutomaticRetryStatusCodesFromString(value)
	case "StreamCacheQueueLength":
		setting.StreamCacheQueueLength, _ = strconv.Atoi(value)
	case "PayMethods":
		err = operation_setting.UpdatePayMethodsByJsonString(value)
	case "WaffoPayMethods":
		// WaffoPayMethods is read directly from OptionMap via setting.GetWaffoPayMethods().
		// The value is already stored in OptionMap at the top of this function (line: common.OptionMap[key] = value).
		// No additional in-memory variable to update.
	}
	return err
}

// handleConfigUpdate 处理分层配置更新，返回是否已处理
func handleConfigUpdate(key, value string) bool {
	if key == operation_setting.ToolPriceOptionKey {
		operation_setting.LoadToolPricesFromJSONString(value)
		return true
	}

	parts := strings.SplitN(key, ".", 2)
	if len(parts) != 2 {
		return false // 不是分层配置
	}

	configName := parts[0]
	configKey := parts[1]

	// 获取配置对象
	cfg := config.GlobalConfig.Get(configName)
	if cfg == nil {
		return false // 未注册的配置
	}

	// 更新配置
	configMap := map[string]string{
		configKey: value,
	}
	config.UpdateConfigFromMap(cfg, configMap)

	// 特定配置的后处理
	if configName == "performance_setting" {
		performance_setting.UpdateAndSync()
	} else if configName == "billing_setting" {
		InvalidatePricingCache()
		ratio_setting.InvalidateExposedDataCache()
	}

	return true // 已处理
}
