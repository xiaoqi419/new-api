package middleware

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/captcha"
	"github.com/gin-gonic/gin"
)

// ClickCaptchaCheck guards an endpoint with the self-hosted click captcha.
// It runs alongside TurnstileCheck rather than replacing it, so a deployment
// can enable either, both, or neither.
func ClickCaptchaCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !common.ClickCaptchaEnabled {
			c.Next()
			return
		}

		id := c.Query("captcha_id")
		points, err := parseCaptchaPoints(c.Query("captcha_points"))
		if err != nil || id == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "请先完成图形验证",
			})
			c.Abort()
			return
		}

		if !captcha.Verify(id, points) {
			// The challenge is spent either way, so the client has to fetch a
			// new image; saying so avoids a confusing silent retry.
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "图形验证失败，请重新验证",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// parseCaptchaPoints reads the flat "x,y,x,y,x,y" form used on the query string.
//
// Commas only, deliberately: Go's url.ParseQuery drops any query segment that
// contains a raw semicolon, so a "x,y;x,y" separator silently loses the whole
// parameter for clients that build the URL by hand.
func parseCaptchaPoints(raw string) ([]captcha.Point, error) {
	if raw == "" {
		return nil, strconv.ErrSyntax
	}

	fields := strings.Split(raw, ",")
	if len(fields)%2 != 0 {
		return nil, strconv.ErrSyntax
	}

	points := make([]captcha.Point, 0, len(fields)/2)
	for i := 0; i < len(fields); i += 2 {
		x, err := strconv.Atoi(strings.TrimSpace(fields[i]))
		if err != nil {
			return nil, err
		}
		y, err := strconv.Atoi(strings.TrimSpace(fields[i+1]))
		if err != nil {
			return nil, err
		}
		points = append(points, captcha.Point{X: x, Y: y})
	}
	return points, nil
}
