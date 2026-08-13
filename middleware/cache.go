package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func Cache() func(c *gin.Context) {
	return func(c *gin.Context) {
		switch {
		case c.Request.RequestURI == "/":
			c.Header("Cache-Control", "no-cache")
		// Everything the frontend build emits under /static carries a content
		// hash in its filename, so a changed file always arrives under a new URL
		// and the old one can be pinned for good.
		case strings.HasPrefix(c.Request.URL.Path, "/static/"):
			c.Header("Cache-Control", "max-age=31536000, immutable") // one year
		default:
			// Names like /logo.png stay stable across uploads, so they must keep
			// revalidating on a human timescale.
			c.Header("Cache-Control", "max-age=604800") // one week
		}
		c.Header("Cache-Version", "b688f2fb5be447c25e5aa3bd063087a83db32a288bf6a4f35f2d8db310e40b14")
		c.Next()
	}
}
