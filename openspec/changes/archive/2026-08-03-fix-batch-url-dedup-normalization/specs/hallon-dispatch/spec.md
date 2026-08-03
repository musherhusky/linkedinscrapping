## MODIFIED Requirements

### Requirement: Hallon's raw response is captured for diagnosis before JSON parsing
Before parsing Hallon's response as JSON, `sendPostToHallon` SHALL log the response's HTTP status, `content-type` header, and the first 300 characters of the raw response body, without altering the existing success/error handling behavior. This logging SHALL NOT consume the response body in a way that prevents the subsequent `response.json()` call from working normally.

#### Scenario: Hallon returns a non-JSON response
- **WHEN** Hallon's response body does not start with `{` or `[`
- **THEN** a warning is logged including the response status, content-type header, and the first 300 characters of the body, before the `response.json()` call that will throw

#### Scenario: Hallon returns a normal JSON response
- **WHEN** Hallon's response is a well-formed JSON object
- **THEN** `response.json()` still succeeds and returns the parsed data exactly as before, unaffected by the added logging
