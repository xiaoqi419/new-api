package common

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"mime/multipart"
	"net"
	"net/smtp"
	"net/textproto"
	"slices"
	"strings"
	"time"
)

var smtpOperationTimeout = 10 * time.Second

type smtpSafeError struct {
	cause error
}

func (e *smtpSafeError) Error() string {
	if errors.Is(e.cause, context.DeadlineExceeded) {
		return "timeout"
	}
	var netErr net.Error
	if errors.As(e.cause, &netErr) && netErr.Timeout() {
		return "timeout"
	}
	return "failed"
}

func (e *smtpSafeError) Unwrap() error {
	return e.cause
}

func wrapSMTPStageError(stage string, err error) error {
	return fmt.Errorf("SMTP %s %w", stage, &smtpSafeError{cause: err})
}

func generateMessageID() (string, error) {
	split := strings.Split(SMTPFrom, "@")
	if len(split) < 2 {
		return "", fmt.Errorf("invalid SMTP account")
	}
	domain := strings.Split(SMTPFrom, "@")[1]
	return fmt.Sprintf("<%d.%s@%s>", time.Now().UnixNano(), GetRandomString(12), domain), nil
}

func shouldUseSMTPLoginAuth() bool {
	if SMTPForceAuthLogin {
		return true
	}
	return isOutlookServer(SMTPAccount) || slices.Contains(EmailLoginAuthServerList, SMTPServer)
}

func getSMTPAuth() smtp.Auth {
	return AutoSMTPAuth(SMTPAccount, SMTPToken)
}

func shouldAuthenticateSMTP() bool {
	return SMTPAccount != "" && SMTPToken != ""
}

func smtpTLSConfig() *tls.Config {
	return &tls.Config{
		ServerName:         SMTPServer,
		InsecureSkipVerify: SMTPInsecureSkipVerify, // #nosec G402 -- admin-controlled SMTP compatibility option.
	}
}

func newSMTPClient(addr string) (*smtp.Client, error) {
	deadline := time.Now().Add(smtpOperationTimeout)
	ctx, cancel := context.WithDeadline(context.Background(), deadline)
	defer cancel()

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, wrapSMTPStageError("connect", err)
	}
	if err := conn.SetDeadline(deadline); err != nil {
		_ = conn.Close()
		return nil, wrapSMTPStageError("deadline setup", err)
	}

	if SMTPSSLEnabled || (SMTPPort == 465 && !SMTPStartTLSEnabled) {
		tlsConn := tls.Client(conn, smtpTLSConfig())
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			_ = conn.Close()
			return nil, wrapSMTPStageError("implicit TLS handshake", err)
		}
		client, err := smtp.NewClient(tlsConn, SMTPServer)
		if err != nil {
			_ = tlsConn.Close()
			return nil, wrapSMTPStageError("greeting", err)
		}
		return client, nil
	}

	client, err := smtp.NewClient(conn, SMTPServer)
	if err != nil {
		_ = conn.Close()
		return nil, wrapSMTPStageError("greeting", err)
	}

	if SMTPStartTLSEnabled {
		if err := client.Hello("localhost"); err != nil {
			_ = client.Close()
			return nil, wrapSMTPStageError("STARTTLS negotiation", err)
		}
		startTLSSupported, _ := client.Extension("STARTTLS")
		if !startTLSSupported {
			_ = client.Close()
			return nil, fmt.Errorf("SMTP STARTTLS unavailable")
		}
		if err := client.StartTLS(smtpTLSConfig()); err != nil {
			_ = client.Close()
			return nil, wrapSMTPStageError("STARTTLS handshake", err)
		}
	}

	return client, nil
}

func SendEmail(subject string, receiver string, content string) error {
	return sendEmailMessage(subject, receiver, "text/html; charset=UTF-8", []byte(content))
}

// SendEmailWithAlternative sends matching plain-text and HTML bodies as a
// multipart/alternative message. Existing callers can keep using SendEmail
// when only an HTML body is available.
func SendEmailWithAlternative(subject string, receiver string, htmlContent string, textContent string) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	parts := []struct {
		contentType string
		content     string
	}{
		{contentType: "text/plain; charset=UTF-8", content: textContent},
		{contentType: "text/html; charset=UTF-8", content: htmlContent},
	}
	for _, part := range parts {
		header := textproto.MIMEHeader{}
		header.Set("Content-Type", part.contentType)
		header.Set("Content-Transfer-Encoding", "8bit")
		partWriter, err := writer.CreatePart(header)
		if err != nil {
			return fmt.Errorf("create email body: %w", err)
		}
		if _, err := partWriter.Write([]byte(part.content)); err != nil {
			return fmt.Errorf("write email body: %w", err)
		}
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("close email body: %w", err)
	}
	return sendEmailMessage(subject, receiver, fmt.Sprintf("multipart/alternative; boundary=%q", writer.Boundary()), body.Bytes())
}

func sendEmailMessage(subject string, receiver string, contentType string, body []byte) error {
	if SMTPFrom == "" { // for compatibility
		SMTPFrom = SMTPAccount
	}
	id, err2 := generateMessageID()
	if err2 != nil {
		return err2
	}
	if SMTPServer == "" && SMTPAccount == "" {
		return fmt.Errorf("SMTP 服务器未配置")
	}
	encodedSubject := fmt.Sprintf("=?UTF-8?B?%s?=", base64.StdEncoding.EncodeToString([]byte(subject)))
	header := []byte(fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"Date: %s\r\n"+
		"Message-ID: %s\r\n"+ // 添加 Message-ID 头
		"MIME-Version: 1.0\r\n"+
		"Content-Type: %s\r\n\r\n",
		receiver, SystemName, SMTPFrom, encodedSubject, time.Now().Format(time.RFC1123Z), id, contentType))
	mail := make([]byte, 0, len(header)+len(body)+2)
	mail = append(mail, header...)
	mail = append(mail, body...)
	mail = append(mail, '\r', '\n')
	auth := getSMTPAuth()
	addr := fmt.Sprintf("%s:%d", SMTPServer, SMTPPort)
	to := strings.Split(receiver, ";")
	client, err := newSMTPClient(addr)
	if err != nil {
		return err
	}
	defer client.Close()
	if shouldAuthenticateSMTP() {
		if err = client.Auth(auth); err != nil {
			return wrapSMTPStageError("authentication", err)
		}
	}
	if err = client.Mail(SMTPFrom); err != nil {
		return wrapSMTPStageError("MAIL FROM", err)
	}
	for _, receiver := range to {
		if err = client.Rcpt(receiver); err != nil {
			return wrapSMTPStageError("recipient", err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return wrapSMTPStageError("DATA", err)
	}
	_, err = w.Write(mail)
	if err != nil {
		return wrapSMTPStageError("message body", err)
	}
	err = w.Close()
	if err != nil {
		return wrapSMTPStageError("message completion", err)
	}
	err = client.Quit()
	if err != nil {
		SysError("SMTP QUIT failed")
		return wrapSMTPStageError("QUIT", err)
	}
	return nil
}
