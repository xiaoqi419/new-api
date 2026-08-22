package common

import (
	"reflect"
	"testing"
)

func TestGetTrustedProxies(t *testing.T) {
	t.Setenv("TRUSTED_PROXIES", "")
	if got := GetTrustedProxies(); !reflect.DeepEqual(got, defaultTrustedProxies) {
		t.Errorf("empty env: got %v, want %v", got, defaultTrustedProxies)
	}

	t.Setenv("TRUSTED_PROXIES", "*")
	if got := GetTrustedProxies(); got != nil {
		t.Errorf("wildcard env: got %v, want nil (trust all)", got)
	}

	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8, 192.168.1.1 ,")
	want := []string{"10.0.0.0/8", "192.168.1.1"}
	if got := GetTrustedProxies(); !reflect.DeepEqual(got, want) {
		t.Errorf("list env: got %v, want %v", got, want)
	}
}
