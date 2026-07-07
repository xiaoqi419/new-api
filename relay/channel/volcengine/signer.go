package volcengine

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// SignRequestV4 对火山引擎顶层 OpenAPI 请求做 V4 (HMAC-SHA256) 签名。
//
// 与 relay/channel/jimeng/sign.go 同一套算法，但把写死的 region/service 抽成参数，
// 并直接接收 AK/SK 与已序列化的 body，便于素材库等场景复用：
// 素材库使用 region=cn-beijing、service=ark、host=open.volcengineapi.com。
func SignRequestV4(req *http.Request, bodyBytes []byte, accessKey, secretKey, region, service string) {
	payloadHash := sha256.Sum256(bodyBytes)
	hexPayloadHash := hex.EncodeToString(payloadHash[:])

	t := time.Now().UTC()
	xDate := t.Format("20060102T150405Z")
	shortDate := t.Format("20060102")

	host := req.URL.Host
	header := req.Header
	header.Set("Host", host)
	header.Set("X-Date", xDate)
	header.Set("X-Content-Sha256", hexPayloadHash)
	if header.Get("Content-Type") == "" {
		header.Set("Content-Type", "application/json")
	}

	queryParams := req.URL.Query()
	sortedKeys := make([]string, 0, len(queryParams))
	for k := range queryParams {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)
	var queryParts []string
	for _, k := range sortedKeys {
		values := queryParams[k]
		sort.Strings(values)
		for _, v := range values {
			queryParts = append(queryParts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	canonicalQueryString := strings.Join(queryParts, "&")

	headersToSign := map[string]string{
		"host":             host,
		"x-date":           xDate,
		"x-content-sha256": hexPayloadHash,
		"content-type":     header.Get("Content-Type"),
	}
	signedHeaderKeys := make([]string, 0, len(headersToSign))
	for k := range headersToSign {
		signedHeaderKeys = append(signedHeaderKeys, k)
	}
	sort.Strings(signedHeaderKeys)
	var canonicalHeaders strings.Builder
	for _, k := range signedHeaderKeys {
		canonicalHeaders.WriteString(k)
		canonicalHeaders.WriteString(":")
		canonicalHeaders.WriteString(strings.TrimSpace(headersToSign[k]))
		canonicalHeaders.WriteString("\n")
	}
	signedHeaders := strings.Join(signedHeaderKeys, ";")

	path := req.URL.Path
	if path == "" {
		path = "/"
	}
	canonicalRequest := strings.Join([]string{
		req.Method,
		path,
		canonicalQueryString,
		canonicalHeaders.String(),
		signedHeaders,
		hexPayloadHash,
	}, "\n")

	hashedCanonical := sha256.Sum256([]byte(canonicalRequest))
	hexHashedCanonical := hex.EncodeToString(hashedCanonical[:])

	credentialScope := shortDate + "/" + region + "/" + service + "/request"
	stringToSign := "HMAC-SHA256\n" + xDate + "\n" + credentialScope + "\n" + hexHashedCanonical

	kDate := signV4HMAC([]byte(secretKey), []byte(shortDate))
	kRegion := signV4HMAC(kDate, []byte(region))
	kService := signV4HMAC(kRegion, []byte(service))
	kSigning := signV4HMAC(kService, []byte("request"))
	signature := hex.EncodeToString(signV4HMAC(kSigning, []byte(stringToSign)))

	authorization := "HMAC-SHA256 Credential=" + accessKey + "/" + credentialScope +
		", SignedHeaders=" + signedHeaders + ", Signature=" + signature
	header.Set("Authorization", authorization)
}

func signV4HMAC(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}
