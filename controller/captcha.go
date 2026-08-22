package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/captcha"
	"github.com/gin-gonic/gin"
)

// GetCaptcha issues a click captcha challenge. The expected click positions stay
// on the server; the client only receives the image and the prompt order.
func GetCaptcha(c *gin.Context) {
	if !common.ClickCaptchaEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "图形验证未启用",
		})
		return
	}

	challenge, err := captcha.Generate()
	if err != nil {
		common.SysError("failed to generate click captcha: " + err.Error())
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "图形验证码生成失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    challenge,
	})
}
