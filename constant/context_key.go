package constant

type ContextKey string

const (
	ContextKeyTokenCountMeta  ContextKey = "token_count_meta"
	ContextKeyPromptTokens    ContextKey = "prompt_tokens"
	ContextKeyEstimatedTokens ContextKey = "estimated_tokens"

	ContextKeyOriginalModel    ContextKey = "original_model"
	ContextKeyRequestStartTime ContextKey = "request_start_time"

	/* token related keys */
	ContextKeyTokenUnlimited         ContextKey = "token_unlimited_quota"
	ContextKeyTokenKey               ContextKey = "token_key"
	ContextKeyTokenId                ContextKey = "token_id"
	ContextKeyTokenGroup             ContextKey = "token_group"
	ContextKeyTokenSpecificChannelId ContextKey = "specific_channel_id"
	ContextKeyTokenModelLimitEnabled ContextKey = "token_model_limit_enabled"
	ContextKeyTokenModelLimit        ContextKey = "token_model_limit"
	ContextKeyTokenCrossGroupRetry   ContextKey = "token_cross_group_retry"
	ContextKeyTokenAutoGroups        ContextKey = "token_auto_groups"

	/* channel related keys */
	ContextKeyChannelId                ContextKey = "channel_id"
	ContextKeyChannelName              ContextKey = "channel_name"
	ContextKeyChannelCreateTime        ContextKey = "channel_create_time"
	ContextKeyChannelBaseUrl           ContextKey = "base_url"
	ContextKeyChannelType              ContextKey = "channel_type"
	ContextKeyChannelSetting           ContextKey = "channel_setting"
	ContextKeyChannelOtherSetting      ContextKey = "channel_other_setting"
	ContextKeyChannelParamOverride     ContextKey = "param_override"
	ContextKeyChannelHeaderOverride    ContextKey = "header_override"
	ContextKeyChannelOrganization      ContextKey = "channel_organization"
	ContextKeyChannelAutoBan           ContextKey = "auto_ban"
	ContextKeyChannelModelMapping      ContextKey = "model_mapping"
	ContextKeyChannelStatusCodeMapping ContextKey = "status_code_mapping"
	ContextKeyChannelIsMultiKey        ContextKey = "channel_is_multi_key"
	ContextKeyChannelMultiKeyIndex     ContextKey = "channel_multi_key_index"
	ContextKeyChannelKey               ContextKey = "channel_key"

	ContextKeyAutoGroup           ContextKey = "auto_group"
	ContextKeyAutoGroupIndex      ContextKey = "auto_group_index"
	ContextKeyAutoGroupRetryIndex ContextKey = "auto_group_retry_index"

	/* token-level group auto-switch (per-API-Key candidate groups) */
	ContextKeyTokenGroupSwitch               ContextKey = "token_group_switch"
	ContextKeyTokenGroupSwitchCandidates     ContextKey = "token_group_switch_candidates"
	ContextKeyTokenGroupSwitchThreshold      ContextKey = "token_group_switch_threshold"
	ContextKeyTokenGroupSwitchCooldown       ContextKey = "token_group_switch_cooldown"
	ContextKeyChannelFailoverPoolID          ContextKey = "channel_failover_pool_id"
	ContextKeyChannelFailoverPoolType        ContextKey = "channel_failover_pool_type"
	ContextKeyChannelFailoverPoolAllowedIDs  ContextKey = "channel_failover_pool_allowed_ids"
	ContextKeyChannelFailoverPoolExcludedIDs ContextKey = "channel_failover_pool_excluded_ids"
	ContextKeyChannelFailoverPoolTextRequest ContextKey = "channel_failover_pool_text_request"
	// runtime state tracked across retries within a single request
	ContextKeyGroupSwitchIndex ContextKey = "group_switch_index"
	ContextKeyGroupSwitchFail  ContextKey = "group_switch_fail"

	/* user related keys */
	ContextKeyUserId      ContextKey = "id"
	ContextKeyUserSetting ContextKey = "user_setting"
	ContextKeyUserQuota   ContextKey = "user_quota"
	ContextKeyUserStatus  ContextKey = "user_status"
	ContextKeyUserEmail   ContextKey = "user_email"
	ContextKeyUserGroup   ContextKey = "user_group"
	ContextKeyUsingGroup  ContextKey = "group"
	ContextKeyUserName    ContextKey = "username"
	ContextKeyUserAgentId ContextKey = "user_agent_id"

	// ContextKeyTenantAgentId 由 ResolveTenant 中间件按请求域名解析出的代理(租户)ID，0=平台主站。
	ContextKeyTenantAgentId ContextKey = "tenant_agent_id"

	// ContextKeySelfAgentId 由 RequireAgentOwner 中间件解析出的「当前登录 owner 所管理的代理」ID。
	ContextKeySelfAgentId ContextKey = "self_agent_id"

	ContextKeyLocalCountTokens ContextKey = "local_count_tokens"

	ContextKeySystemPromptOverride ContextKey = "system_prompt_override"

	// ContextKeyFileSourcesToCleanup stores file sources that need cleanup when request ends
	ContextKeyFileSourcesToCleanup ContextKey = "file_sources_to_cleanup"

	// ContextKeyAdminRejectReason stores an admin-only reject/block reason extracted from upstream responses.
	// It is not returned to end users, but can be persisted into consume/error logs for debugging.
	ContextKeyAdminRejectReason ContextKey = "admin_reject_reason"

	// ContextKeyLanguage stores the user's language preference for i18n
	ContextKeyLanguage ContextKey = "language"
	ContextKeyIsStream ContextKey = "is_stream"

	// ContextKeyAuditLogged marks that the current request has already recorded
	// a manage/operation audit log inside the handler. When set, the admin-audit
	// fallback in authHelper (finishAdminAudit) skips its record to avoid
	// duplicate entries.
	ContextKeyAuditLogged ContextKey = "audit_logged"

	// Drawing log (image gallery) capture. Set on the image relay path so the
	// consume-log writer can materialize a drawing_logs row and attach the
	// stored thumbnail keys / prompt without coupling service to relay/constant.
	ContextKeyDrawingLogMode    ContextKey = "drawing_log_mode"
	ContextKeyDrawingResultKeys ContextKey = "drawing_result_keys"
	ContextKeyDrawingPrompt     ContextKey = "drawing_prompt"
)
