package service

import (
	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"testing"
)

func TestImageWalletReserveRefundPreservesAllSuccessfulReservations(t *testing.T) {
	for _, tc := range []struct {
		name             string
		tokenQuota       int
		wantReserveError bool
	}{
		{"upstream_failure_after_extra_reserve", 200, false},
		{"token_extra_reserve_failure", 110, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			previousRedis, previousBatch := common.RedisEnabled, common.BatchUpdateEnabled
			common.RedisEnabled, common.BatchUpdateEnabled = false, false
			t.Cleanup(func() { common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch })
			const userID, tokenID = 9801, 9801
			seedUser(t, userID, 1000)
			seedToken(t, tokenID, userID, "image-reserve-test-key", tc.tokenQuota)
			info := &relaycommon.RelayInfo{UserId: userID, TokenId: tokenID, TokenKey: "image-reserve-test-key", ImageRequestCount: 1, ForcePreConsume: true}
			funding := &WalletFunding{userId: userID}
			session := &BillingSession{relayInfo: info, funding: funding}
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			require.Nil(t, session.preConsume(c, 100))
			assert.Equal(t, 900, getUserQuota(t, userID))
			err := session.Reserve(150)
			if tc.wantReserveError {
				require.Error(t, err)
				assert.Equal(t, 900, getUserQuota(t, userID), "failed token reservation must roll back only the extra wallet debit")
			} else {
				require.NoError(t, err)
				assert.Equal(t, 850, getUserQuota(t, userID))
			}
			// This is the wallet refund invoked by BillingSession.Refund after an
			// upstream failure; test the synchronous boundary to avoid timing sleeps.
			require.NoError(t, funding.Refund())
			assert.Equal(t, 1000, getUserQuota(t, userID), "refund must restore the initial and every successful extra reservation")
		})
	}
}
