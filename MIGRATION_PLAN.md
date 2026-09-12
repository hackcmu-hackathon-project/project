# Auth0 / MongoDB integration

Integrate the login/database foundation from `project-backed` into Rove's existing backend. Keep `/api` routes, `Principal`, MongoDB collection shapes, native Expo PKCE login, rankings, follows, seed scripts, and local development behavior compatible.

Implementation ownership:
- Auth: replace token verification with PyJWT RS256, required issuer/audience/expiry/subject, bounded cached key refresh, controlled errors, and signed-token tests.
- Database/users: preserve Motor to avoid breaking existing aggregate/cursor behavior; guarantee shutdown cleanup; preserve edited profiles during identity sync; test concurrent creation and handle conflicts.
- Client/docs: send only access tokens to the API, preserve native login, document existing environment names and exact callback setup, add isolated test instructions.

Validation: run backend tests in a target-version virtual environment; verify frontend types; independently review the full diff; apply only reviewed changes after checking destination HEAD and working tree. No credentials or live data are copied. No schema or data migration is required.
