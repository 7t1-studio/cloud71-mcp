# Privacy Policy — cloud71 MCP connector

_Last updated: 2026-06-14_

The cloud71 MCP connector ("the connector") is operated by 7t1 Studio. It lets an AI
assistant (such as Claude or ChatGPT) deploy files to your cloud71 hosting account on your
behalf. This policy explains what the connector handles and why.

## What we process

- **Your cloud71 identity.** When you connect, you sign in to your existing cloud71 account
  via OAuth. The connector receives your account identifier and a token that authorizes it
  to act for you. We do **not** receive or store your cloud71 password.
- **OAuth grant data.** We store the authorization grant (an encrypted access/refresh token
  and the client your AI assistant registered) so the connection persists between sessions.
  Tokens are encrypted at rest.
- **Files you ask to deploy.** When you invoke a deploy action, the files you provide pass
  through the connector to the cloud71 hosting API. We do not retain a separate copy beyond
  what is needed to complete the request, and the published content lives in your cloud71
  account, governed by [cloud71's privacy policy](https://cloud71.host/privacy).
- **Operational logs.** Minimal request metadata (timestamps, tool name, success/error) may
  be logged for reliability and abuse prevention. We do not log the contents of your files.

## What we do NOT do

- We do not read, scan, or collect content from your AI conversations beyond the specific
  files and parameters you pass to a tool call.
- We do not sell or share your data with third parties for advertising.
- We do not access cloud71 resources beyond the scope you approved at connection time, and
  every action is restricted to **your own** account.

## Retention & deletion

OAuth grants persist until you disconnect the connector (from your Claude/ChatGPT settings
or your cloud71 account), after which the stored tokens are revoked and deleted. Deployed
content is managed entirely within your cloud71 account.

## Your choices

- Disconnect at any time from your AI assistant's connector settings, or revoke access from
  your cloud71 account settings.
- Manage or delete deployed sites from the [cloud71 dashboard](https://app.cloud71.host).

## Contact

Questions or requests: **privacy@cloud71.host**.
