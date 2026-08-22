package model

import "time"

// VolcAssetGroup 记录每个用户在火山私域素材库中的归属素材组（一人一组）。
// 火山不接受任意 ProjectName（项目须预先创建），故隔离改由本地归属实现：
// 用户只能看到/操作自己组下的素材。
type VolcAssetGroup struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	UserId      int    `json:"user_id" gorm:"uniqueIndex"`
	ChannelId   int    `json:"channel_id"`
	GroupId     string `json:"group_id" gorm:"type:varchar(128)"`
	ProjectName string `json:"project_name" gorm:"type:varchar(128)"`
	CreatedTime int64  `json:"created_time"`
}

// VolcAsset 记录用户上传到火山私域素材库的单个素材（人脸/形象图）。
// 本地保存归属关系与状态，控制台只展示本人素材。
type VolcAsset struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	UserId      int    `json:"user_id" gorm:"index"`
	ChannelId   int    `json:"channel_id"`
	GroupId     string `json:"group_id" gorm:"type:varchar(128)"`
	AssetId     string `json:"asset_id" gorm:"type:varchar(128);index"`
	Name        string `json:"name" gorm:"type:varchar(255)"`
	AssetType   string `json:"asset_type" gorm:"type:varchar(32)"`
	Status      string `json:"status" gorm:"type:varchar(32)"`
	Url         string `json:"url" gorm:"type:text"`
	CreatedTime int64  `json:"created_time"`
	UpdatedTime int64  `json:"updated_time"`
}

func GetUserVolcAssetGroup(userId int) (*VolcAssetGroup, error) {
	var g VolcAssetGroup
	if err := DB.Where("user_id = ?", userId).First(&g).Error; err != nil {
		return nil, err
	}
	return &g, nil
}

func SaveUserVolcAssetGroup(g *VolcAssetGroup) error {
	g.CreatedTime = time.Now().Unix()
	return DB.Create(g).Error
}

func GetUserVolcAssets(userId int) ([]*VolcAsset, error) {
	var assets []*VolcAsset
	err := DB.Where("user_id = ?", userId).Order("id desc").Find(&assets).Error
	return assets, err
}

func GetUserVolcAssetByAssetId(userId int, assetId string) (*VolcAsset, error) {
	var a VolcAsset
	if err := DB.Where("user_id = ? AND asset_id = ?", userId, assetId).First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// GetUserVolcAssetByUrl 按原始图片 URL 查用户最近一条素材，用于自动入库去重。
func GetUserVolcAssetByUrl(userId int, url string) (*VolcAsset, error) {
	var a VolcAsset
	if err := DB.Where("user_id = ? AND url = ?", userId, url).Order("id desc").First(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (a *VolcAsset) Insert() error {
	now := time.Now().Unix()
	a.CreatedTime = now
	a.UpdatedTime = now
	return DB.Create(a).Error
}

func UpdateVolcAssetStatus(id int, status, url string) error {
	updates := map[string]any{"status": status, "updated_time": time.Now().Unix()}
	if url != "" {
		updates["url"] = url
	}
	return DB.Model(&VolcAsset{}).Where("id = ?", id).Updates(updates).Error
}

func DeleteUserVolcAsset(userId int, assetId string) error {
	return DB.Where("user_id = ? AND asset_id = ?", userId, assetId).Delete(&VolcAsset{}).Error
}
