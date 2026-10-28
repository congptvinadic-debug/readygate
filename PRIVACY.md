# ReadyGate privacy statement

ReadyGate runs entirely on Atlassian Forge. It makes no calls to external servers and sends no data outside your Atlassian site.

- **Data read:** the issue being checked (summary, description, fields, recent comments, attachment names), through the Jira REST API with the permissions of the user who invokes it.
- **Data stored:** the Definition of Ready policy per project and a cached field-id map, in Forge storage on Atlassian infrastructure. No issue content is stored.
- **Data written:** only when a user confirms: sections appended to an issue description, labels, or a comment.
- **AI processing:** drafting is done by Atlassian Rovo under your site's Rovo settings. The readiness check itself is a deterministic rule engine with no AI.
- **Third parties:** none.

Contact: https://github.com/congptvinadic-debug/readygate/issues
