-- Read-only preflight/postflight. Never SELECT * or select client_secret.
SELECT COUNT(*) AS matching_providers
FROM project_oauth_providers
WHERE project_id = 'calisthenics_care' AND provider_name = 'google';
SELECT id, project_id, provider_name, enabled,
       authorization_url, token_url, user_info_url
FROM project_oauth_providers
WHERE project_id = 'calisthenics_care' AND provider_name = 'google';
SELECT id, user_table_name, redirect_urls
FROM projects WHERE id = 'calisthenics_care';
