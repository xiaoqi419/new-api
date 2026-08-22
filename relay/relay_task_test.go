package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	relayconstant "github.com/QuantumNous/new-api/relay/constant"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 未登记 respBuilder 的 relayMode 必须返回 400，而不是对 nil 函数指针发起调用。
// 每新增一个 fetch 端点都要同步登记 fetchRespBuilders，这个测试保证漏登记时
// 得到的是一个明确的错误而不是 panic。
func TestRelayTaskFetchRejectsUnregisteredRelayMode(t *testing.T) {
	gin.SetMode(gin.TestMode)

	for _, relayMode := range []int{
		relayconstant.RelayModeUnknown,
		relayconstant.RelayModeVideoSubmit,
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/v1/videos/task_abc", nil)

		require.NotPanics(t, func() {
			taskErr := RelayTaskFetch(c, relayMode)
			require.NotNil(t, taskErr)
			assert.Equal(t, http.StatusBadRequest, taskErr.StatusCode)
			assert.Equal(t, "invalid_relay_mode", taskErr.Code)
		})
	}
}
