package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBillingReservationUnavailableReturns503(t *testing.T) {
	server := miniredis.RunT(t)
	server.SetError("ERR reservation unavailable")
	previousRedis, previousClient := common.RedisEnabled, common.RDB
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr(), MaxRetries: -1})
	t.Cleanup(func() {
		_ = common.RDB.Close()
		common.RedisEnabled, common.RDB = previousRedis, previousClient
	})
	for _, stage := range []string{"token_initial", "wallet_initial", "token_adjustment", "wallet_adjustment"} {
		t.Run(stage, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", nil)
			session := &BillingSession{funding: &WalletFunding{userId: 123}, relayInfo: &relaycommon.RelayInfo{UserId: 123, TokenId: 456, TokenKey: "test-key", ForcePreConsume: true}}
			var err error
			switch stage {
			case "token_initial":
				err = session.preConsume(ctx, 10)
			case "wallet_initial":
				session.relayInfo.IsPlayground = true
				err = session.preConsume(ctx, 10)
			case "token_adjustment":
				err = session.reserveToken(10)
			case "wallet_adjustment":
				err = session.reserveFunding(10, true)
			}
			require.Error(t, err)
			var apiErr *types.NewAPIError
			require.ErrorAs(t, err, &apiErr)
			assert.Equal(t, http.StatusServiceUnavailable, apiErr.StatusCode)
			assert.ErrorIs(t, apiErr.Err, model.ErrQuotaReservationUnavailable)
			assert.Zero(t, session.GetPreConsumedQuota())
			assert.Zero(t, session.funding.(*WalletFunding).consumed)
		})
	}
}
