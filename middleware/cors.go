package middleware

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

var h5CORSOrigins = []string{
	"https://aierxin.cc",
	"https://codezip.io",
}

var h5CORSHeaders = []string{
	"Origin",
	"Accept",
	"Content-Type",
	"Authorization",
	"Cache-Control",
	"X-Auth-Session",
	"X-Security-Proof",
	"X-Requested-With",
}

var h5CORSMethods = []string{
	"GET",
	"POST",
	"PUT",
	"PATCH",
	"DELETE",
	"HEAD",
	"OPTIONS",
}

func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	legacy := cors.New(config)
	h5 := H5CORS()
	return func(c *gin.Context) {
		if isH5Origin(c.GetHeader("Origin")) {
			h5(c)
			return
		}
		legacy(c)
	}
}

func isH5Origin(origin string) bool {
	origin = strings.TrimSpace(origin)
	for _, allowed := range h5CORSOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

// H5CORS allows the unified H5 frontend to call the API from either public
// site while preserving cookie-based authentication. Keep this separate from
// CORS so legacy dashboard and relay routes retain their existing behavior.
func H5CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	config.AllowOrigins = h5CORSOrigins
	config.AllowCredentials = true
	config.AllowMethods = h5CORSMethods
	config.AllowHeaders = h5CORSHeaders
	return cors.New(config)
}

func Version() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-New-Api-Version", common.Version)
		c.Next()
	}
}
