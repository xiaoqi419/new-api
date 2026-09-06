package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// passwordEncryptionOptionKey stores the internal login key in the existing
// options table so enabling transport encryption does not change the schema.
// The "Key" suffix is filtered from administrator option responses.
const passwordEncryptionOptionKey = "__internal.PasswordLoginRSAKey"

// InitPasswordEncryption loads the shared login-encryption key from the
// existing options store. Concurrent replicas converge through the option
// primary key and an insert-on-conflict no-op.
func InitPasswordEncryption() error {
	var stored Option
	queryErr := DB.Where("key = ?", passwordEncryptionOptionKey).First(&stored).Error
	if queryErr == nil {
		if err := common.LoadPasswordEncryptionPrivateKey(stored.Value); err != nil {
			return fmt.Errorf("load persisted password encryption key: %w", err)
		}
		return nil
	}
	if !errors.Is(queryErr, gorm.ErrRecordNotFound) {
		return fmt.Errorf("read password encryption key: %w", queryErr)
	}

	privateKeyPEM, err := common.GeneratePasswordEncryptionPrivateKey()
	if err != nil {
		return err
	}
	candidate := Option{
		Key:   passwordEncryptionOptionKey,
		Value: privateKeyPEM,
	}
	if err := DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoNothing: true,
	}).Create(&candidate).Error; err != nil {
		return fmt.Errorf("persist password encryption key: %w", err)
	}

	if err := DB.Where("key = ?", passwordEncryptionOptionKey).First(&stored).Error; err != nil {
		return fmt.Errorf("reload password encryption key: %w", err)
	}
	if err := common.LoadPasswordEncryptionPrivateKey(stored.Value); err != nil {
		return fmt.Errorf("load persisted password encryption key: %w", err)
	}
	return nil
}
