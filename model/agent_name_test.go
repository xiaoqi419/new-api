/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package model

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 名称与备注列是 varchar(128)/varchar(255)，超长写入在 PostgreSQL 上不是静默截断
// 而是直接报错，原始驱动信息还会被接口原样回给用户。长度必须在入库前收敛。
func TestAgentBeforeSaveBoundsNameAndRemark(t *testing.T) {
	t.Run("trims surrounding whitespace", func(t *testing.T) {
		agent := &Agent{Name: "  小明的 AI 小站  "}
		require.NoError(t, agent.BeforeSave(nil))
		assert.Equal(t, "小明的 AI 小站", agent.Name)
	})

	t.Run("accepts a name at the limit", func(t *testing.T) {
		agent := &Agent{Name: strings.Repeat("店", AgentNameMaxRunes)}
		assert.NoError(t, agent.BeforeSave(nil))
	})

	t.Run("rejects a name past the limit", func(t *testing.T) {
		agent := &Agent{Name: strings.Repeat("店", AgentNameMaxRunes+1)}
		err := agent.BeforeSave(nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "代理名称")
	})

	t.Run("counts characters rather than bytes", func(t *testing.T) {
		// 32 个汉字是 96 字节，按字节算会把合法名称误拒。
		agent := &Agent{Name: strings.Repeat("代", AgentNameMaxRunes)}
		require.Greater(t, len(agent.Name), AgentNameMaxRunes)
		assert.NoError(t, agent.BeforeSave(nil))
	})

	t.Run("rejects a remark past the column width", func(t *testing.T) {
		agent := &Agent{Name: "小站", Remark: strings.Repeat("说", agentRemarkMaxRunes+1)}
		err := agent.BeforeSave(nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "备注")
	})
}
