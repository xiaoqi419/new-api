package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const paymentGatewayModeApplyAuditAction = "option.payment_gateway_mode_apply"

// GetPaymentGatewayModeStatus is deliberately mounted behind RootAuth.  The
// response contains process and deployment capability state that is useful to
// a root operator but should not be exposed to ordinary dashboard users.
func GetPaymentGatewayModeStatus(c *gin.Context) {
	targetMode, err := paymentGatewayModeStatusTarget(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    service.PaymentGatewayModeApplyReasonInvalidRequest,
			"message": "invalid payment gateway mode status target",
		})
		return
	}

	status, err := service.GetPaymentGatewayModeStatusForTarget(targetMode)
	if err != nil {
		// Do not echo database driver errors: they can contain connection
		// addresses or other deployment details.  The bounded capability state
		// is still useful to the root UI when available.
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"message": "payment gateway mode status is temporarily unavailable",
			"data":    status,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    status,
	})
}

func paymentGatewayModeStatusTarget(c *gin.Context) (string, error) {
	// Keep the status contract as narrow as the apply body: exactly one query
	// parameter, with one exact value from the supported mode enum.  Rejecting
	// extras and duplicates prevents callers from smuggling an arbitrary target
	// or relying on framework-specific first-value behavior.
	values := c.Request.URL.Query()
	targetValues, ok := values["target_mode"]
	if !ok || len(targetValues) != 1 || len(values) != 1 {
		return "", service.ErrPaymentGatewayModeApplyInvalidRequest
	}
	targetMode := targetValues[0]
	if err := service.ValidatePaymentGatewayModeStatusTarget(targetMode); err != nil {
		return "", err
	}
	return targetMode, nil
}

func paymentGatewayModeApplyAudit(c *gin.Context, audit service.PaymentGatewayModeApplyAudit) error {
	params := map[string]interface{}{
		"request_id":         audit.RequestID,
		"old_desired_mode":   audit.OldDesiredMode,
		"old_effective_mode": audit.OldEffectiveMode,
		"target_mode":        audit.TargetMode,
		"result":             audit.Result,
	}
	if audit.Reason != "" {
		params["reason"] = audit.Reason
	}
	err := model.RecordOperationAuditLogWithError(
		c.GetInt("id"),
		auditContentEN(paymentGatewayModeApplyAuditAction, params),
		c.ClientIP(),
		paymentGatewayModeApplyAuditAction,
		params,
		auditOperatorInfo(c),
		map[string]interface{}{
			"method":  c.Request.Method,
			"route":   c.FullPath(),
			"path":    c.Request.URL.Path,
			"status":  http.StatusAccepted,
			"success": true,
		},
	)
	if err == nil {
		markAuditLogged(c)
	}
	return err
}

// ApplyPaymentGatewayMode accepts only the fixed request schema.  The
// shutdown trigger is called in a separate goroutine after the response has
// been written and flushed, so a client receives an accepted result before the
// current process begins graceful shutdown.
func ApplyPaymentGatewayMode(c *gin.Context) {
	var request service.PaymentGatewayModeApplyRequest
	if err := common.DecodeJsonStrict(c.Request.Body, &request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    service.PaymentGatewayModeApplyReasonInvalidRequest,
			"message": service.ErrPaymentGatewayModeApplyInvalidRequest.Error(),
		})
		return
	}

	result := service.ApplyPaymentGatewayMode(request, func(audit service.PaymentGatewayModeApplyAudit) error {
		return paymentGatewayModeApplyAudit(c, audit)
	})

	switch result.Outcome {
	case service.PaymentGatewayModeApplyOutcomeAccepted:
		c.JSON(http.StatusAccepted, gin.H{
			"success": true,
			"message": result.Message,
			"data":    result,
		})
		flushPaymentGatewayModeApplyResponse(c)
		if result.TriggerPending {
			service.CompletePaymentGatewayModeApply(result.RequestID)
		}
		return
	case service.PaymentGatewayModeApplyOutcomeAlreadyApplied:
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": result.Message,
			"data":    result,
		})
		return
	case service.PaymentGatewayModeApplyOutcomeConflict:
		c.JSON(http.StatusConflict, gin.H{
			"success": false,
			"code":    result.Code,
			"message": result.Message,
			"data":    result,
		})
		return
	default:
		statusCode := http.StatusConflict
		if result.Code == service.PaymentGatewayModeApplyReasonInvalidRequest {
			statusCode = http.StatusBadRequest
		}
		c.JSON(statusCode, gin.H{
			"success": false,
			"code":    result.Code,
			"message": result.Message,
			"data":    result,
		})
	}
}

func flushPaymentGatewayModeApplyResponse(c *gin.Context) {
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
}
