package common

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/smtp"
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
	mail := []byte(fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"Date: %s\r\n"+
		"Message-ID: %s\r\n"+ // 添加 Message-ID 头
		"Content-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n",
		receiver, SystemName, SMTPFrom, encodedSubject, time.Now().Format(time.RFC1123Z), id, content))
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
