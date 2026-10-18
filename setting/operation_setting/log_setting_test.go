package operation_setting

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestLogRangeSecondsCannotWrapForStoredSettings(t *testing.T) {
	for _, test := range []struct {
		days    int
		seconds int64
	}{
		{-1, 86400}, {0, 86400}, {365, 365 * 86400}, {math.MaxInt, math.MaxInt64},
	} {
		setting := LogSetting{MaxRangeDays: test.days}
		assert.Equal(t, test.seconds, setting.MaxRangeSeconds())
	}
}
