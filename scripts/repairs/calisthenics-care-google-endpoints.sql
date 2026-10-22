-- Targeted, idempotent repair. Run only after explicit production approval.
-- Fill missing URLs only; never select or modify credentials, status or user links.
UPDATE project_oauth_providers
SET authorization_url = CASE WHEN authorization_url IS NULL OR trim(authorization_url) = ''
      THEN 'https://accounts.google.com/o/oauth2/v2/auth' ELSE authorization_url END,
    token_url = CASE WHEN token_url IS NULL OR trim(token_url) = ''
      THEN 'https://oauth2.googleapis.com/token' ELSE token_url END,
    user_info_url = CASE WHEN user_info_url IS NULL OR trim(user_info_url) = ''
      THEN 'https://www.googleapis.com/oauth2/v2/userinfo' ELSE user_info_url END
WHERE project_id = 'calisthenics_care' AND provider_name = 'google'
  AND (authorization_url IS NULL OR trim(authorization_url) = ''
    OR token_url IS NULL OR trim(token_url) = ''
    OR user_info_url IS NULL OR trim(user_info_url) = '');
